package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/netip"
	"slices"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/linktive/linktive/internal/authutil"
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

func (a *apiHandler) handleAuthConfig(w http.ResponseWriter, r *http.Request) {
	invite := r.URL.Query().Get("invite")
	cfg, err := a.store.GetAuthConfig(r.Context(), invite)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load auth config")
		return
	}
	cfg.SetupTokenRequired = !cfg.HasUsers && a.setupToken != ""
	writeJSON(w, http.StatusOK, cfg)
}

func (a *apiHandler) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email       string `json:"email"`
		Name        string `json:"name"`
		Password    string `json:"password"`
		InviteToken string `json:"invite_token"`
		SetupToken  string `json:"setup_token"`
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

	if len(req.Password) > 72 {
		writeError(w, http.StatusBadRequest, "password must be at most 72 bytes")
		return
	}
	if a.setupToken != "" {
		cfg, err := a.store.GetAuthConfig(r.Context(), "")
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to load setup state")
			return
		}
		expected, supplied := sha256.Sum256([]byte(a.setupToken)), sha256.Sum256([]byte(req.SetupToken))
		if !cfg.HasUsers && subtle.ConstantTimeCompare(expected[:], supplied[:]) != 1 {
			writeError(w, http.StatusForbidden, "a valid setup token is required")
			return
		}
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	user, ws, err := a.store.RegisterUser(r.Context(), req.Email, req.Name, string(hash), req.InviteToken)
	if errors.Is(err, store.ErrRegistrationDisabled) {
		writeError(w, http.StatusForbidden, "registration is currently disabled; an invite link is required")
		return
	}
	if errors.Is(err, store.ErrInvalidInvite) {
		writeError(w, http.StatusBadRequest, "invalid or expired invite link")
		return
	}
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

func (a *apiHandler) loginClientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	peer, err := netip.ParseAddr(host)
	if err != nil || !a.trustedProxies[peer.Unmap()] {
		return host
	}
	for _, header := range slices.Backward(r.Header.Values("X-Forwarded-For")) {
		for _, raw := range slices.Backward(strings.Split(header, ",")) {
			ip, err := netip.ParseAddr(strings.TrimSpace(raw))
			if err != nil || ip.Zone() != "" {
				return host
			}
			if !a.trustedProxies[ip.Unmap()] {
				return ip.Unmap().String()
			}
		}
	}
	return host
}

func (a *apiHandler) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		TOTPCode string `json:"totp_code"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	now := time.Now()
	if !a.authState.allow("ip:"+a.loginClientIP(r), 150, now) || !a.authState.allow("login:"+hashToken(strings.ToLower(strings.TrimSpace(req.Email))), 12, now) {
		w.Header().Set("Retry-After", "300")
		writeError(w, http.StatusTooManyRequests, "too many login attempts; try again in five minutes")
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

	if user.TOTPEnabled {
		if strings.TrimSpace(req.TOTPCode) == "" {
			writeJSON(w, http.StatusOK, map[string]any{"requires_2fa": true})
			return
		}
		if !authutil.VerifyTOTPCode(user.TOTPSecret, req.TOTPCode, time.Now().UTC()) {
			writeError(w, http.StatusUnauthorized, "invalid 2FA verification code")
			return
		}
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

func (a *apiHandler) handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	user, _ := userFromContext(r.Context())
	var req struct {
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Email = strings.TrimSpace(req.Email)
	req.Name = strings.TrimSpace(req.Name)
	if !strings.Contains(req.Email, "@") || req.Name == "" {
		writeError(w, http.StatusBadRequest, "valid email and name are required")
		return
	}

	updated, err := a.store.UpdateUserProfile(r.Context(), user.ID, req.Email, req.Name)
	if errors.Is(err, store.ErrAlreadyExists) {
		writeError(w, http.StatusConflict, "email already in use")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update profile")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": updated})
}

func (a *apiHandler) handleUpdatePassword(w http.ResponseWriter, r *http.Request) {
	user, _ := userFromContext(r.Context())
	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.NewPassword) < 6 {
		writeError(w, http.StatusBadRequest, "new password must be at least 6 characters")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		writeError(w, http.StatusUnauthorized, "current password is incorrect")
		return
	}
	if len(req.NewPassword) > 72 {
		writeError(w, http.StatusBadRequest, "password must be at most 72 bytes")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}
	if err := a.store.UpdateUserPassword(r.Context(), user.ID, string(hash), sessionHash(r)); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update password")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (a *apiHandler) handle2FASetup(w http.ResponseWriter, r *http.Request) {
	user, _ := userFromContext(r.Context())
	var req struct {
		Password string `json:"password"`
		Code     string `json:"code"`
	}
	if err := decodeJSON(r, &req); err != nil || req.Password == "" {
		writeError(w, http.StatusBadRequest, "current password is required")
		return
	}
	now := time.Now()
	if !a.authState.allow("otp:"+user.ID, 12, now) {
		writeError(w, http.StatusTooManyRequests, "too many verification attempts")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) != nil {
		writeError(w, http.StatusUnauthorized, "password is incorrect")
		return
	}
	if user.TOTPEnabled && !authutil.VerifyTOTPCode(user.TOTPSecret, req.Code, now) {
		writeError(w, http.StatusBadRequest, "current 2FA verification code is required")
		return
	}
	secret, err := authutil.GenerateTOTPSecret()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate 2FA secret")
		return
	}
	a.authState.begin(user.ID, sessionHash(r), secret)
	writeJSON(w, http.StatusOK, map[string]string{
		"secret":      secret,
		"otpauth_url": authutil.BuildOTPAuthURL("linktive", user.Email, secret),
	})
}

func (a *apiHandler) handle2FAEnable(w http.ResponseWriter, r *http.Request) {
	user, _ := userFromContext(r.Context())
	var req struct {
		Code string `json:"code"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !a.authState.allow("otp:"+user.ID, 12, time.Now()) {
		writeError(w, http.StatusTooManyRequests, "too many verification attempts")
		return
	}
	secret, ok := a.authState.confirm(user.ID, sessionHash(r), req.Code)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid or expired 2FA setup")
		return
	}
	updated, err := a.store.EnableUserTOTP(r.Context(), user.ID, secret)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to enable 2FA")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": updated})
}

func (a *apiHandler) handle2FADisable(w http.ResponseWriter, r *http.Request) {
	user, _ := userFromContext(r.Context())
	var req struct {
		Password string `json:"password"`
		Code     string `json:"code"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !a.authState.allow("otp:"+user.ID, 12, time.Now()) {
		writeError(w, http.StatusTooManyRequests, "too many verification attempts")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "password is incorrect")
		return
	}
	if user.TOTPEnabled && !authutil.VerifyTOTPCode(user.TOTPSecret, req.Code, time.Now().UTC()) {
		writeError(w, http.StatusBadRequest, "invalid 2FA verification code")
		return
	}
	updated, err := a.store.DisableUserTOTP(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to disable 2FA")
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
