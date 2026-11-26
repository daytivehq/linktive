package httpapi

import (
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/linktive/linktive/internal/domain"
	"github.com/linktive/linktive/internal/search"
	"github.com/linktive/linktive/internal/store"
	"github.com/linktive/linktive/internal/urlutil"
)

func (a *apiHandler) handleListBookmarks(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleViewer) {
		return
	}

	sq := buildSearchQuery(r, wsID)
	res, err := a.store.SearchBookmarks(r.Context(), sq)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to search bookmarks")
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func buildSearchQuery(r *http.Request, wsID string) store.SearchQuery {
	qp := r.URL.Query()
	sq := search.ParseQuery(wsID, qp.Get("q"))
	actor, _ := userFromContext(r.Context())
	sq.ActorID = actor.ID
	sq.Sort = strings.TrimSpace(qp.Get("sort"))
	if sq.Sort == "" {
		if sq.Raw != "" && len(sq.Terms) > 0 {
			sq.Sort = "relevance"
		} else {
			sq.Sort = "newest"
		}
	}

	if colID := strings.TrimSpace(qp.Get("collection_id")); colID != "" {
		sq.CollectionID = &colID
	}
	if qp.Get("include_children") == "true" || qp.Get("include_children") == "1" {
		sq.IncludeSubcollections = true
	}
	if qp.Get("favorite") == "true" || qp.Get("favorite") == "1" {
		t := true
		sq.OnlyFavorite = &t
	}
	if tag := strings.TrimSpace(qp.Get("tag")); tag != "" {
		sq.IncludeTags = append(sq.IncludeTags, strings.ToLower(tag))
	}
	if status := strings.TrimSpace(strings.ToLower(qp.Get("link_status"))); status != "" {
		ls := domain.LinkStatus(status)
		switch ls {
		case domain.LinkStatusUnknown, domain.LinkStatusOK, domain.LinkStatusBroken, domain.LinkStatusBlocked:
			sq.LinkStatus = &ls
		}
	}
	if qp.Get("search_archive") == "true" || qp.Get("search_archive") == "1" {
		sq.IncludeArchiveContent = true
	}
	if limit, err := strconv.Atoi(qp.Get("limit")); err == nil && limit > 0 {
		sq.Limit = limit
	}
	if offset, err := strconv.Atoi(qp.Get("offset")); err == nil && offset >= 0 {
		sq.Offset = offset
	}
	return sq
}

type createBookmarkRequest struct {
	URL            string   `json:"url"`
	Title          string   `json:"title"`
	Description    string   `json:"description"`
	Note           string   `json:"note"`
	CollectionID   *string  `json:"collection_id"`
	Tags           []string `json:"tags"`
	IsFavorite     bool     `json:"is_favorite"`
	AllowDuplicate bool     `json:"allow_duplicate"`
	ClipNow        *bool    `json:"clip_now"`
	ClipFormat     string   `json:"clip_format"`
}

func (a *apiHandler) handleCreateBookmark(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}
	var req createBookmarkRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	a.createBookmarkInWorkspace(w, r, wsID, req)
}

