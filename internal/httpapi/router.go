package httpapi

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/linktive/linktive/internal/backup"
	"github.com/linktive/linktive/internal/store"
)

type apiHandler struct {
	store  store.Store
	backup *backup.Manager
}

// RouterOption configures optional server dependencies for NewRouter.
type RouterOption func(*apiHandler)

// WithBackupManager wires the automatic backup manager into admin routes.
func WithBackupManager(m *backup.Manager) RouterOption {
	return func(h *apiHandler) {
		h.backup = m
	}
}

// NewRouter builds the HTTP router for API endpoints and embedded SPA static assets.
func NewRouter(st store.Store, staticFS fs.FS, opts ...RouterOption) http.Handler {
	h := &apiHandler{store: st}
	for _, opt := range opts {
		if opt != nil {
			opt(h)
		}
	}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(extensionCORS)

	r.Route("/api/v1", func(api chi.Router) {
		api.Get("/health", h.handleHealth)

		api.Get("/auth/config", h.handleAuthConfig)
		api.Post("/auth/register", h.handleRegister)
		api.Post("/auth/login", h.handleLogin)
		api.Post("/auth/logout", h.handleLogout)
		api.Get("/public/collections/{slug}", h.handleGetPublicCollection)

		api.Group(func(authed chi.Router) {
			authed.Use(h.requireAuth)

			authed.Get("/auth/me", h.handleMe)
			authed.Patch("/auth/settings", h.handleUpdateSettings)
			authed.Patch("/auth/profile", h.handleUpdateProfile)
			authed.Patch("/auth/password", h.handleUpdatePassword)
			authed.Post("/auth/2fa/setup", h.handle2FASetup)
			authed.Post("/auth/2fa/enable", h.handle2FAEnable)
			authed.Post("/auth/2fa/disable", h.handle2FADisable)

			authed.Route("/admin", func(adm chi.Router) {
				adm.Use(h.requireAdmin)
				adm.Get("/settings", h.handleAdminGetSettings)
				adm.Patch("/settings", h.handleAdminUpdateSettings)
				adm.Get("/users", h.handleAdminListUsers)
				adm.Patch("/users/{userID}", h.handleAdminUpdateUser)
				adm.Delete("/users/{userID}", h.handleAdminDeleteUser)
				adm.Get("/invites", h.handleAdminListInvites)
				adm.Post("/invites", h.handleAdminCreateInvite)
				adm.Delete("/invites/{inviteID}", h.handleAdminDeleteInvite)
				adm.Get("/backups", h.handleAdminListBackups)
				adm.Patch("/backups/settings", h.handleAdminUpdateBackupSettings)
				adm.Post("/backups/run", h.handleAdminRunBackup)
				adm.Get("/backups/{filename}", h.handleAdminDownloadBackup)
				adm.Delete("/backups/{filename}", h.handleAdminDeleteBackup)
			})

			authed.Get("/api-keys", h.handleListAPIKeys)
			authed.Post("/api-keys", h.handleCreateAPIKey)
			authed.Delete("/api-keys/{keyID}", h.handleDeleteAPIKey)

			authed.Get("/workspaces", h.handleListWorkspaces)
			authed.Post("/workspaces", h.handleCreateWorkspace)

			authed.Get("/shared-collections", h.handleListSharedCollections)
			authed.Get("/shared-collections/{colID}/bookmarks", h.handleListSharedCollectionBookmarks)
			authed.Post("/shared-collections/{colID}/bookmarks", h.handleCreateSharedCollectionBookmark)
			authed.Patch("/shared-collections/{colID}/bookmarks/{bmID}", h.handleUpdateSharedCollectionBookmark)
			authed.Delete("/shared-collections/{colID}/bookmarks/{bmID}", h.handleDeleteSharedCollectionBookmark)

			authed.Route("/workspaces/{wsID}", func(ws chi.Router) {
				ws.Patch("/", h.handleUpdateWorkspace)
				ws.Delete("/", h.handleDeleteWorkspace)
				ws.Get("/members", h.handleListWorkspaceMembers)
				ws.Post("/members", h.handleAddWorkspaceMember)
				ws.Delete("/members/{userID}", h.handleRemoveWorkspaceMember)

				ws.Get("/collections", h.handleListCollections)
				ws.Post("/collections", h.handleCreateCollection)
				ws.Patch("/collections/{colID}", h.handleUpdateCollection)
				ws.Delete("/collections/{colID}", h.handleDeleteCollection)
				ws.Post("/collections/{colID}/public", h.handleSetCollectionPublic)
				ws.Get("/collections/{colID}/shares", h.handleListCollectionShares)
				ws.Post("/collections/{colID}/shares", h.handleAddCollectionShare)
				ws.Delete("/collections/{colID}/shares/{shareID}", h.handleRemoveCollectionShare)

				ws.Get("/bookmarks", h.handleListBookmarks)
				ws.Post("/bookmarks", h.handleCreateBookmark)
				ws.Post("/bookmarks/bulk", h.handleBulkBookmarks)
				ws.Get("/bookmarks/{bmID}", h.handleGetBookmark)
				ws.Patch("/bookmarks/{bmID}", h.handleUpdateBookmark)
				ws.Delete("/bookmarks/{bmID}", h.handleDeleteBookmark)
				ws.Post("/bookmarks/{bmID}/check-link", h.handleCheckBookmarkLink)

				ws.Post("/links/check", h.handleCheckWorkspaceLinks)

				ws.Get("/filters", h.handleListSavedFilters)
				ws.Post("/filters", h.handleCreateSavedFilter)
				ws.Patch("/filters/{filterID}", h.handleUpdateSavedFilter)
				ws.Delete("/filters/{filterID}", h.handleDeleteSavedFilter)

				ws.Get("/tags", h.handleListTags)
				ws.Patch("/tags/{tagName}", h.handleRenameTag)
				ws.Delete("/tags/{tagName}", h.handleDeleteTag)
				ws.Get("/stats", h.handleGetWorkspaceStats)

				ws.Get("/export", h.handleExportWorkspace)
				ws.Post("/import", h.handleImportWorkspace)
			})
		})
	})

	if staticFS != nil {
		r.NotFound(spaHandler(staticFS))
	}

	return r
}

func (a *apiHandler) handleHealth(w http.ResponseWriter, r *http.Request) {
	if err := a.store.Ping(r.Context()); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"status": "error",
			"error":  "database unreachable",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "linktive",
	})
}

func spaHandler(staticFS fs.FS) http.HandlerFunc {
	fileServer := http.FileServer(http.FS(staticFS))
	return func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			writeError(w, http.StatusNotFound, "not found")
			return
		}

		cleanPath := strings.TrimPrefix(r.URL.Path, "/")
		if cleanPath == "" {
			cleanPath = "index.html"
		}
		if _, err := fs.Stat(staticFS, cleanPath); err == nil {
			fileServer.ServeHTTP(w, r)
			return
		}

		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	}
}

func decodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20))
	return dec.Decode(dst)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
