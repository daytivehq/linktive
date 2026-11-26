package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/linktive/linktive/internal/domain"
	"github.com/linktive/linktive/internal/store"
)

func (a *apiHandler) handleListCollections(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleViewer) {
		return
	}
	items, err := a.store.ListCollections(r.Context(), wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list collections")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *apiHandler) handleCreateCollection(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}
	var req struct {
		ParentID    *string `json:"parent_id"`
		Name        string  `json:"name"`
		Description string  `json:"description"`
		Icon        string  `json:"icon"`
		Color       string  `json:"color"`
	}
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Name) == "" {
		writeError(w, http.StatusBadRequest, "collection name is required")
		return
	}

	col, err := a.store.CreateCollection(r.Context(), store.CreateCollectionInput{
		WorkspaceID: wsID,
		ParentID:    req.ParentID,
		Name:        req.Name,
		Description: req.Description,
		Icon:        req.Icon,
		Color:       req.Color,
	})
	if errors.Is(err, store.ErrInvalidParent) {
		writeError(w, http.StatusBadRequest, "invalid parent collection")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create collection")
		return
	}
	writeJSON(w, http.StatusCreated, col)
}

func (a *apiHandler) handleUpdateCollection(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	colID := chi.URLParam(r, "colID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}

	var req struct {
		ParentID    *string `json:"parent_id"`
		HasParent   bool    `json:"-"`
		Name        *string `json:"name"`
		Description *string `json:"description"`
		Icon        *string `json:"icon"`
		Color       *string `json:"color"`
	}
	// Decode into raw map too so we know whether parent_id was explicitly provided (including null for root move).
	var raw map[string]any
	if err := decodeJSON(r, &raw); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if _, ok := raw["parent_id"]; ok {
		req.HasParent = true
		if v, isStr := raw["parent_id"].(string); isStr {
			req.ParentID = &v
		}
	}
	if v, ok := raw["name"].(string); ok {
		if strings.TrimSpace(v) == "" {
			writeError(w, http.StatusBadRequest, "collection name cannot be empty")
			return
		}
		req.Name = &v
	}
	if v, ok := raw["description"].(string); ok {
		req.Description = &v
	}
	if v, ok := raw["icon"].(string); ok {
		req.Icon = &v
	}
	if v, ok := raw["color"].(string); ok {
		req.Color = &v
	}

	updated, err := a.store.UpdateCollection(r.Context(), store.UpdateCollectionInput{
		WorkspaceID: wsID,
		ID:          colID,
		ParentID:    req.ParentID,
		SetParent:   req.HasParent,
		Name:        req.Name,
		Description: req.Description,
		Icon:        req.Icon,
		Color:       req.Color,
	})
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "collection not found")
		return
	}
	if errors.Is(err, store.ErrInvalidParent) {
		writeError(w, http.StatusBadRequest, "invalid or cyclic parent collection")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update collection")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (a *apiHandler) handleDeleteCollection(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	colID := chi.URLParam(r, "colID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}

	err := a.store.DeleteCollection(r.Context(), wsID, colID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "collection not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete collection")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (a *apiHandler) handleSetCollectionPublic(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	colID := chi.URLParam(r, "colID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	col, err := a.store.SetCollectionPublic(r.Context(), wsID, colID, req.Enabled)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "collection not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update public status")
		return
	}
	writeJSON(w, http.StatusOK, col)
}

func (a *apiHandler) handleGetPublicCollection(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	view, err := a.store.GetPublicCollectionBySlug(r.Context(), slug)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "public collection not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load public collection")
		return
	}
	writeJSON(w, http.StatusOK, view)
}

func (a *apiHandler) handleListCollectionShares(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	colID := chi.URLParam(r, "colID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleViewer) {
		return
	}
	shares, err := a.store.ListCollectionShares(r.Context(), wsID, colID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "collection not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list shares")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": shares})
}

