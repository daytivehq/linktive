package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/linktive/linktive/internal/backup"
)

func (a *apiHandler) handleAdminListBackups(w http.ResponseWriter, r *http.Request) {
	if a.backup == nil {
		writeError(w, http.StatusServiceUnavailable, "backup manager not configured")
		return
	}
	settings, err := a.backup.Settings(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load backup settings")
		return
	}
	items, err := a.backup.ListBackups()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list backups")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"settings": settings,
		"items":    items,
	})
}

func (a *apiHandler) handleAdminUpdateBackupSettings(w http.ResponseWriter, r *http.Request) {
	if a.backup == nil {
		writeError(w, http.StatusServiceUnavailable, "backup manager not configured")
		return
	}
	var req struct {
		Enabled       *bool `json:"enabled"`
		IncludeAssets *bool `json:"include_assets"`
		IntervalHours int   `json:"interval_hours"`
		KeepCount     int   `json:"keep_count"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	updated, err := a.backup.UpdateSettings(r.Context(), req.Enabled, req.IntervalHours, req.KeepCount, req.IncludeAssets)
	if errors.Is(err, backup.ErrAssetsUnavailable) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save backup settings")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (a *apiHandler) handleAdminRunBackup(w http.ResponseWriter, r *http.Request) {
	if a.backup == nil {
		writeError(w, http.StatusServiceUnavailable, "backup manager not configured")
		return
	}
	info, err := a.backup.RunNow(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to run backup")
		return
	}
	writeJSON(w, http.StatusCreated, info)
}

func (a *apiHandler) handleAdminDownloadBackup(w http.ResponseWriter, r *http.Request) {
	if a.backup == nil {
		writeError(w, http.StatusServiceUnavailable, "backup manager not configured")
		return
	}
	filename := chi.URLParam(r, "filename")
	fullPath, err := a.backup.ResolvePath(filename)
	if err != nil {
		writeError(w, http.StatusNotFound, "backup not found")
		return
	}
	contentType := "application/octet-stream"
	if strings.HasSuffix(filename, ".zip") {
		contentType = "application/zip"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	http.ServeFile(w, r, fullPath)
}

func (a *apiHandler) handleAdminDeleteBackup(w http.ResponseWriter, r *http.Request) {
	if a.backup == nil {
		writeError(w, http.StatusServiceUnavailable, "backup manager not configured")
		return
	}
	filename := chi.URLParam(r, "filename")
	if err := a.backup.DeleteBackup(filename); err != nil {
		writeError(w, http.StatusNotFound, "backup not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
