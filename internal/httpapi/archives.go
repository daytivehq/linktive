package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/linktive/linktive/internal/clipper"
	"github.com/linktive/linktive/internal/domain"
	"github.com/linktive/linktive/internal/store"
)

func parseUserSettingMap(user domain.User) map[string]any {
	if strings.TrimSpace(user.SettingsJSON) == "" {
		return map[string]any{}
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(user.SettingsJSON), &m); err != nil || m == nil {
		return map[string]any{}
	}
	return m
}

func parseUserClipMode(user domain.User) string {
	m := parseUserSettingMap(user)
	if v, ok := m["clip_on_save"].(string); ok && v == "auto" {
		return "auto"
	}
	return "manual"
}

func parseUserClipFormat(user domain.User) string {
	m := parseUserSettingMap(user)
	if v, ok := m["clip_format"].(string); ok {
		return clipper.NormalizeArchiveMode(v)
	}
	return clipper.ModeReadable
}

func parseArchiveShareScope(user domain.User) string {
	m := parseUserSettingMap(user)
	if v, ok := m["archive_share_scope"].(string); ok && v == "shared_members" {
		return "shared_members"
	}
	return "owner_only"
}

func (a *apiHandler) canViewArchive(ctx context.Context, actor domain.User, ar domain.BookmarkArchive) bool {
	if ar.CreatedBy == "" || ar.CreatedBy == actor.ID {
		return true
	}
	creator, err := a.store.GetUserByID(ctx, ar.CreatedBy)
	if err != nil {
		return false
	}
	return parseArchiveShareScope(creator) == "shared_members"
}

func (a *apiHandler) checkArchiveWrite(w http.ResponseWriter, r *http.Request, wsID, bmID string) bool {
	actor, _ := userFromContext(r.Context())
	ar, err := a.store.GetBookmarkArchive(r.Context(), wsID, bmID)
	if errors.Is(err, store.ErrNotFound) {
		return true
	}
	if err != nil {
		writeError(w, 500, "failed to check archive")
		return false
	}
	if !a.canViewArchive(r.Context(), actor, ar) {
		archiveForbidden(w, store.ErrPermissionDenied)
		return false
	}
	return true
}

func archiveForbidden(w http.ResponseWriter, err error) bool {
	if !errors.Is(err, store.ErrPermissionDenied) {
		return false
	}
	writeJSON(w, http.StatusForbidden, map[string]string{
		"error": "archive sharing is disabled by its creator",
		"code":  "archive_restricted",
	})
	return true
}

func (a *apiHandler) handleGetBookmarkArchive(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	bmID := chi.URLParam(r, "bmID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleViewer) {
		return
	}
	actor, _ := userFromContext(r.Context())

	ar, err := a.store.GetBookmarkArchive(r.Context(), wsID, bmID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "archive not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load archive")
		return
	}
	if !a.canViewArchive(r.Context(), actor, ar) {
		writeError(w, http.StatusForbidden, "archive sharing is disabled by its creator")
		return
	}
	writeJSON(w, http.StatusOK, ar)
}

func (a *apiHandler) handleArchiveBookmark(w http.ResponseWriter, r *http.Request) {
	if a.clipper == nil {
		writeError(w, http.StatusServiceUnavailable, "clipper is not configured")
		return
	}
	wsID := chi.URLParam(r, "wsID")
	bmID := chi.URLParam(r, "bmID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}
	actor, _ := userFromContext(r.Context())

	bm, err := a.store.GetBookmark(r.Context(), wsID, bmID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "bookmark not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load bookmark")
		return
	}

	select {
	case a.clipRequests <- struct{}{}:
		defer func() { <-a.clipRequests }()
	case <-r.Context().Done():
		return
	}
	if !a.checkArchiveWrite(w, r, wsID, bmID) {
		return
	}
	var req struct {
		HTML     string `json:"html"`
		Mode     string `json:"mode"`
		Merge    bool   `json:"merge"`
		Title    string `json:"title"`
		Byline   string `json:"byline"`
		SiteName string `json:"site_name"`
		Source   string `json:"source"`
	}
	if !readUploadJSON(w, r, &req, 16<<20, true) {
		return
	}

	mode := strings.TrimSpace(req.Mode)
	if mode == "" {
		mode = parseUserClipFormat(actor)
	} else {
		mode = clipper.NormalizeArchiveMode(mode)
	}

	opts := clipper.ClipOptions{Mode: mode, Merge: req.Merge}
	var ar domain.BookmarkArchive
	if strings.TrimSpace(req.HTML) != "" {
		src := strings.TrimSpace(req.Source)
		if src == "" {
			src = "extension"
		}
		ar, err = a.clipper.SaveHTMLWithOptions(r.Context(), wsID, bmID, actor.ID, src, bm.URL, []byte(req.HTML), req.Title, req.Byline, req.SiteName, opts)
	} else {
		ar, err = a.clipper.ClipURLWithOptions(r.Context(), wsID, bmID, actor.ID, bm.URL, opts)
	}
	if archiveForbidden(w, err) {
		return
	}
	if errors.Is(err, store.ErrAlreadyExists) {
		writeError(w, http.StatusConflict, "archive changed during clipping; retry")
		return
	}
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "bookmark was removed or moved")
		return
	}
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{
			"error":   err.Error(),
			"archive": ar,
		})
		return
	}
	writeJSON(w, http.StatusOK, ar)
}