func (a *apiHandler) createBookmarkInWorkspace(w http.ResponseWriter, r *http.Request, wsID string, req createBookmarkRequest) {
	user, _ := userFromContext(r.Context())

	targetURL, err := urlutil.EnsureScheme(req.URL)
	if err != nil {
		writeError(w, http.StatusBadRequest, "valid http/https url is required")
		return
	}
	normalizedURL, hostDomain, err := urlutil.Normalize(targetURL)
	if err != nil {
		writeError(w, http.StatusBadRequest, "valid http/https url is required")
		return
	}

	title := strings.TrimSpace(req.Title)
	description := strings.TrimSpace(req.Description)
	faviconURL := ""
	if title == "" || description == "" {
		meta := urlutil.FetchMetadata(r.Context(), targetURL)
		if title == "" {
			title = meta.Title
		}
		if description == "" {
			description = meta.Description
		}
		faviconURL = meta.FaviconURL
	}
	if faviconURL == "" {
		if parsed, pErr := url.Parse(targetURL); pErr == nil && parsed.Host != "" {
			faviconURL = parsed.Scheme + "://" + parsed.Host + "/favicon.ico"
		}
	}
	if title == "" {
		title = hostDomain
	}

	bm, err := a.store.CreateBookmark(r.Context(), store.CreateBookmarkInput{
		WorkspaceID:    wsID,
		CollectionID:   req.CollectionID,
		CreatedBy:      user.ID,
		URL:            targetURL,
		NormalizedURL:  normalizedURL,
		Domain:         hostDomain,
		Title:          title,
		Description:    description,
		Note:           req.Note,
		FaviconURL:     faviconURL,
		IsFavorite:     req.IsFavorite,
		Tags:           req.Tags,
		AllowDuplicate: req.AllowDuplicate,
	})
	var dupErr *store.DuplicateURLError
	if errors.As(err, &dupErr) {
		if role, err := a.store.GetWorkspaceRole(r.Context(), wsID, user.ID); err != nil || role.RoleLevel() < domain.RoleViewer.RoleLevel() {
			col := dupErr.Existing.CollectionID
			if col == nil {
				writeError(w, http.StatusConflict, "duplicate url exists in workspace")
				return
			}
			if _, err := a.store.GetSharedCollectionAccess(r.Context(), user.ID, *col); err != nil {
				writeError(w, http.StatusConflict, "duplicate url exists in workspace")
				return
			}
		}
		writeJSON(w, http.StatusConflict, map[string]any{
			"error":    "duplicate url exists in workspace",
			"existing": dupErr.Existing,
		})
		return
	}
	if errors.Is(err, store.ErrInvalidParent) {
		writeError(w, http.StatusBadRequest, "invalid collection_id")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create bookmark")
		return
	}

	shouldClip := parseUserClipMode(user) == "auto"
	if req.ClipNow != nil {
		shouldClip = *req.ClipNow
	}
	if shouldClip && a.clipper != nil {
		format := parseUserClipFormat(user)
		if strings.TrimSpace(req.ClipFormat) != "" {
			format = req.ClipFormat
		}
		bm.ArchiveStatus = a.clipper.EnqueueClipWithMode(r.Context(), wsID, bm.ID, user.ID, bm.URL, format)
	}

	writeJSON(w, http.StatusCreated, bm)
}

func (a *apiHandler) handleGetBookmark(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	bmID := chi.URLParam(r, "bmID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleViewer) {
		return
	}
	bm, err := a.store.GetBookmark(r.Context(), wsID, bmID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "bookmark not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch bookmark")
		return
	}
	writeJSON(w, http.StatusOK, bm)
}

func (a *apiHandler) handleUpdateBookmark(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	bmID := chi.URLParam(r, "bmID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}
	a.updateBookmarkInWorkspace(w, r, wsID, bmID, true)
}

func (a *apiHandler) updateBookmarkInWorkspace(w http.ResponseWriter, r *http.Request, wsID, bmID string, allowMove bool) {
	var raw map[string]any
	if err := decodeJSON(r, &raw); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	actor, _ := userFromContext(r.Context())
	input := store.UpdateBookmarkInput{
		ActorID:     actor.ID,
		WorkspaceID: wsID,
		BookmarkID:  bmID,
	}

	if allowMove {
		if targetWS, ok := raw["target_workspace_id"].(string); ok && strings.TrimSpace(targetWS) != "" {
			targetWS = strings.TrimSpace(targetWS)
			if !a.authorizeWorkspace(w, r, targetWS, domain.RoleEditor) {
				return
			}
			input.TargetWorkspaceID = &targetWS
		}

		if colVal, exists := raw["collection_id"]; exists {
			if colVal == nil || colVal == "" {
				input.ClearCollection = true
			} else if s, ok := colVal.(string); ok {
				input.CollectionID = &s
			}
		}
	}

	if u, ok := raw["url"].(string); ok && strings.TrimSpace(u) != "" {
		fixedURL, err := urlutil.EnsureScheme(u)
		if err != nil {
			writeError(w, http.StatusBadRequest, "valid http/https url is required")
			return
		}
		norm, dom, err := urlutil.Normalize(fixedURL)
		if err != nil {
			writeError(w, http.StatusBadRequest, "valid http/https url is required")
			return
		}
		input.URL = &fixedURL
		input.NormalizedURL = &norm
		input.Domain = &dom
	}
	if v, ok := raw["title"].(string); ok {
		input.Title = &v
	}
	if v, ok := raw["description"].(string); ok {
		input.Description = &v
	}
	if v, ok := raw["note"].(string); ok {
		input.Note = &v
	}
	if v, ok := raw["is_favorite"].(bool); ok {
		input.IsFavorite = &v
	}
	if rawTags, exists := raw["tags"]; exists {
		input.ReplaceTags = true
		if arr, ok := rawTags.([]any); ok {
			for _, item := range arr {
				if s, ok := item.(string); ok {
					input.Tags = append(input.Tags, s)
				}
			}
		}
	}

	moving := input.TargetWorkspaceID != nil && *input.TargetWorkspaceID != wsID
	if moving && a.clipper != nil {
		unlock := a.clipper.LockAssets()
		defer unlock()
		if _, err := a.store.GetBookmark(r.Context(), wsID, bmID); err != nil {
			writeError(w, http.StatusNotFound, "bookmark not found")
			return
		}
		if !a.checkArchiveWrite(w, r, wsID, bmID) {
			return
		}
		if err := a.clipper.CopyBookmarkAssets(wsID, *input.TargetWorkspaceID, bmID); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to prepare archive move")
			return
		}
	}
	updated, err := a.store.UpdateBookmark(r.Context(), input)
	if archiveForbidden(w, err) {
		return
	}
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "bookmark not found")
		return
	}
	if errors.Is(err, store.ErrInvalidParent) {
		writeError(w, http.StatusBadRequest, "invalid collection_id")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update bookmark")
		return
	}
	if moving && a.clipper != nil {
		a.clipper.DeleteBookmarkAssets(wsID, bmID)
	}
	writeJSON(w, http.StatusOK, updated)
}