func (a *apiHandler) handleAddCollectionShare(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	colID := chi.URLParam(r, "colID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}
	user, _ := userFromContext(r.Context())

	var req struct {
		TargetType        string            `json:"target_type"`
		TargetEmail       string            `json:"target_email"`
		TargetWorkspaceID string            `json:"target_workspace_id"`
		Role              domain.MemberRole `json:"role"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Role != domain.RoleEditor && req.Role != domain.RoleViewer {
		req.Role = domain.RoleViewer
	}

	share, err := a.store.UpsertCollectionShare(r.Context(), store.CreateCollectionShareInput{
		WorkspaceID:       wsID,
		CollectionID:      colID,
		TargetType:        req.TargetType,
		TargetEmail:       req.TargetEmail,
		TargetWorkspaceID: req.TargetWorkspaceID,
		Role:              req.Role,
		CreatedBy:         user.ID,
	})
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "target user or workspace not found")
		return
	}
	if errors.Is(err, store.ErrInvalidParent) {
		writeError(w, http.StatusBadRequest, "invalid share target")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to share collection")
		return
	}
	writeJSON(w, http.StatusCreated, share)
}

func (a *apiHandler) handleRemoveCollectionShare(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	colID := chi.URLParam(r, "colID")
	shareID := chi.URLParam(r, "shareID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}
	err := a.store.DeleteCollectionShare(r.Context(), wsID, colID, shareID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "share not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove share")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (a *apiHandler) handleListSharedCollections(w http.ResponseWriter, r *http.Request) {
	user, _ := userFromContext(r.Context())
	items, err := a.store.ListSharedCollectionsForUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load shared collections")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *apiHandler) authorizeSharedCollection(w http.ResponseWriter, r *http.Request, colID string, minRole domain.MemberRole) (domain.SharedCollectionView, bool) {
	user, ok := userFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return domain.SharedCollectionView{}, false
	}
	access, err := a.store.GetSharedCollectionAccess(r.Context(), user.ID, colID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "collection not found")
		return domain.SharedCollectionView{}, false
	}
	if errors.Is(err, store.ErrPermissionDenied) {
		writeError(w, http.StatusForbidden, "shared collection access denied")
		return domain.SharedCollectionView{}, false
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to verify shared collection access")
		return domain.SharedCollectionView{}, false
	}
	if access.Role.RoleLevel() < minRole.RoleLevel() {
		writeError(w, http.StatusForbidden, "read-only shared collection")
		return domain.SharedCollectionView{}, false
	}
	return access, true
}

func (a *apiHandler) handleListSharedCollectionBookmarks(w http.ResponseWriter, r *http.Request) {
	colID := chi.URLParam(r, "colID")
	access, ok := a.authorizeSharedCollection(w, r, colID, domain.RoleViewer)
	if !ok {
		return
	}
	sq := buildSearchQuery(r, access.WorkspaceID)
	sq.IncludeSubcollections = false
	sq.CollectionID = &colID
	res, err := a.store.SearchBookmarks(r.Context(), sq)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to search shared collection")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"collection": access,
		"items":      res.Items,
		"total":      res.Total,
	})
}

func (a *apiHandler) handleCreateSharedCollectionBookmark(w http.ResponseWriter, r *http.Request) {
	colID := chi.URLParam(r, "colID")
	access, ok := a.authorizeSharedCollection(w, r, colID, domain.RoleEditor)
	if !ok {
		return
	}
	var req createBookmarkRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.CollectionID = &colID
	a.createBookmarkInWorkspace(w, r, access.WorkspaceID, req)
}

func (a *apiHandler) handleUpdateSharedCollectionBookmark(w http.ResponseWriter, r *http.Request) {
	colID := chi.URLParam(r, "colID")
	bmID := chi.URLParam(r, "bmID")
	access, ok := a.authorizeSharedCollection(w, r, colID, domain.RoleEditor)
	if !ok {
		return
	}
	bm, err := a.store.GetBookmark(r.Context(), access.WorkspaceID, bmID)
	if errors.Is(err, store.ErrNotFound) || bm.CollectionID == nil || *bm.CollectionID != colID {
		writeError(w, http.StatusNotFound, "bookmark not found in shared collection")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to verify bookmark")
		return
	}
	a.updateBookmarkInWorkspace(w, r, access.WorkspaceID, bmID, false)
}

func (a *apiHandler) handleDeleteSharedCollectionBookmark(w http.ResponseWriter, r *http.Request) {
	colID := chi.URLParam(r, "colID")
	bmID := chi.URLParam(r, "bmID")
	access, ok := a.authorizeSharedCollection(w, r, colID, domain.RoleEditor)
	if !ok {
		return
	}
	bm, err := a.store.GetBookmark(r.Context(), access.WorkspaceID, bmID)
	if errors.Is(err, store.ErrNotFound) || bm.CollectionID == nil || *bm.CollectionID != colID {
		writeError(w, http.StatusNotFound, "bookmark not found in shared collection")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to verify bookmark")
		return
	}
	actor, _ := userFromContext(r.Context())
	if err := a.store.DeleteBookmark(r.Context(), access.WorkspaceID, bmID, actor.ID); err != nil {
		if archiveForbidden(w, err) {
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete bookmark")
		return
	}
	if a.clipper != nil {
		a.clipper.DeleteBookmarkAssets(access.WorkspaceID, bmID)
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