func (a *apiHandler) handleDeleteBookmarkArchive(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	bmID := chi.URLParam(r, "bmID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}
	actor, _ := userFromContext(r.Context())
	err := a.store.DeleteBookmarkArchive(r.Context(), wsID, bmID, actor.ID)
	if archiveForbidden(w, err) {
		return
	}
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "archive not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete archive")
		return
	}
	if a.clipper != nil {
		a.clipper.DeleteBookmarkAssets(wsID, bmID)
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (a *apiHandler) handleServeBookmarkAsset(w http.ResponseWriter, r *http.Request) {
	if a.clipper == nil {
		writeError(w, http.StatusServiceUnavailable, "clipper is not configured")
		return
	}
	wsID := chi.URLParam(r, "wsID")
	bmID := chi.URLParam(r, "bmID")
	filename := chi.URLParam(r, "filename")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleViewer) {
		return
	}
	actor, _ := userFromContext(r.Context())

	ar, err := a.store.GetBookmarkArchive(r.Context(), wsID, bmID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "archive not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to verify archive access")
		return
	}
	if !a.canViewArchive(r.Context(), actor, ar) {
		writeError(w, http.StatusForbidden, "archive sharing is disabled by its creator")
		return
	}

	fullPath, err := a.clipper.ResolveAssetPath(wsID, bmID, filename)
	if err != nil {
		writeError(w, http.StatusNotFound, "asset not found")
		return
	}
	serveArchiveAsset(w, r, fullPath)
}

func serveArchiveAsset(w http.ResponseWriter, r *http.Request, path string) {
	w.Header().Set("Cache-Control", "private, no-cache")
	w.Header().Set("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if strings.HasSuffix(path, ".img") {
		w.Header().Set("Content-Type", "application/octet-stream")
	}
	http.ServeFile(w, r, path)
}

func (a *apiHandler) handleExportBookmarkMarkdown(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	bmID := chi.URLParam(r, "bmID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleViewer) {
		return
	}
	actor, _ := userFromContext(r.Context())

	bm, err := a.store.GetBookmark(r.Context(), wsID, bmID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "bookmark not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load bookmark")
		return
	}

	var ar domain.BookmarkArchive
	if loaded, aErr := a.store.GetBookmarkArchive(r.Context(), wsID, bmID); aErr == nil && loaded.Status == "ready" {
		if a.canViewArchive(r.Context(), actor, loaded) {
			ar = loaded
		}
	}

	safeName := sanitizeFilename(bm.Title)
	if safeName == "" {
		safeName = bm.ID
	}

	forceMDOnly := strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("bundle")), "md")
	if !forceMDOnly && a.clipper != nil && ar.Status == "ready" {
		zipBytes, _, assetCount, bErr := clipper.BuildMarkdownBundle(bm, ar, a.clipper.AssetsDir(), safeName)
		if bErr == nil && assetCount > 0 && len(zipBytes) > 0 {
			encoded := url.PathEscape(safeName + ".zip")
			w.Header().Set("Content-Type", "application/zip")
			w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="archive.zip"; filename*=UTF-8''%s`, encoded))
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(zipBytes)
			return
		}
	}

	md := clipper.BuildMarkdown(bm, ar)
	encoded := url.PathEscape(safeName + ".md")
	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="archive.md"; filename*=UTF-8''%s`, encoded))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(md))
}

func (a *apiHandler) handleGetSharedCollectionBookmarkArchive(w http.ResponseWriter, r *http.Request) {
	colID := chi.URLParam(r, "colID")
	bmID := chi.URLParam(r, "bmID")
	access, ok := a.authorizeSharedCollection(w, r, colID, domain.RoleViewer)
	if !ok {
		return
	}
	actor, _ := userFromContext(r.Context())

	bm, err := a.store.GetBookmark(r.Context(), access.WorkspaceID, bmID)
	if errors.Is(err, store.ErrNotFound) || bm.CollectionID == nil || *bm.CollectionID != colID {
		writeError(w, http.StatusNotFound, "bookmark not found in shared collection")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to verify bookmark")
		return
	}

	ar, err := a.store.GetBookmarkArchive(r.Context(), access.WorkspaceID, bmID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "archive not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load archive")
		return
	}
	if !a.canViewArchive(r.Context(), actor, ar) {
		writeError(w, http.StatusForbidden, "archive sharing is disabled by its creator")
		return
	}

	wsAssetPrefix := fmt.Sprintf("/api/v1/workspaces/%s/bookmarks/%s/assets/", url.PathEscape(access.WorkspaceID), url.PathEscape(bmID))
	sharedAssetPrefix := fmt.Sprintf("/api/v1/shared-collections/%s/bookmarks/%s/assets/", url.PathEscape(colID), url.PathEscape(bmID))
	ar.ContentHTML = strings.ReplaceAll(ar.ContentHTML, wsAssetPrefix, sharedAssetPrefix)
	ar.SnapshotHTML = strings.ReplaceAll(ar.SnapshotHTML, wsAssetPrefix, sharedAssetPrefix)
	writeJSON(w, http.StatusOK, ar)
}

