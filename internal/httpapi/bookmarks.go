package httpapi

import (
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/linktive/linktive/internal/domain"
	"github.com/linktive/linktive/internal/search"
	"github.com/linktive/linktive/internal/store"
	"github.com/linktive/linktive/internal/urlutil"
)

func (a *apiHandler) handleListBookmarks(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleViewer) {
		return
	}

	qp := r.URL.Query()
	sq := search.ParseQuery(wsID, qp.Get("q"))
	sq.Sort = strings.TrimSpace(qp.Get("sort"))
	if sq.Sort == "" {
		if sq.Raw != "" && len(sq.Terms) > 0 {
			sq.Sort = "relevance"
		} else {
			sq.Sort = "newest"
		}
	}

	if colID := strings.TrimSpace(qp.Get("collection_id")); colID != "" {
		sq.CollectionID = &colID
	}
	if qp.Get("favorite") == "true" || qp.Get("favorite") == "1" {
		t := true
		sq.OnlyFavorite = &t
	}
	if tag := strings.TrimSpace(qp.Get("tag")); tag != "" {
		sq.IncludeTags = append(sq.IncludeTags, strings.ToLower(tag))
	}
	if limit, err := strconv.Atoi(qp.Get("limit")); err == nil && limit > 0 {
		sq.Limit = limit
	}
	if offset, err := strconv.Atoi(qp.Get("offset")); err == nil && offset >= 0 {
		sq.Offset = offset
	}

	res, err := a.store.SearchBookmarks(r.Context(), sq)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to search bookmarks")
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (a *apiHandler) handleCreateBookmark(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}
	user, _ := userFromContext(r.Context())

	var req struct {
		URL            string   `json:"url"`
		Title          string   `json:"title"`
		Description    string   `json:"description"`
		Note           string   `json:"note"`
		CollectionID   *string  `json:"collection_id"`
		Tags           []string `json:"tags"`
		IsFavorite     bool     `json:"is_favorite"`
		AllowDuplicate bool     `json:"allow_duplicate"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	targetURL, err := urlutil.EnsureScheme(req.URL)
	if err != nil {
		writeError(w, http.StatusBadRequest, "valid http/https url is required")
		return
	}
	normalizedURL, hostDomain, err := urlutil.Normalize(targetURL)
	if err != nil {
		writeError(w, http.StatusBadRequest, "valid http/https url is required")
		return
	}

	title := strings.TrimSpace(req.Title)
	description := strings.TrimSpace(req.Description)
	faviconURL := ""
	if title == "" || description == "" {
		meta := urlutil.FetchMetadata(r.Context(), targetURL)
		if title == "" {
			title = meta.Title
		}
		if description == "" {
			description = meta.Description
		}
		faviconURL = meta.FaviconURL
	}
	if faviconURL == "" {
		if parsed, pErr := url.Parse(targetURL); pErr == nil && parsed.Host != "" {
			faviconURL = parsed.Scheme + "://" + parsed.Host + "/favicon.ico"
		}
	}
	if title == "" {
		title = hostDomain
	}

	bm, err := a.store.CreateBookmark(r.Context(), store.CreateBookmarkInput{
		WorkspaceID:    wsID,
		CollectionID:   req.CollectionID,
		CreatedBy:      user.ID,
		URL:            targetURL,
		NormalizedURL:  normalizedURL,
		Domain:         hostDomain,
		Title:          title,
		Description:    description,
		Note:           req.Note,
		FaviconURL:     faviconURL,
		IsFavorite:     req.IsFavorite,
		Tags:           req.Tags,
		AllowDuplicate: req.AllowDuplicate,
	})
	var dupErr *store.DuplicateURLError
	if errors.As(err, &dupErr) {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error":    "duplicate url exists in workspace",
			"existing": dupErr.Existing,
		})
		return
	}
	if errors.Is(err, store.ErrInvalidParent) {
		writeError(w, http.StatusBadRequest, "invalid collection_id")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create bookmark")
		return
	}
	writeJSON(w, http.StatusCreated, bm)
}

func (a *apiHandler) handleGetBookmark(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	bmID := chi.URLParam(r, "bmID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleViewer) {
		return
	}
	bm, err := a.store.GetBookmark(r.Context(), wsID, bmID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "bookmark not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch bookmark")
		return
	}
	writeJSON(w, http.StatusOK, bm)
}

func (a *apiHandler) handleUpdateBookmark(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	bmID := chi.URLParam(r, "bmID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}

	var raw map[string]any
	if err := decodeJSON(r, &raw); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	input := store.UpdateBookmarkInput{
		WorkspaceID: wsID,
		BookmarkID:  bmID,
	}

	if targetWS, ok := raw["target_workspace_id"].(string); ok && strings.TrimSpace(targetWS) != "" {
		targetWS = strings.TrimSpace(targetWS)
		if !a.authorizeWorkspace(w, r, targetWS, domain.RoleEditor) {
			return
		}
		input.TargetWorkspaceID = &targetWS
	}

	if colVal, exists := raw["collection_id"]; exists {
		if colVal == nil || colVal == "" {
			input.ClearCollection = true
		} else if s, ok := colVal.(string); ok {
			input.CollectionID = &s
		}
	}

	if u, ok := raw["url"].(string); ok && strings.TrimSpace(u) != "" {
		fixedURL, err := urlutil.EnsureScheme(u)
		if err != nil {
			writeError(w, http.StatusBadRequest, "valid http/https url is required")
			return
		}
		norm, dom, err := urlutil.Normalize(fixedURL)
		if err != nil {
			writeError(w, http.StatusBadRequest, "valid http/https url is required")
			return
		}
		input.URL = &fixedURL
		input.NormalizedURL = &norm
		input.Domain = &dom
	}
	if v, ok := raw["title"].(string); ok {
		input.Title = &v
	}
	if v, ok := raw["description"].(string); ok {
		input.Description = &v
	}
	if v, ok := raw["note"].(string); ok {
		input.Note = &v
	}
	if v, ok := raw["is_favorite"].(bool); ok {
		input.IsFavorite = &v
	}
	if rawTags, exists := raw["tags"]; exists {
		input.ReplaceTags = true
		if arr, ok := rawTags.([]any); ok {
			for _, item := range arr {
				if s, ok := item.(string); ok {
					input.Tags = append(input.Tags, s)
				}
			}
		}
	}

	updated, err := a.store.UpdateBookmark(r.Context(), input)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "bookmark not found")
		return
	}
	if errors.Is(err, store.ErrInvalidParent) {
		writeError(w, http.StatusBadRequest, "invalid collection_id")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update bookmark")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (a *apiHandler) handleDeleteBookmark(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	bmID := chi.URLParam(r, "bmID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}

	err := a.store.DeleteBookmark(r.Context(), wsID, bmID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "bookmark not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete bookmark")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (a *apiHandler) handleListTags(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleViewer) {
		return
	}
	items, err := a.store.ListTags(r.Context(), wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list tags")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *apiHandler) handleGetWorkspaceStats(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleViewer) {
		return
	}
	stats, err := a.store.GetWorkspaceStats(r.Context(), wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load workspace stats")
		return
	}
	writeJSON(w, http.StatusOK, stats)
}
