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
