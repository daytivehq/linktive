package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/linktive/linktive/internal/authutil"
	"github.com/linktive/linktive/internal/store/sqlite"
)

func TestAuthBookmarkAndKoreanSearchFlow(t *testing.T) {
	ctx := context.Background()
	st, err := sqlite.Open(ctx, ":memory:")
	if err != nil {
		t.Fatalf("Open(:memory:) failed: %v", err)
	}
	defer func() { _ = st.Close() }()

	staticFS := fstest.MapFS{
		"index.html": {Data: []byte("<html>ok</html>")},
	}
	handler := NewRouter(st, staticFS)

	// Health check.
	rec := doJSON(t, handler, http.MethodGet, "/api/v1/health", nil, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 on health, got %d", rec.Code)
	}

	// Register user + obtain session cookie.
	rec = doJSON(t, handler, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email":    "dev@linktive.local",
		"name":     "개발자",
		"password": "secret-password",
	}, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 on register, got %d: %s", rec.Code, rec.Body.String())
	}
	cookies := rec.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatalf("expected session cookie after register")
	}

	var regResp struct {
		Workspaces []struct {
			ID string `json:"id"`
		} `json:"workspaces"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &regResp); err != nil || len(regResp.Workspaces) == 0 {
		t.Fatalf("failed to parse register response: %v", err)
	}
	wsID := regResp.Workspaces[0].ID

	// Create bookmark with explicit title (avoids external HTTP metadata fetch).
	rec = doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+wsID+"/bookmarks", map[string]any{
		"url":   "https://example.com/statement",
		"title": "거래명세서 포털",
		"note":  "세무 정리용",
		"tags":  []string{"세금"},
	}, cookies)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 on create bookmark, got %d: %s", rec.Code, rec.Body.String())
	}

	// Duplicate URL returns 409 Conflict.
	rec = doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+wsID+"/bookmarks", map[string]any{
		"url":   "https://example.com/statement?utm_source=test",
		"title": "중복 테스트",
	}, cookies)
	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409 on duplicate bookmark, got %d: %s", rec.Code, rec.Body.String())
	}

	// Search by Korean middle substring ("래명세").
	rec = doJSON(t, handler, http.MethodGet, "/api/v1/workspaces/"+wsID+"/bookmarks?q=%EB%9E%98%EB%AA%85%EC%84%B8", nil, cookies)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 on search, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "거래명세서 포털") {
		t.Fatalf("expected Korean substring hit in search body: %s", rec.Body.String())
	}

	// SPA fallback & API 404 check.
	recSPA := doJSON(t, handler, http.MethodGet, "/collections/dev", nil, nil)
	if recSPA.Code != http.StatusOK || !strings.Contains(recSPA.Body.String(), "<html>ok</html>") {
		t.Fatalf("unexpected SPA fallback: code=%d body=%s", recSPA.Code, recSPA.Body.String())
	}
	rec404 := doJSON(t, handler, http.MethodGet, "/api/v1/unknown", nil, cookies)
	if rec404.Code != http.StatusNotFound {
		t.Fatalf("expected 404 on unknown API route, got %d", rec404.Code)
	}
}

func TestTagsBulkWorkspaceAndCollectionSharing(t *testing.T) {
	ctx := context.Background()
	st, err := sqlite.Open(ctx, ":memory:")
	if err != nil {
		t.Fatalf("Open(:memory:) failed: %v", err)
	}
	defer func() { _ = st.Close() }()

	handler := NewRouter(st, fstest.MapFS{"index.html": {Data: []byte("<html>ok</html>")}})

	// Register Owner + Recipient.
	reg1 := doJSON(t, handler, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "owner@linktive.local", "name": "소유자", "password": "password123",
	}, nil)
	cookies1 := reg1.Result().Cookies()
	var r1 struct {
		Workspaces []struct {
			ID string `json:"id"`
		} `json:"workspaces"`
	}
	_ = json.Unmarshal(reg1.Body.Bytes(), &r1)
	ws1 := r1.Workspaces[0].ID

	reg2 := doJSON(t, handler, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "guest@linktive.local", "name": "게스트", "password": "password123",
	}, nil)
	cookies2 := reg2.Result().Cookies()

	// Create shared workspace -> rename -> delete; personal cannot be deleted.
	rec := doJSON(t, handler, http.MethodDelete, "/api/v1/workspaces/"+ws1, nil, cookies1)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 deleting personal workspace, got %d", rec.Code)
	}
	rec = doJSON(t, handler, http.MethodPost, "/api/v1/workspaces", map[string]string{"name": "임시팀"}, cookies1)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating shared workspace, got %d", rec.Code)
	}
	var sharedWS struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &sharedWS)
	rec = doJSON(t, handler, http.MethodPatch, "/api/v1/workspaces/"+sharedWS.ID, map[string]string{"name": "가족팀"}, cookies1)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "가족팀") {
		t.Fatalf("expected workspace rename, got %d: %s", rec.Code, rec.Body.String())
	}
	rec = doJSON(t, handler, http.MethodDelete, "/api/v1/workspaces/"+sharedWS.ID, nil, cookies1)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 deleting shared workspace, got %d", rec.Code)
	}

	// Create collection & bookmarks.
	colRec := doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+ws1+"/collections", map[string]string{
		"name": "공유폴더", "description": "공개 테스트", "icon": "house", "color": "#ff5500",
	}, cookies1)
	var col struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(colRec.Body.Bytes(), &col)

	bmRec := doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+ws1+"/bookmarks", map[string]any{
		"url": "https://example.com/1", "title": "북마크1", "description": "설명", "tags": []string{"옛태그"},
	}, cookies1)
	var bm struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(bmRec.Body.Bytes(), &bm)

	// Bulk move + favorite + tags_add.
	rec = doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+ws1+"/bookmarks/bulk", map[string]any{
		"bookmark_ids": []string{bm.ID}, "action": "move", "collection_id": col.ID,
	}, cookies1)
	if rec.Code != http.StatusOK {
		t.Fatalf("bulk move failed: %d %s", rec.Code, rec.Body.String())
	}
	rec = doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+ws1+"/bookmarks/bulk", map[string]any{
		"bookmark_ids": []string{bm.ID}, "action": "tags_add", "tags": []string{"새태그"},
	}, cookies1)
	if rec.Code != http.StatusOK {
		t.Fatalf("bulk tags_add failed: %d", rec.Code)
	}

	// Rename tag & delete tag.
	rec = doJSON(t, handler, http.MethodPatch, "/api/v1/workspaces/"+ws1+"/tags/%EC%98%9B%ED%83%9C%EA%B7%B8", map[string]string{"name": "변경태그"}, cookies1)
	if rec.Code != http.StatusOK {
		t.Fatalf("rename tag failed: %d %s", rec.Code, rec.Body.String())
	}
	rec = doJSON(t, handler, http.MethodDelete, "/api/v1/workspaces/"+ws1+"/tags/%EC%83%88%ED%83%9C%EA%B7%B8", nil, cookies1)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete tag failed: %d %s", rec.Code, rec.Body.String())
	}

	// Public collection link without login.
	pubRec := doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+ws1+"/collections/"+col.ID+"/public", map[string]bool{"enabled": true}, cookies1)
	if pubRec.Code != http.StatusOK {
		t.Fatalf("set public failed: %d %s", pubRec.Code, pubRec.Body.String())
	}
	var pubCol struct {
		PublicSlug string `json:"public_slug"`
	}
	_ = json.Unmarshal(pubRec.Body.Bytes(), &pubCol)
	rec = doJSON(t, handler, http.MethodGet, "/api/v1/public/collections/"+pubCol.PublicSlug, nil, nil)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "북마크1") {
		t.Fatalf("public collection fetch failed: %d %s", rec.Code, rec.Body.String())
	}

	// Share collection with guest as viewer -> cannot create bookmark (403); upgrade to editor -> can create.
	shareRec := doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+ws1+"/collections/"+col.ID+"/shares", map[string]string{
		"target_type": "user", "target_email": "guest@linktive.local", "role": "viewer",
	}, cookies1)
	if shareRec.Code != http.StatusCreated {
		t.Fatalf("share collection failed: %d %s", shareRec.Code, shareRec.Body.String())
	}
	rec = doJSON(t, handler, http.MethodGet, "/api/v1/shared-collections/"+col.ID+"/bookmarks", nil, cookies2)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "북마크1") {
		t.Fatalf("guest list shared bookmarks failed: %d %s", rec.Code, rec.Body.String())
	}
	rec = doJSON(t, handler, http.MethodPost, "/api/v1/shared-collections/"+col.ID+"/bookmarks", map[string]string{
		"url": "https://example.com/2", "title": "게스트작성", "description": "설명",
	}, cookies2)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for viewer writing to shared collection, got %d", rec.Code)
	}
	_ = doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+ws1+"/collections/"+col.ID+"/shares", map[string]string{
		"target_type": "user", "target_email": "guest@linktive.local", "role": "editor",
	}, cookies1)
	rec = doJSON(t, handler, http.MethodPost, "/api/v1/shared-collections/"+col.ID+"/bookmarks", map[string]string{
		"url": "https://example.com/2", "title": "게스트작성", "description": "설명",
	}, cookies2)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 for editor writing to shared collection, got %d %s", rec.Code, rec.Body.String())
	}

	// API Key creation + Bearer token access + Export/Import roundtrip.
	keyRec := doJSON(t, handler, http.MethodPost, "/api/v1/api-keys", map[string]string{"name": "cli"}, cookies1)
	if keyRec.Code != http.StatusCreated {
		t.Fatalf("create api key failed: %d", keyRec.Code)
	}
	var keyResp struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(keyRec.Body.Bytes(), &keyResp)

	expReq := httptest.NewRequest(http.MethodGet, "/api/v1/workspaces/"+ws1+"/export?format=json", nil)
	expReq.Header.Set("Authorization", "Bearer "+keyResp.Token)
	expRec := httptest.NewRecorder()
	handler.ServeHTTP(expRec, expReq)
	if expRec.Code != http.StatusOK || !strings.Contains(expRec.Body.String(), "북마크1") {
		t.Fatalf("bearer export failed: %d %s", expRec.Code, expRec.Body.String())
	}

	impRec := doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+ws1+"/import", map[string]any{
		"format":          "auto",
		"content":         expRec.Body.String(),
		"skip_duplicates": true,
	}, cookies1)
	if impRec.Code != http.StatusOK || !strings.Contains(impRec.Body.String(), `"skipped":2`) {
		t.Fatalf("import duplicate check failed: %d %s", impRec.Code, impRec.Body.String())
	}
}

func TestProfile2FAAndAdminFlow(t *testing.T) {
	ctx := context.Background()
	st, err := sqlite.Open(ctx, ":memory:")
	if err != nil {
		t.Fatalf("Open(:memory:) failed: %v", err)
	}
	defer func() { _ = st.Close() }()

	handler := NewRouter(st, fstest.MapFS{"index.html": {Data: []byte("<html>ok</html>")}})

	// First registered user becomes admin.
	reg1 := doJSON(t, handler, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "admin@linktive.local", "name": "관리자", "password": "password123",
	}, nil)
	if reg1.Code != http.StatusCreated || !strings.Contains(reg1.Body.String(), `"is_admin":true`) {
		t.Fatalf("expected first user to be admin: %d %s", reg1.Code, reg1.Body.String())
	}
	adminCookies := reg1.Result().Cookies()

	// Disable open registration.
	rec := doJSON(t, handler, http.MethodPatch, "/api/v1/admin/settings", map[string]bool{"registration_enabled": false}, adminCookies)
	if rec.Code != http.StatusOK {
		t.Fatalf("disable registration failed: %d", rec.Code)
	}
	rec = doJSON(t, handler, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "blocked@linktive.local", "name": "차단", "password": "password123",
	}, nil)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 when registration disabled, got %d", rec.Code)
	}

	// Admin creates invite -> invited user registers as non-admin.
	invRec := doJSON(t, handler, http.MethodPost, "/api/v1/admin/invites", map[string]int{"expires_hours": 24}, adminCookies)
	if invRec.Code != http.StatusCreated {
		t.Fatalf("create invite failed: %d", invRec.Code)
	}
	var inv struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(invRec.Body.Bytes(), &inv)

	cfgRec := doJSON(t, handler, http.MethodGet, "/api/v1/auth/config?invite="+inv.Token, nil, nil)
	if cfgRec.Code != http.StatusOK || !strings.Contains(cfgRec.Body.String(), `"invite_valid":true`) {
		t.Fatalf("expected valid invite config, got %d %s", cfgRec.Code, cfgRec.Body.String())
	}

	reg2 := doJSON(t, handler, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "member@linktive.local", "name": "회원", "password": "password123", "invite_token": inv.Token,
	}, nil)
	if reg2.Code != http.StatusCreated || !strings.Contains(reg2.Body.String(), `"is_admin":false`) {
		t.Fatalf("invited registration failed: %d %s", reg2.Code, reg2.Body.String())
	}
	var r2 struct {
		User struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	_ = json.Unmarshal(reg2.Body.Bytes(), &r2)
	memberCookies := reg2.Result().Cookies()

	// Non-admin cannot access admin endpoints.
	rec = doJSON(t, handler, http.MethodGet, "/api/v1/admin/users", nil, memberCookies)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for non-admin, got %d", rec.Code)
	}

	// Profile & password update + 2FA setup/enable/login.
	rec = doJSON(t, handler, http.MethodPatch, "/api/v1/auth/profile", map[string]string{
		"email": "member2@linktive.local", "name": "새닉네임",
	}, memberCookies)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "새닉네임") {
		t.Fatalf("profile update failed: %d %s", rec.Code, rec.Body.String())
	}
	rec = doJSON(t, handler, http.MethodPatch, "/api/v1/auth/password", map[string]string{
		"current_password": "password123", "new_password": "newpassword456",
	}, memberCookies)
	if rec.Code != http.StatusOK {
		t.Fatalf("password update failed: %d %s", rec.Code, rec.Body.String())
	}

	setupRec := doJSON(t, handler, http.MethodPost, "/api/v1/auth/2fa/setup", nil, memberCookies)
	if setupRec.Code != http.StatusOK {
		t.Fatalf("2fa setup failed: %d", setupRec.Code)
	}
	var setup struct {
		Secret string `json:"secret"`
	}
	_ = json.Unmarshal(setupRec.Body.Bytes(), &setup)
	code, err := authutil.GenerateTOTPCode(setup.Secret, time.Now().UTC())
	if err != nil {
		t.Fatalf("GenerateTOTPCode failed: %v", err)
	}
	rec = doJSON(t, handler, http.MethodPost, "/api/v1/auth/2fa/enable", map[string]string{"code": code}, memberCookies)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"totp_enabled":true`) {
		t.Fatalf("2fa enable failed: %d %s", rec.Code, rec.Body.String())
	}

	// Login requires 2FA step.
	rec = doJSON(t, handler, http.MethodPost, "/api/v1/auth/login", map[string]string{
		"email": "member2@linktive.local", "password": "newpassword456",
	}, nil)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"requires_2fa":true`) {
		t.Fatalf("expected requires_2fa=true, got %d %s", rec.Code, rec.Body.String())
	}
	rec = doJSON(t, handler, http.MethodPost, "/api/v1/auth/login", map[string]string{
		"email": "member2@linktive.local", "password": "newpassword456", "totp_code": code,
	}, nil)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"member2@linktive.local"`) {
		t.Fatalf("2fa login failed: %d %s", rec.Code, rec.Body.String())
	}

	// Admin deletes member account.
	rec = doJSON(t, handler, http.MethodDelete, "/api/v1/admin/users/"+r2.User.ID, nil, adminCookies)
	if rec.Code != http.StatusOK {
		t.Fatalf("admin delete user failed: %d %s", rec.Code, rec.Body.String())
	}
}

