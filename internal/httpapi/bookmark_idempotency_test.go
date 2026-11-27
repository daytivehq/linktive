package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/linktive/linktive/internal/domain"
	"github.com/linktive/linktive/internal/store"
	"github.com/linktive/linktive/internal/store/sqlite"
)

func TestBookmarkCreateIdempotency(t *testing.T) {
	st, err := sqlite.Open(context.Background(), ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = st.Close() }()
	handler := NewRouter(st, fstest.MapFS{"index.html": {Data: []byte("<html>ok</html>")}})
	registration := doJSON(t, handler, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "android@example.invalid", "name": "Android", "password": "password123",
	}, nil)
	var account struct{ Workspaces []domain.Workspace }
	if err := json.Unmarshal(registration.Body.Bytes(), &account); err != nil || len(account.Workspaces) != 1 {
		t.Fatalf("registration failed: %d %s", registration.Code, registration.Body.String())
	}
	cookies := registration.Result().Cookies()
	path := "/api/v1/workspaces/" + account.Workspaces[0].ID + "/bookmarks"
	const key = "8d79013c-f1bd-4316-a70e-02e8f8272f58"
	const original = `{"url":"https://example.invalid/offline","title":"Android","description":"Shared link","allow_duplicate":true}`

	post := func(key, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", key)
		for _, cookie := range cookies {
			req.AddCookie(cookie)
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}
	check := func(response *httptest.ResponseRecorder, status int) {
		t.Helper()
		if response.Code != status {
			t.Fatalf("expected %d, got %d: %s", status, response.Code, response.Body.String())
		}
	}
	check(post("invalid", original), http.StatusBadRequest)
	// Two identical requests can arrive together when the first response is lost.
	responses := make(chan *httptest.ResponseRecorder, 2)
	go func() { responses <- post(key, original) }()
	go func() { responses <- post(key, original) }()
	first, second := <-responses, <-responses
	if first.Code == http.StatusOK {
		first, second = second, first
	}
	check(first, http.StatusCreated)
	check(second, http.StatusOK)
	var created, replayed domain.Bookmark
	if json.Unmarshal(first.Body.Bytes(), &created) != nil || json.Unmarshal(second.Body.Bytes(), &replayed) != nil ||
		created.ID == "" || created.ID != replayed.ID {
		t.Fatalf("replay did not return the same bookmark: %s, %s", first.Body.String(), second.Body.String())
	}
	check(post(key, `{"url":"https://example.invalid/offline","title":"Changed","description":"Shared link"}`), http.StatusConflict)
	listed := doJSON(t, handler, http.MethodGet, path, nil, cookies)
	check(listed, http.StatusOK)
	var result store.SearchResult
	if err := json.Unmarshal(listed.Body.Bytes(), &result); err != nil || result.Total != 1 {
		t.Fatalf("expected one bookmark, got %s", listed.Body.String())
	}
	check(doJSON(t, handler, http.MethodDelete, path+"/"+created.ID, nil, cookies), http.StatusOK)
	check(post(key, original), http.StatusConflict)
}
