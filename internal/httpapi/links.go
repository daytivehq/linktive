package httpapi

import (
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/linktive/linktive/internal/domain"
	"github.com/linktive/linktive/internal/store"
	"github.com/linktive/linktive/internal/urlutil"
)

func (a *apiHandler) handleCheckBookmarkLink(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	bmID := chi.URLParam(r, "bmID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}

	bm, err := a.store.GetBookmark(r.Context(), wsID, bmID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "bookmark not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load bookmark")
		return
	}

	status := urlutil.CheckURL(r.Context(), bm.URL)
	now := time.Now().UTC()
	if err := a.store.UpdateBookmarkLinkStatus(r.Context(), wsID, bmID, status, now); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update link status")
		return
	}
	updated, err := a.store.GetBookmark(r.Context(), wsID, bmID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload bookmark")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (a *apiHandler) handleCheckWorkspaceLinks(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}

	var req struct {
		OnlyUnchecked bool `json:"only_unchecked"`
	}
	_ = decodeJSON(r, &req)

	bookmarks, err := a.store.ListWorkspaceBookmarksForCheck(r.Context(), wsID, req.OnlyUnchecked)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load bookmarks")
		return
	}

	summary := domain.LinkCheckSummary{
		Items: make([]domain.Bookmark, 0),
	}
	if len(bookmarks) == 0 {
		writeJSON(w, http.StatusOK, summary)
		return
	}

	const workerCount = 6
	jobs := make(chan domain.Bookmark, len(bookmarks))
	for _, bm := range bookmarks {
		jobs <- bm
	}
	close(jobs)

	var (
		mu sync.Mutex
		wg sync.WaitGroup
	)
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for bm := range jobs {
				status := urlutil.CheckURL(r.Context(), bm.URL)
				now := time.Now().UTC()
				if err := a.store.UpdateBookmarkLinkStatus(r.Context(), wsID, bm.ID, status, now); err != nil {
					continue
				}
				bm.LinkStatus = status
				bm.LastCheckedAt = &now

				mu.Lock()
				summary.Checked++
				switch status {
				case domain.LinkStatusOK:
					summary.OKCount++
				case domain.LinkStatusBroken:
					summary.BrokenCount++
					summary.Items = append(summary.Items, bm)
				case domain.LinkStatusBlocked:
					summary.BlockedCount++
					summary.Items = append(summary.Items, bm)
				}
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	writeJSON(w, http.StatusOK, summary)
}

func (a *apiHandler) handleSetBookmarkLinkStatus(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	bmID := chi.URLParam(r, "bmID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}

	var req struct {
		LinkStatus domain.LinkStatus `json:"link_status"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	switch req.LinkStatus {
	case domain.LinkStatusOK, domain.LinkStatusBroken, domain.LinkStatusBlocked, domain.LinkStatusUnknown:
	default:
		writeError(w, http.StatusBadRequest, "invalid link_status")
		return
	}

	now := time.Now().UTC()
	if err := a.store.UpdateBookmarkLinkStatus(r.Context(), wsID, bmID, req.LinkStatus, now); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "bookmark not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update link status")
		return
	}
	updated, err := a.store.GetBookmark(r.Context(), wsID, bmID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload bookmark")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (a *apiHandler) handleListDuplicateLinks(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleViewer) {
		return
	}
	res, err := a.store.ListDuplicateBookmarks(r.Context(), wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list duplicate links")
		return
	}
	writeJSON(w, http.StatusOK, res)
}