func (a *apiHandler) handleServeSharedCollectionBookmarkAsset(w http.ResponseWriter, r *http.Request) {
	if a.clipper == nil {
		writeError(w, http.StatusServiceUnavailable, "clipper is not configured")
		return
	}
	colID := chi.URLParam(r, "colID")
	bmID := chi.URLParam(r, "bmID")
	filename := chi.URLParam(r, "filename")
	access, ok := a.authorizeSharedCollection(w, r, colID, domain.RoleViewer)
	if !ok {
		return
	}
	actor, _ := userFromContext(r.Context())

	bm, err := a.store.GetBookmark(r.Context(), access.WorkspaceID, bmID)
	if errors.Is(err, store.ErrNotFound) || bm.CollectionID == nil || *bm.CollectionID != colID {
		writeError(w, http.StatusNotFound, "bookmark not found in shared collection")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to verify bookmark")
		return
	}

	ar, err := a.store.GetBookmarkArchive(r.Context(), access.WorkspaceID, bmID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "archive not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to verify archive access")
		return
	}
	if !a.canViewArchive(r.Context(), actor, ar) {
		writeError(w, http.StatusForbidden, "archive sharing is disabled by its creator")
		return
	}

	fullPath, err := a.clipper.ResolveAssetPath(access.WorkspaceID, bmID, filename)
	if err != nil {
		writeError(w, http.StatusNotFound, "asset not found")
		return
	}
	serveArchiveAsset(w, r, fullPath)
}

func (a *apiHandler) handleClearWorkspaceArchives(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}
	actor, _ := userFromContext(r.Context())
	deleted, err := a.store.ClearWorkspaceArchives(r.Context(), wsID, actor.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to clear workspace archives")
		return
	}
	if a.clipper != nil {
		for _, id := range deleted {
			a.clipper.DeleteBookmarkAssets(wsID, id)
		}
	}
	writeJSON(w, http.StatusOK, map[string]int{"deleted": len(deleted)})
}

func (a *apiHandler) handleGetWorkspaceUsage(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleViewer) {
		return
	}
	usage, err := a.store.GetWorkspaceUsage(r.Context(), wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to compute workspace usage")
		return
	}
	writeJSON(w, http.StatusOK, usage)
}

func (a *apiHandler) handleAdminGetUsage(w http.ResponseWriter, r *http.Request) {
	usage, err := a.store.GetAdminUsageSummary(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to compute admin usage")
		return
	}
	if a.clipper != nil {
		a.clipper.EnrichAdminUsage(&usage)
	}
	writeJSON(w, http.StatusOK, usage)
}

func (a *apiHandler) handleAdminUpdateArchiveSettings(w http.ResponseWriter, r *http.Request) {
	var req domain.ArchivePolicy
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.LimitEnabled && (req.MaxAssetMB <= 0 || req.MaxBookmarkMB <= 0) {
		writeError(w, http.StatusBadRequest, "max_asset_mb and max_bookmark_mb must be positive integers")
		return
	}
	if err := a.store.SaveArchivePolicy(r.Context(), req); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save archive policy")
		return
	}
	updated, err := a.store.GetArchivePolicy(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload archive policy")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (a *apiHandler) handleAdminCleanupOrphanAssets(w http.ResponseWriter, r *http.Request) {
	if a.clipper == nil {
		writeError(w, http.StatusServiceUnavailable, "clipper is not configured")
		return
	}
	removedFiles, freedBytes, err := a.clipper.CleanupOrphanAssets(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to cleanup orphan assets")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"removed_files": removedFiles,
		"freed_bytes":   freedBytes,
	})
}

func sanitizeFilename(name string) string {
	cleaned := strings.Map(func(r rune) rune {
		switch r {
		case '/', '\\', ':', '*', '?', '"', '<', '>', '|':
			return '-'
		default:
			return r
		}
	}, strings.TrimSpace(name))
	cleaned = strings.Trim(cleaned, " .-")
	if len(cleaned) > 80 {
		cleaned = string([]rune(cleaned)[:min(40, len([]rune(cleaned)))])
	}
	return cleaned
}
