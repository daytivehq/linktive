package httpapi

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestArchivePayloadBoundaries(t *testing.T) {
	for _, tc := range []struct {
		body   string
		status int
	}{
		{"", 200}, {`{"mode":"html"}`, 200}, {"null", 400}, {"{", 400}, {`{} {}`, 400},
		{`{}` + strings.Repeat(" ", 32), 413},
	} {
		req := httptest.NewRequest("POST", "/", strings.NewReader(tc.body))
		w := httptest.NewRecorder()
		var dst struct{ Mode string }
		accepted := readUploadJSON(w, req, &dst, 32, true)
		if w.Code != tc.status || accepted != (tc.status == 200) {
			t.Errorf("length %d: got %d, accepted %t", len(tc.body), w.Code, accepted)
		}
	}
}
func TestVerificationWindowExpires(t *testing.T) {
	var state authState
	now := time.Now()
	for i := 0; i < 12; i++ {
		if !state.allow("account", 12, now) {
			t.Fatal("early limit")
		}
	}
	if state.allow("account", 12, now) || !state.allow("other", 12, now) || !state.allow("account", 12, now.Add(5*time.Minute)) {
		t.Fatal("incorrect account limit or expiry")
	}
}