func TestExtensionCORSPreflightAndHeaders(t *testing.T) {
	ctx := context.Background()
	st, err := sqlite.Open(ctx, ":memory:")
	if err != nil {
		t.Fatalf("Open(:memory:) failed: %v", err)
	}
	defer func() { _ = st.Close() }()
	handler := NewRouter(st, fstest.MapFS{"index.html": {Data: []byte("<html>ok</html>")}})

	// Allowed browser extension preflight succeeds with 204 and CORS headers.
	req := httptest.NewRequest(http.MethodOptions, "/api/v1/auth/me", nil)
	req.Header.Set("Origin", "chrome-extension://abcdefghijklmnop")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for extension preflight, got %d", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "chrome-extension://abcdefghijklmnop" {
		t.Fatalf("unexpected Access-Control-Allow-Origin: %q", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Headers"); !strings.Contains(got, "Authorization") {
		t.Fatalf("expected Authorization in Allow-Headers, got %q", got)
	}

	// Regular web origin does not receive extension wildcard/echo CORS header.
	req = httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("expected no Access-Control-Allow-Origin for non-extension origin, got %q", got)
	}
}

func doJSON(t *testing.T, handler http.Handler, method, target string, body any, cookies []*http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encode request body: %v", err)
		}
	}
	req := httptest.NewRequest(method, target, &buf)
	req.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}
