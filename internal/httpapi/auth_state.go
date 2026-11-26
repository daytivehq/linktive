package httpapi

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/linktive/linktive/internal/authutil"
)

func sessionOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(r.Header.Get("Authorization"))), "bearer ") {
			writeError(w, http.StatusForbidden, "a signed-in browser session is required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

type attemptWindow struct {
	count int
	until time.Time
}
type enrollment struct {
	secret, session string
	until           time.Time
}
type authState struct {
	mu        sync.Mutex
	attempts  map[string]attemptWindow
	pending   map[string]enrollment
	nextSweep time.Time
}

func (s *authState) allow(key string, max int, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.attempts == nil {
		s.attempts = make(map[string]attemptWindow)
	}
	if !now.Before(s.nextSweep) {
		for k, v := range s.attempts {
			if !now.Before(v.until) {
				delete(s.attempts, k)
			}
		}
		for k, v := range s.pending {
			if !now.Before(v.until) {
				delete(s.pending, k)
			}
		}
		s.nextSweep = now.Add(time.Minute)
	}
	entry, exists := s.attempts[key]
	if !now.Before(entry.until) {
		if !exists && len(s.attempts) >= 8192 {
			return false
		}
		entry = attemptWindow{until: now.Add(5 * time.Minute)}
	}
	if entry.count >= max {
		return false
	}
	entry.count++
	s.attempts[key] = entry
	return true
}

func (s *authState) begin(user, session, secret string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.pending == nil {
		s.pending = make(map[string]enrollment)
	}
	s.pending[user] = enrollment{secret: secret, session: session, until: time.Now().Add(10 * time.Minute)}
}

func (s *authState) confirm(user, session, code string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry := s.pending[user]
	now := time.Now()
	if entry.session != session || !now.Before(entry.until) || !authutil.VerifyTOTPCode(entry.secret, code, now) {
		return "", false
	}
	delete(s.pending, user)
	return entry.secret, true
}

func sessionHash(r *http.Request) string {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return ""
	}
	return hashToken(cookie.Value)
}
