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
