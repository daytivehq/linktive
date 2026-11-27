package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/linktive/linktive/internal/authutil"
	"github.com/linktive/linktive/internal/backup"
	"github.com/linktive/linktive/internal/clipper"
	"github.com/linktive/linktive/internal/domain"
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

func TestRegistrationPersistsLanguage(t *testing.T) {
	st, err := sqlite.Open(context.Background(), ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = st.Close() }()
	handler := NewRouter(st, fstest.MapFS{"index.html": {Data: []byte("<html>ok</html>")}})

	checkSettings := func(t *testing.T, rec *httptest.ResponseRecorder, wantStatus int, wantLanguage string) {
		t.Helper()
		if rec.Code != wantStatus {
			t.Fatalf("expected %d, got %d: %s", wantStatus, rec.Code, rec.Body.String())
		}
		var response struct {
			User struct {
				SettingsJSON string `json:"settings_json"`
			} `json:"user"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		var settings struct {
			Language string `json:"language"`
		}
		if err := json.Unmarshal([]byte(response.User.SettingsJSON), &settings); err != nil {
			t.Fatal(err)
		}
		if settings.Language != wantLanguage {
			t.Fatalf("expected language %q, got %q", wantLanguage, settings.Language)
		}
	}

	for _, tc := range []struct{ name, language, want string }{
		{"korean", "ko", "ko"},
		{"english", "en", "en"},
		{"omitted", "", "en"},
		{"unsupported", "fr", "en"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			credentials := map[string]string{"email": tc.name + "@example.invalid", "password": "password123"}
			registration := map[string]string{"email": credentials["email"], "password": credentials["password"], "name": "Test User"}
			if tc.language != "" {
				registration["language"] = tc.language
			}
			reg := doJSON(t, handler, http.MethodPost, "/api/v1/auth/register", registration, nil)
			checkSettings(t, reg, http.StatusCreated, tc.want)
			logout := doJSON(t, handler, http.MethodPost, "/api/v1/auth/logout", nil, reg.Result().Cookies())
			if logout.Code != http.StatusOK {
				t.Fatalf("logout failed: %d %s", logout.Code, logout.Body.String())
			}
			login := doJSON(t, handler, http.MethodPost, "/api/v1/auth/login", credentials, nil)
			checkSettings(t, login, http.StatusOK, tc.want)
			me := doJSON(t, handler, http.MethodGet, "/api/v1/auth/me", nil, login.Result().Cookies())
			checkSettings(t, me, http.StatusOK, tc.want)
		})
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

	private := map[string]string{"url": "https://example.com/private", "title": "Elsewhere", "description": "test", "note": "private memo"}
	if rec := doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+ws1+"/bookmarks", private, cookies1); rec.Code != 201 {
		t.Fatal(rec.Body.String())
	}
	if rec := doJSON(t, handler, http.MethodPost, "/api/v1/shared-collections/"+col.ID+"/bookmarks", private, cookies2); rec.Code != 409 || strings.Contains(rec.Body.String(), "private memo") {
		t.Fatal(rec.Body.String())
	}

	child := doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+ws1+"/collections", map[string]string{"parent_id": col.ID, "name": "child"}, cookies1)
	var childCol struct{ ID string }
	if child.Code != 201 || json.Unmarshal(child.Body.Bytes(), &childCol) != nil {
		t.Fatal(child.Body.String())
	}
	addChild := doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+ws1+"/bookmarks", map[string]string{"collection_id": childCol.ID, "url": "https://example.com/nested", "title": "nested record", "description": "test"}, cookies1)
	if addChild.Code != 201 {
		t.Fatal(addChild.Body.String())
	}
	path := "/api/v1/shared-collections/" + col.ID + "/bookmarks?include_children=true"
	hidden := doJSON(t, handler, http.MethodGet, path, nil, cookies2)
	if hidden.Code != 200 || strings.Contains(hidden.Body.String(), "nested record") {
		t.Fatal(hidden.Body.String())
	}
	grant := doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+ws1+"/collections/"+childCol.ID+"/shares", map[string]string{"target_type": "user", "target_email": "guest@linktive.local", "role": "viewer"}, cookies1)
	if grant.Code != 201 {
		t.Fatal(grant.Body.String())
	}
	visible := doJSON(t, handler, http.MethodGet, path, nil, cookies2)
	if visible.Code != 200 || !strings.Contains(visible.Body.String(), "nested record") {
		t.Fatal(visible.Body.String())
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

	for _, path := range []string{"/api/v1/admin/users", "/api/v1/api-keys"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "Bearer "+keyResp.Token)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code != http.StatusForbidden {
			t.Errorf("expected session-only endpoint, got %d", rr.Code)
		}
	}
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
	if impRec.Code != http.StatusOK || !strings.Contains(impRec.Body.String(), `"skipped":4`) {
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
	second := doJSON(t, handler, http.MethodPost, "/api/v1/auth/login", map[string]string{"email": "member2@linktive.local", "password": "password123"}, nil)
	if second.Code != 200 {
		t.Fatal(second.Body.String())
	}
	rec = doJSON(t, handler, http.MethodPatch, "/api/v1/auth/password", map[string]string{
		"current_password": "password123", "new_password": "newpassword456",
	}, memberCookies)
	if rec.Code != http.StatusOK {
		t.Fatalf("password update failed: %d %s", rec.Code, rec.Body.String())
	}

	if other := doJSON(t, handler, http.MethodGet, "/api/v1/auth/me", nil, second.Result().Cookies()); other.Code != 401 {
		t.Fatal("old session still valid")
	}
	setupRec := doJSON(t, handler, http.MethodPost, "/api/v1/auth/2fa/setup", map[string]string{"password": "newpassword456"}, memberCookies)
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

	if rec := doJSON(t, handler, http.MethodPost, "/api/v1/auth/2fa/setup", map[string]string{"password": "newpassword456"}, memberCookies); rec.Code != http.StatusBadRequest {
		t.Fatal("replacement should require the current OTP")
	}
	if rec := doJSON(t, handler, http.MethodPost, "/api/v1/auth/2fa/setup", map[string]string{"password": "newpassword456", "code": code}, memberCookies); rec.Code != 200 {
		t.Fatal("replacement setup failed")
	}
	// Login still accepts the active code while a replacement is pending.
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

func TestDeleteOwnAccount(t *testing.T) {
	ctx := context.Background()
	st, err := sqlite.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = st.Close() }()
	handler := NewRouter(st, fstest.MapFS{"index.html": {Data: []byte("<html>ok</html>")}})
	const path = "/api/v1/auth/account"
	const password = "password123"

	check := func(rec *httptest.ResponseRecorder, want int) {
		t.Helper()
		if rec.Code != want {
			t.Fatalf("expected %d, got %d: %s", want, rec.Code, rec.Body.String())
		}
	}
	register := func(email string) ([]*http.Cookie, domain.User, domain.Workspace) {
		t.Helper()
		rec := doJSON(t, handler, http.MethodPost, "/api/v1/auth/register", map[string]string{
			"email": email, "name": email, "password": password,
		}, nil)
		check(rec, http.StatusCreated)
		var payload struct {
			User       domain.User        `json:"user"`
			Workspaces []domain.Workspace `json:"workspaces"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil || len(payload.Workspaces) != 1 {
			t.Fatalf("invalid registration response: %v, %s", err, rec.Body.String())
		}
		return rec.Result().Cookies(), payload.User, payload.Workspaces[0]
	}
	bearer := func(method, target, token string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, target, strings.NewReader(`{"current_password":"password123"}`))
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}

	adminCookies, _, _ := register("admin@example.invalid")
	memberCookies, member, personal := register("member@example.invalid")
	bookmarksPath := "/api/v1/workspaces/" + personal.ID + "/bookmarks"
	created := doJSON(t, handler, http.MethodPost, bookmarksPath, map[string]string{
		"url": "https://example.invalid/personal", "title": "Personal bookmark",
	}, memberCookies)
	check(created, http.StatusCreated)
	var bookmark domain.Bookmark
	if err := json.Unmarshal(created.Body.Bytes(), &bookmark); err != nil || bookmark.ID == "" {
		t.Fatalf("invalid bookmark response: %v, %s", err, created.Body.String())
	}
	credentials := map[string]string{"current_password": password}
	check(doJSON(t, handler, http.MethodDelete, path, credentials, nil), http.StatusUnauthorized)
	check(doJSON(t, handler, http.MethodDelete, path, credentials, adminCookies), http.StatusConflict)
	check(doJSON(t, handler, http.MethodDelete, path, map[string]string{"current_password": "wrong"}, memberCookies), http.StatusUnauthorized)

	key := doJSON(t, handler, http.MethodPost, "/api/v1/api-keys", map[string]string{"name": "extension"}, memberCookies)
	check(key, http.StatusCreated)
	var apiKey struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(key.Body.Bytes(), &apiKey); err != nil || apiKey.Token == "" {
		t.Fatalf("missing API key: %v", err)
	}
	check(bearer(http.MethodDelete, path, apiKey.Token), http.StatusForbidden)
	check(bearer(http.MethodGet, "/api/v1/auth/me", apiKey.Token), http.StatusOK)

	otherSession := doJSON(t, handler, http.MethodPost, "/api/v1/auth/login", map[string]string{
		"email": member.Email, "password": password,
	}, nil)
	check(otherSession, http.StatusOK)
	secret, err := authutil.GenerateTOTPSecret()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.EnableUserTOTP(ctx, member.ID, secret); err != nil {
		t.Fatal(err)
	}
	check(doJSON(t, handler, http.MethodDelete, path, credentials, memberCookies), http.StatusUnauthorized)
	code, err := authutil.GenerateTOTPCode(secret, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	credentials["totp_code"] = code
	deleted := doJSON(t, handler, http.MethodDelete, path, credentials, memberCookies)
	check(deleted, http.StatusOK)
	cookies := deleted.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != sessionCookieName || cookies[0].MaxAge >= 0 {
		t.Fatalf("expected session cookie to be cleared, got %v", cookies)
	}
	check(bearer(http.MethodGet, "/api/v1/auth/me", apiKey.Token), http.StatusUnauthorized)
	check(doJSON(t, handler, http.MethodGet, "/api/v1/auth/me", nil, otherSession.Result().Cookies()), http.StatusUnauthorized)
	check(doJSON(t, handler, http.MethodGet, "/api/v1/auth/me", nil, adminCookies), http.StatusOK)
	if _, err := st.GetBookmark(ctx, personal.ID, bookmark.ID); err == nil {
		t.Fatal("owned bookmark still exists")
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

func TestSavedFiltersLinkCheckAndAdminBackups(t *testing.T) {
	ctx := context.Background()
	st, err := sqlite.Open(ctx, ":memory:")
	if err != nil {
		t.Fatalf("Open(:memory:) failed: %v", err)
	}
	defer func() { _ = st.Close() }()

	backupMgr := backup.NewManager(st, t.TempDir(), clipper.NewManager(st, t.TempDir(), "", ""))
	handler := NewRouter(st, fstest.MapFS{"index.html": {Data: []byte("<html>ok</html>")}}, WithBackupManager(backupMgr))

	// Register first user (admin).
	reg := doJSON(t, handler, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "v02@linktive.local", "name": "운영자", "password": "password123",
	}, nil)
	if reg.Code != http.StatusCreated {
		t.Fatalf("register failed: %d %s", reg.Code, reg.Body.String())
	}
	cookies := reg.Result().Cookies()

	var regPayload struct {
		Workspaces []struct {
			ID string `json:"id"`
		} `json:"workspaces"`
	}
	_ = json.Unmarshal(reg.Body.Bytes(), &regPayload)
	wsID := regPayload.Workspaces[0].ID

	// Saved Filters CRUD.
	rec := doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+wsID+"/filters", map[string]string{
		"name":  "중요 세금",
		"query": "tags:세금 is:favorite",
		"icon":  "filter",
		"color": "#0284c7",
	}, cookies)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create saved filter failed: %d %s", rec.Code, rec.Body.String())
	}
	var createdFilter struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &createdFilter)

	rec = doJSON(t, handler, http.MethodGet, "/api/v1/workspaces/"+wsID+"/filters", nil, cookies)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "중요 세금") {
		t.Fatalf("list saved filters failed: %d %s", rec.Code, rec.Body.String())
	}

	rec = doJSON(t, handler, http.MethodPatch, "/api/v1/workspaces/"+wsID+"/filters/"+createdFilter.ID, map[string]string{
		"name":  "수정된 필터",
		"query": "is:broken",
		"icon":  "alert",
		"color": "#e11d48",
	}, cookies)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "수정된 필터") {
		t.Fatalf("update saved filter failed: %d %s", rec.Code, rec.Body.String())
	}

	// Link check against a local mock HTTP server (200 OK & 404 Not Found).
	t.Setenv("LINKTIVE_ALLOW_PRIVATE_NETWORKS", "true")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/missing" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("<html><title>Test Page</title></html>"))
	}))
	defer srv.Close()

	rec = doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+wsID+"/bookmarks", map[string]any{
		"url": srv.URL + "/ok", "title": "정상 링크",
	}, cookies)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create ok bookmark failed: %d %s", rec.Code, rec.Body.String())
	}
	rec = doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+wsID+"/bookmarks", map[string]any{
		"url": srv.URL + "/missing", "title": "깨진 링크",
	}, cookies)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create broken bookmark failed: %d %s", rec.Code, rec.Body.String())
	}

	rec = doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+wsID+"/links/check", map[string]any{
		"only_unchecked": false,
	}, cookies)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"broken_count":1`) || !strings.Contains(rec.Body.String(), `"ok_count":1`) {
		t.Fatalf("check workspace links failed: %d %s", rec.Code, rec.Body.String())
	}

	rec = doJSON(t, handler, http.MethodGet, "/api/v1/workspaces/"+wsID+"/bookmarks?link_status=broken", nil, cookies)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "깨진 링크") || strings.Contains(rec.Body.String(), "정상 링크") {
		t.Fatalf("filter broken links failed: %d %s", rec.Code, rec.Body.String())
	}

	rec = doJSON(t, handler, http.MethodGet, "/api/v1/workspaces/"+wsID+"/stats", nil, cookies)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"broken_count":1`) {
		t.Fatalf("expected broken_count=1 in stats: %d %s", rec.Code, rec.Body.String())
	}

	// Mark broken link as OK via link-status endpoint, and verify duplicate URL detection + comma query parsing.
	rec = doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+wsID+"/bookmarks", map[string]any{
		"url": srv.URL + "/ok", "title": "중복 저장", "allow_duplicate": true, "is_favorite": true, "tags": []string{"커뮤니티"},
	}, cookies)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create duplicate bookmark failed: %d %s", rec.Code, rec.Body.String())
	}
	var dupBm struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &dupBm)

	rec = doJSON(t, handler, http.MethodGet, "/api/v1/workspaces/"+wsID+"/bookmarks?q="+url.QueryEscape("tags:커뮤니티, is:favorite"), nil, cookies)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "중복 저장") || strings.Contains(rec.Body.String(), "깨진 링크") {
		t.Fatalf("comma query tags:커뮤니티, is:favorite failed: %d %s", rec.Code, rec.Body.String())
	}

	rec = doJSON(t, handler, http.MethodGet, "/api/v1/workspaces/"+wsID+"/links/duplicates", nil, cookies)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"total_groups":1`) {
		t.Fatalf("list duplicate links failed: %d %s", rec.Code, rec.Body.String())
	}

	rec = doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+wsID+"/bookmarks/"+dupBm.ID+"/link-status", map[string]string{
		"link_status": "blocked",
	}, cookies)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"link_status":"blocked"`) {
		t.Fatalf("set bookmark link status failed: %d %s", rec.Code, rec.Body.String())
	}

	rec = doJSON(t, handler, http.MethodGet, "/api/v1/workspaces/"+wsID+"/stats", nil, cookies)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"blocked_count":1`) || !strings.Contains(rec.Body.String(), `"duplicate_count":1`) {
		t.Fatalf("expected blocked_count=1 and duplicate_count=1 in stats: %d %s", rec.Code, rec.Body.String())
	}

	// Admin backups run/list/delete.
	rec = doJSON(t, handler, http.MethodPost, "/api/v1/admin/backups/run", nil, cookies)
	if rec.Code != http.StatusCreated {
		t.Fatalf("run backup failed: %d %s", rec.Code, rec.Body.String())
	}
	var backupInfo struct {
		Filename string `json:"filename"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &backupInfo)
	if backupInfo.Filename == "" {
		t.Fatalf("expected backup filename in response")
	}

	rec = doJSON(t, handler, http.MethodGet, "/api/v1/admin/backups", nil, cookies)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), backupInfo.Filename) {
		t.Fatalf("list backups failed: %d %s", rec.Code, rec.Body.String())
	}

	rec = doJSON(t, handler, http.MethodDelete, "/api/v1/admin/backups/"+backupInfo.Filename, nil, cookies)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete backup failed: %d %s", rec.Code, rec.Body.String())
	}

	rec = doJSON(t, handler, http.MethodPatch, "/api/v1/admin/backups/settings", map[string]bool{"include_assets": true}, cookies)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"include_assets":true`) {
		t.Fatalf("select full backup failed: %d %s", rec.Code, rec.Body.String())
	}
	rec = doJSON(t, handler, http.MethodPost, "/api/v1/admin/backups/run", nil, cookies)
	if rec.Code != http.StatusCreated || !strings.Contains(rec.Body.String(), `"includes_assets":true`) {
		t.Fatalf("run full backup failed: %d %s", rec.Code, rec.Body.String())
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &backupInfo); err != nil || !strings.HasSuffix(backupInfo.Filename, ".zip") {
		t.Fatalf("expected ZIP filename: %v", err)
	}
	rec = doJSON(t, handler, http.MethodGet, "/api/v1/admin/backups/"+backupInfo.Filename, nil, cookies)
	if rec.Code != http.StatusOK || rec.Header().Get("Content-Type") != "application/zip" ||
		!strings.HasPrefix(rec.Body.String(), "PK") {
		t.Fatalf("download full backup failed: %d %s", rec.Code, rec.Header().Get("Content-Type"))
	}
	rec = doJSON(t, handler, http.MethodDelete, "/api/v1/admin/backups/"+backupInfo.Filename, nil, cookies)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete full backup failed: %d %s", rec.Code, rec.Body.String())
	}

	rec = doJSON(t, handler, http.MethodDelete, "/api/v1/workspaces/"+wsID+"/filters/"+createdFilter.ID, nil, cookies)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete saved filter failed: %d %s", rec.Code, rec.Body.String())
	}
}

func TestBookmarkArchiveSearchPolicyUsageAndCleanup(t *testing.T) {
	t.Setenv("LINKTIVE_ALLOW_PRIVATE_NETWORKS", "true")
	ctx := context.Background()
	st, err := sqlite.Open(ctx, ":memory:")
	if err != nil {
		t.Fatalf("Open(:memory:) failed: %v", err)
	}
	defer func() { _ = st.Close() }()

	tmpRoot := t.TempDir()
	assetsDir := tmpRoot + "/assets"
	backupsDir := tmpRoot + "/backups"
	clipMgr := clipper.NewManager(st, assetsDir, "", backupsDir)
	handler := NewRouter(
		st,
		fstest.MapFS{"index.html": {Data: []byte("<html>ok</html>")}},
		WithClipper(clipMgr),
	)

	// Serve a mock article and an image asset.
	pngBytes := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
	t.Setenv("LINKTIVE_ALLOW_PRIVATE_NETWORKS", "true")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/cover.png" {
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(pngBytes)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>아카이브 원문 제목</title></head><body><article><h1>아카이브 원문 제목</h1><p>본문에서만 검색되는 고유키워드알파 테스트 문장입니다.</p><img src="/cover.png" alt="cover" /></article></body></html>`))
	}))
	defer srv.Close()

	// 1. Register admin user + create bookmark.
	reg := doJSON(t, handler, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "owner@linktive.local", "name": "소유자", "password": "password123",
	}, nil)
	if reg.Code != http.StatusCreated {
		t.Fatalf("register owner failed: %d %s", reg.Code, reg.Body.String())
	}
	ownerCookies := reg.Result().Cookies()
	var ownerReg struct {
		Workspaces []struct {
			ID string `json:"id"`
		} `json:"workspaces"`
	}
	_ = json.Unmarshal(reg.Body.Bytes(), &ownerReg)
	wsID := ownerReg.Workspaces[0].ID

	rec := doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+wsID+"/bookmarks", map[string]any{
		"url":   srv.URL + "/article",
		"title": "외부 제목만 있음",
	}, ownerCookies)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create bookmark failed: %d %s", rec.Code, rec.Body.String())
	}
	var bm struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &bm)

	// 2. Clip bookmark in 'both' mode & inspect archive (readable + snapshot HTML).
	rec = doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+wsID+"/bookmarks/"+bm.ID+"/archive", map[string]any{
		"mode": "both",
	}, ownerCookies)
	if rec.Code != http.StatusOK {
		t.Fatalf("POST archive failed: %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"status":"ready"`) || !strings.Contains(rec.Body.String(), `"archive_mode":"both"`) || !strings.Contains(rec.Body.String(), `"snapshot_html"`) || !strings.Contains(rec.Body.String(), "/assets/") {
		t.Fatalf("unexpected archive response: %s", rec.Body.String())
	}

	rec = doJSON(t, handler, http.MethodGet, "/api/v1/workspaces/"+wsID+"/bookmarks/"+bm.ID+"/archive", nil, ownerCookies)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "고유키워드알파") {
		t.Fatalf("GET archive failed: %d %s", rec.Code, rec.Body.String())
	}

	// 3. Search toggle: search_archive=true finds body text, search_archive=false excludes it.
	rec = doJSON(t, handler, http.MethodGet, "/api/v1/workspaces/"+wsID+"/bookmarks?q="+url.QueryEscape("고유키워드알파")+"&search_archive=true", nil, ownerCookies)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), bm.ID) {
		t.Fatalf("search with search_archive=true should find bookmark: %d %s", rec.Code, rec.Body.String())
	}
	rec = doJSON(t, handler, http.MethodGet, "/api/v1/workspaces/"+wsID+"/bookmarks?q="+url.QueryEscape("고유키워드알파")+"&search_archive=false", nil, ownerCookies)
	if rec.Code != http.StatusOK || strings.Contains(rec.Body.String(), bm.ID) {
		t.Fatalf("search with search_archive=false should not match body text: %d %s", rec.Code, rec.Body.String())
	}

	// 4. Markdown export (returns ZIP with images by default, plain MD with ?bundle=md).
	rec = doJSON(t, handler, http.MethodGet, "/api/v1/workspaces/"+wsID+"/bookmarks/"+bm.ID+"/export/markdown", nil, ownerCookies)
	if rec.Code != http.StatusOK || rec.Header().Get("Content-Type") != "application/zip" {
		t.Fatalf("markdown zip bundle export failed: %d ct=%s", rec.Code, rec.Header().Get("Content-Type"))
	}
	rec = doJSON(t, handler, http.MethodGet, "/api/v1/workspaces/"+wsID+"/bookmarks/"+bm.ID+"/export/markdown?bundle=md", nil, ownerCookies)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "고유키워드알파") {
		t.Fatalf("plain markdown export failed: %d %s", rec.Code, rec.Body.String())
	}

	// 5. Usage & admin archive policy.
	rec = doJSON(t, handler, http.MethodGet, "/api/v1/workspaces/"+wsID+"/usage", nil, ownerCookies)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"archived_count":1`) {
		t.Fatalf("workspace usage failed: %d %s", rec.Code, rec.Body.String())
	}
	rec = doJSON(t, handler, http.MethodGet, "/api/v1/admin/usage", nil, ownerCookies)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"total_archived":1`) {
		t.Fatalf("admin usage failed: %d %s", rec.Code, rec.Body.String())
	}
	rec = doJSON(t, handler, http.MethodPatch, "/api/v1/admin/archive-settings", map[string]any{
		"limit_enabled":   false,
		"max_asset_mb":    25,
		"max_bookmark_mb": 100,
	}, ownerCookies)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"max_asset_mb":25`) {
		t.Fatalf("update archive settings failed: %d %s", rec.Code, rec.Body.String())
	}
	rec = doJSON(t, handler, http.MethodPost, "/api/v1/admin/assets/cleanup", nil, ownerCookies)
	if rec.Code != http.StatusOK {
		t.Fatalf("admin orphan asset cleanup failed: %d %s", rec.Code, rec.Body.String())
	}

	// 6. Archive privacy scope in shared workspace: owner_only -> 403 for member, shared_members -> 200.
	rec = doJSON(t, handler, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "member@linktive.local", "name": "멤버", "password": "password123",
	}, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("register member failed: %d %s", rec.Code, rec.Body.String())
	}
	memberCookies := rec.Result().Cookies()

	rec = doJSON(t, handler, http.MethodPost, "/api/v1/workspaces/"+wsID+"/members", map[string]string{
		"email": "member@linktive.local",
		"role":  "editor",
	}, ownerCookies)
	if rec.Code != http.StatusCreated {
		t.Fatalf("add workspace member failed: %d %s", rec.Code, rec.Body.String())
	}

	rec = doJSON(t, handler, http.MethodGet, "/api/v1/workspaces/"+wsID+"/bookmarks/"+bm.ID+"/archive", nil, memberCookies)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for member when owner archive_share_scope is owner_only, got %d %s", rec.Code, rec.Body.String())
	}

	for _, method := range []string{http.MethodPost, http.MethodDelete} {
		res := doJSON(t, handler, method, "/api/v1/workspaces/"+wsID+"/bookmarks/"+bm.ID+"/archive", nil, memberCookies)
		if res.Code != http.StatusForbidden {
			t.Fatal(res.Code, res.Body.String())
		}
	}
	cleared := doJSON(t, handler, http.MethodDelete, "/api/v1/workspaces/"+wsID+"/archives", nil, memberCookies)
	if cleared.Code != 200 || !strings.Contains(cleared.Body.String(), `"deleted":0`) {
		t.Fatal(cleared.Body.String())
	}
	for _, term := range []string{"고유키워드알파", "알파"} {
		rec = doJSON(t, handler, http.MethodGet, "/api/v1/workspaces/"+wsID+"/bookmarks?q="+url.QueryEscape(term)+"&search_archive=true", nil, memberCookies)
		if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"total":0`) {
			t.Fatal(rec.Body.String())
		}
	}
	rec = doJSON(t, handler, http.MethodPatch, "/api/v1/auth/settings", map[string]any{
		"archive_share_scope": "shared_members",
	}, ownerCookies)
	if rec.Code != http.StatusOK {
		t.Fatalf("update owner settings failed: %d %s", rec.Code, rec.Body.String())
	}

	rec = doJSON(t, handler, http.MethodGet, "/api/v1/workspaces/"+wsID+"/bookmarks/"+bm.ID+"/archive", nil, memberCookies)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "고유키워드알파") {
		t.Fatalf("expected 200 for member after owner enabled shared_members, got %d %s", rec.Code, rec.Body.String())
	}

	// Move the archive twice. At each destination the image and the search index must work.
	created := doJSON(t, handler, http.MethodPost, "/api/v1/workspaces", map[string]string{"name": "archive move test"}, ownerCookies)
	var target struct{ ID string }
	if created.Code != 201 || json.Unmarshal(created.Body.Bytes(), &target) != nil || target.ID == "" {
		t.Fatal(created.Body.String())
	}
	from := wsID
	for _, to := range []string{target.ID, wsID} {
		rec = doJSON(t, handler, http.MethodPatch, "/api/v1/workspaces/"+from+"/bookmarks/"+bm.ID, map[string]string{"target_workspace_id": to}, ownerCookies)
		if rec.Code != 200 {
			t.Fatal(rec.Body.String())
		}
		ar, err := st.GetBookmarkArchive(ctx, to, bm.ID)
		if err != nil {
			t.Fatal(err)
		}
		m := regexp.MustCompile(`src="(/api/v1/workspaces/[^"]+/assets/[^"]+)"`).FindStringSubmatch(ar.ContentHTML)
		if len(m) != 2 || !strings.Contains(m[1], to) {
			t.Fatal(ar.ContentHTML)
		}
		asset := doJSON(t, handler, http.MethodGet, m[1], nil, ownerCookies)
		if asset.Code != 200 || !bytes.Equal(asset.Body.Bytes(), pngBytes) || asset.Header().Get("X-Content-Type-Options") != "nosniff" || !strings.Contains(asset.Header().Get("Content-Security-Policy"), "sandbox") {
			t.Fatal("moved image or security headers missing")
		}
		search := doJSON(t, handler, http.MethodGet, "/api/v1/workspaces/"+to+"/bookmarks?q="+url.QueryEscape("고유키워드알파")+"&search_archive=true", nil, ownerCookies)
		if search.Code != 200 || !strings.Contains(search.Body.String(), bm.ID) {
			t.Fatal(search.Body.String())
		}
		from = to
	}

	// 7. Delete archive.
	rec = doJSON(t, handler, http.MethodDelete, "/api/v1/workspaces/"+wsID+"/bookmarks/"+bm.ID+"/archive", nil, ownerCookies)
	if rec.Code != http.StatusOK {
		t.Fatalf("DELETE archive failed: %d %s", rec.Code, rec.Body.String())
	}
	rec = doJSON(t, handler, http.MethodGet, "/api/v1/workspaces/"+wsID+"/bookmarks/"+bm.ID+"/archive", nil, ownerCookies)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 after DELETE archive, got %d %s", rec.Code, rec.Body.String())
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
