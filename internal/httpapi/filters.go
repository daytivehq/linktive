package httpapi

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/linktive/linktive/internal/domain"
	"github.com/linktive/linktive/internal/store"
)

func (a *apiHandler) handleListSavedFilters(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleViewer) {
		return
	}
	items, err := a.store.ListSavedFilters(r.Context(), wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load saved filters")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *apiHandler) handleCreateSavedFilter(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}
	var req struct {
		Name  string `json:"name"`
		Query string `json:"query"`
		Icon  string `json:"icon"`
		Color string `json:"color"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	item, err := a.store.CreateSavedFilter(r.Context(), wsID, req.Name, req.Query, req.Icon, req.Color)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *apiHandler) handleUpdateSavedFilter(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	filterID := chi.URLParam(r, "filterID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}
	var req struct {
		Name  string `json:"name"`
		Query string `json:"query"`
		Icon  string `json:"icon"`
		Color string `json:"color"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	item, err := a.store.UpdateSavedFilter(r.Context(), wsID, filterID, req.Name, req.Query, req.Icon, req.Color)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "saved filter not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *apiHandler) handleDeleteSavedFilter(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	filterID := chi.URLParam(r, "filterID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}
	err := a.store.DeleteSavedFilter(r.Context(), wsID, filterID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "saved filter not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete saved filter")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