func (a *apiHandler) handleDeleteBookmark(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	bmID := chi.URLParam(r, "bmID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}

	actor, _ := userFromContext(r.Context())
	err := a.store.DeleteBookmark(r.Context(), wsID, bmID, actor.ID)
	if archiveForbidden(w, err) {
		return
	}
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "bookmark not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete bookmark")
		return
	}
	if a.clipper != nil {
		a.clipper.DeleteBookmarkAssets(wsID, bmID)
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (a *apiHandler) handleListTags(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleViewer) {
		return
	}
	items, err := a.store.ListTags(r.Context(), wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list tags")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *apiHandler) handleGetWorkspaceStats(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleViewer) {
		return
	}
	stats, err := a.store.GetWorkspaceStats(r.Context(), wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load workspace stats")
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (a *apiHandler) handleBulkBookmarks(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}
	var req struct {
		BookmarkIDs  []string `json:"bookmark_ids"`
		Action       string   `json:"action"`
		CollectionID *string  `json:"collection_id"`
		Tags         []string `json:"tags"`
	}
	if err := decodeJSON(r, &req); err != nil || len(req.BookmarkIDs) == 0 || req.Action == "" {
		writeError(w, http.StatusBadRequest, "bookmark_ids and action are required")
		return
	}
	actor, _ := userFromContext(r.Context())
	affected, err := a.store.BulkBookmarks(r.Context(), store.BulkBookmarkInput{
		ActorID:      actor.ID,
		WorkspaceID:  wsID,
		BookmarkIDs:  req.BookmarkIDs,
		Action:       req.Action,
		CollectionID: req.CollectionID,
		Tags:         req.Tags,
	})
	if archiveForbidden(w, err) {
		return
	}
	if errors.Is(err, store.ErrInvalidParent) {
		writeError(w, http.StatusBadRequest, "invalid bulk action or collection_id")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "bulk operation failed")
		return
	}
	if req.Action == "delete" && a.clipper != nil {
		for _, bmID := range affected {
			a.clipper.DeleteBookmarkAssets(wsID, bmID)
		}
	}
	writeJSON(w, http.StatusOK, map[string]int{"affected": len(affected)})
}

func (a *apiHandler) handleRenameTag(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	oldName := chi.URLParam(r, "tagName")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}
	if decoded, err := url.PathUnescape(oldName); err == nil {
		oldName = decoded
	}
	var req struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Name) == "" {
		writeError(w, http.StatusBadRequest, "new tag name is required")
		return
	}
	err := a.store.RenameTag(r.Context(), wsID, oldName, req.Name)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "tag not found")
		return
	}
	if errors.Is(err, store.ErrInvalidParent) {
		writeError(w, http.StatusBadRequest, "invalid tag name")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to rename tag")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (a *apiHandler) handleDeleteTag(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	tagName := chi.URLParam(r, "tagName")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}
	if decoded, err := url.PathUnescape(tagName); err == nil {
		tagName = decoded
	}
	err := a.store.DeleteTag(r.Context(), wsID, tagName)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "tag not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete tag")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
