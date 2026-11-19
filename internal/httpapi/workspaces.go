package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/linktive/linktive/internal/domain"
	"github.com/linktive/linktive/internal/store"
)

func (a *apiHandler) authorizeWorkspace(w http.ResponseWriter, r *http.Request, workspaceID string, minRole domain.MemberRole) bool {
	user, ok := userFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return false
	}
	role, err := a.store.GetWorkspaceRole(r.Context(), workspaceID, user.ID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusForbidden, "workspace access denied")
		return false
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to verify workspace membership")
		return false
	}
	if role.RoleLevel() < minRole.RoleLevel() {
		writeError(w, http.StatusForbidden, "insufficient workspace permissions")
		return false
	}
	return true
}

func (a *apiHandler) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	user, _ := userFromContext(r.Context())
	items, err := a.store.ListWorkspacesForUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list workspaces")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *apiHandler) handleCreateWorkspace(w http.ResponseWriter, r *http.Request) {
	user, _ := userFromContext(r.Context())
	var req struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Name) == "" {
		writeError(w, http.StatusBadRequest, "workspace name is required")
		return
	}

	ws, err := a.store.CreateSharedWorkspace(r.Context(), user.ID, req.Name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create workspace")
		return
	}
	writeJSON(w, http.StatusCreated, ws)
}

func (a *apiHandler) handleListWorkspaceMembers(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleViewer) {
		return
	}
	members, err := a.store.ListWorkspaceMembers(r.Context(), wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list members")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": members})
}

func (a *apiHandler) handleAddWorkspaceMember(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleOwner) {
		return
	}
	var req struct {
		Email string            `json:"email"`
		Role  domain.MemberRole `json:"role"`
	}
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Email) == "" {
		writeError(w, http.StatusBadRequest, "member email is required")
		return
	}
	if req.Role != domain.RoleEditor && req.Role != domain.RoleViewer {
		req.Role = domain.RoleEditor
	}

	member, err := a.store.AddWorkspaceMemberByEmail(r.Context(), wsID, req.Email, req.Role)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "user with that email was not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to add workspace member")
		return
	}
	writeJSON(w, http.StatusCreated, member)
}

func (a *apiHandler) handleRemoveWorkspaceMember(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	targetUserID := chi.URLParam(r, "userID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleOwner) {
		return
	}

	err := a.store.RemoveWorkspaceMember(r.Context(), wsID, targetUserID)
	if errors.Is(err, store.ErrPermissionDenied) {
		writeError(w, http.StatusBadRequest, "workspace owner cannot be removed")
		return
	}
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "member not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove member")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "removed"})
}
