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
