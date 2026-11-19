package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/linktive/linktive/internal/domain"
	"github.com/linktive/linktive/internal/store"
	"golang.org/x/crypto/bcrypt"
)

const (
	sessionCookieName = "linktive_session"
	sessionDuration   = 30 * 24 * time.Hour
)

type contextKey string

const userContextKey contextKey = "auth_user"

func userFromContext(ctx context.Context) (domain.User, bool) {
	u, ok := ctx.Value(userContextKey).(domain.User)
	return u, ok
}

func (a *apiHandler) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var (
			user domain.User
			err  error
		)

		if authHeader := strings.TrimSpace(r.Header.Get("Authorization")); strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
			token := strings.TrimSpace(authHeader[7:])
			if token != "" {
				user, err = a.store.GetUserByAPIKeyHash(r.Context(), hashToken(token))
			} else {
				err = store.ErrNotFound
			}
		} else if cookie, cErr := r.Cookie(sessionCookieName); cErr == nil && cookie.Value != "" {
			user, err = a.store.GetUserBySessionHash(r.Context(), hashToken(cookie.Value))
		} else {
			err = store.ErrNotFound
		}

		if err != nil {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}

		ctx := context.WithValue(r.Context(), userContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (a *apiHandler) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Name     string `json:"name"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Email = strings.TrimSpace(req.Email)
	req.Name = strings.TrimSpace(req.Name)
	if !strings.Contains(req.Email, "@") || req.Name == "" || len(req.Password) < 6 {
		writeError(w, http.StatusBadRequest, "valid email, name, and password (min 6 chars) are required")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	user, ws, err := a.store.CreateUserWithPersonalWorkspace(r.Context(), req.Email, req.Name, string(hash))
	if errors.Is(err, store.ErrAlreadyExists) {
		writeError(w, http.StatusConflict, "email already registered")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	if err := a.issueSessionCookie(w, r, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"user":       user,
		"workspaces": []domain.Workspace{ws},
	})
}

func (a *apiHandler) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, err := a.store.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	if err := a.issueSessionCookie(w, r, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	workspaces, err := a.store.ListWorkspacesForUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load workspaces")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"user":       user,
		"workspaces": workspaces,
	})
}

func (a *apiHandler) handleLogout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookieName); err == nil && cookie.Value != "" {
		_ = a.store.DeleteSessionByHash(r.Context(), hashToken(cookie.Value))
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isHTTPS(r),
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *apiHandler) handleMe(w http.ResponseWriter, r *http.Request) {
	user, _ := userFromContext(r.Context())
	workspaces, err := a.store.ListWorkspacesForUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load workspaces")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user":       user,
		"workspaces": workspaces,
	})
}

func (a *apiHandler) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	user, _ := userFromContext(r.Context())
	var raw json.RawMessage
	if err := decodeJSON(r, &raw); err != nil || !json.Valid(raw) {
		writeError(w, http.StatusBadRequest, "valid JSON settings object required")
		return
	}

	updated, err := a.store.UpdateUserSettings(r.Context(), user.ID, string(raw))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update settings")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": updated})
}

func (a *apiHandler) handleListAPIKeys(w http.ResponseWriter, r *http.Request) {
	user, _ := userFromContext(r.Context())
	keys, err := a.store.ListAPIKeys(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list api keys")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": keys})
}

func (a *apiHandler) handleCreateAPIKey(w http.ResponseWriter, r *http.Request) {
	user, _ := userFromContext(r.Context())
	var req struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Name) == "" {
		writeError(w, http.StatusBadRequest, "api key name is required")
		return
	}

	rawSecret, err := randomHexToken(24)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate key")
		return
	}
	token := "lkt_" + rawSecret
	key, err := a.store.CreateAPIKey(r.Context(), user.ID, req.Name, hashToken(token))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store api key")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"api_key": key,
		"token":   token,
	})
}

func (a *apiHandler) handleDeleteAPIKey(w http.ResponseWriter, r *http.Request) {
	user, _ := userFromContext(r.Context())
	keyID := chi.URLParam(r, "keyID")
	err := a.store.DeleteAPIKey(r.Context(), user.ID, keyID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "api key not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete api key")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (a *apiHandler) issueSessionCookie(w http.ResponseWriter, r *http.Request, userID string) error {
	rawToken, err := randomHexToken(32)
	if err != nil {
		return err
	}
	expiresAt := time.Now().UTC().Add(sessionDuration)
	if _, err := a.store.CreateSession(r.Context(), userID, hashToken(rawToken), expiresAt); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    rawToken,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isHTTPS(r),
	})
	return nil
}

func randomHexToken(numBytes int) (string, error) {
	buf := make([]byte, numBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func isHTTPS(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}
