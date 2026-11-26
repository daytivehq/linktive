package httpapi

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/linktive/linktive/internal/store"
)

func (a *apiHandler) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := userFromContext(r.Context())
		if !ok || !user.IsAdmin {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *apiHandler) handleAdminGetSettings(w http.ResponseWriter, r *http.Request) {
	cfg, err := a.store.GetAuthConfig(r.Context(), "")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load admin settings")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{
		"registration_enabled": cfg.RegistrationEnabled,
	})
}

func (a *apiHandler) handleAdminUpdateSettings(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RegistrationEnabled bool `json:"registration_enabled"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := a.store.SetRegistrationEnabled(r.Context(), req.RegistrationEnabled); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update admin settings")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{
		"registration_enabled": req.RegistrationEnabled,
	})
}

func (a *apiHandler) handleAdminListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := a.store.ListUsers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list users")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": users})
}

func (a *apiHandler) handleAdminUpdateUser(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "userID")
	var req struct {
		IsAdmin bool `json:"is_admin"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	updated, err := a.store.UpdateUserAdmin(r.Context(), targetID, req.IsAdmin)
	if errors.Is(err, store.ErrPermissionDenied) {
		writeError(w, http.StatusBadRequest, "at least one admin must remain")
		return
	}
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update user")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (a *apiHandler) handleAdminDeleteUser(w http.ResponseWriter, r *http.Request) {
	actor, _ := userFromContext(r.Context())
	targetID := chi.URLParam(r, "userID")
	if actor.ID == targetID {
		writeError(w, http.StatusBadRequest, "cannot delete your own account")
		return
	}
	err := a.store.DeleteUser(r.Context(), targetID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete user")
		return
	}
	if a.clipper != nil {
		_, _, _ = a.clipper.CleanupOrphanAssets(r.Context())
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (a *apiHandler) handleAdminListInvites(w http.ResponseWriter, r *http.Request) {
	invites, err := a.store.ListUserInvites(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list invites")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": invites})
}

func (a *apiHandler) handleAdminCreateInvite(w http.ResponseWriter, r *http.Request) {
	actor, _ := userFromContext(r.Context())
	var req struct {
		ExpiresHours int `json:"expires_hours"`
	}
	_ = decodeJSON(r, &req)
	if req.ExpiresHours <= 0 || req.ExpiresHours > 24*30 {
		req.ExpiresHours = 72
	}
	inv, err := a.store.CreateUserInvite(r.Context(), actor.ID, time.Now().UTC().Add(time.Duration(req.ExpiresHours)*time.Hour))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create invite")
		return
	}
	writeJSON(w, http.StatusCreated, inv)
}

func (a *apiHandler) handleAdminDeleteInvite(w http.ResponseWriter, r *http.Request) {
	inviteID := chi.URLParam(r, "inviteID")
	err := a.store.DeleteUserInvite(r.Context(), inviteID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "invite not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete invite")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
