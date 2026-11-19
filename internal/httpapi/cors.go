package httpapi

import (
	"net/http"
	"strings"
)

var allowedExtensionOriginPrefixes = []string{
	"chrome-extension://",
	"moz-extension://",
	"safari-web-extension://",
}

func isExtensionOrigin(origin string) bool {
	for _, prefix := range allowedExtensionOriginPrefixes {
		if strings.HasPrefix(origin, prefix) {
			return true
		}
	}
	return false
}

// extensionCORS enables browser extensions to call the REST API using Bearer tokens.
func extensionCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if isExtensionOrigin(origin) {
			w.Header().Add("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Max-Age", "86400")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
