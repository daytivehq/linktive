package httpapi

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/linktive/linktive/internal/domain"
	"github.com/linktive/linktive/internal/store"
	"github.com/linktive/linktive/internal/transfer"
	"github.com/linktive/linktive/internal/urlutil"
)

func (a *apiHandler) handleExportWorkspace(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleViewer) {
		return
	}

	format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
	if format == "" {
		format = "json"
	}

	collections, err := a.store.ListCollections(r.Context(), wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load collections")
		return
	}

	var bookmarks []domain.Bookmark
	offset := 0
	for {
		res, err := a.store.SearchBookmarks(r.Context(), store.SearchQuery{
			WorkspaceID: wsID,
			Sort:        "oldest",
			Limit:       200,
			Offset:      offset,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to load bookmarks")
			return
		}
		bookmarks = append(bookmarks, res.Items...)
		if len(res.Items) < 200 || len(bookmarks) >= res.Total {
			break
		}
		offset += len(res.Items)
	}

	dateTag := time.Now().Format("2006-01-02")
	var (
		payload     []byte
		contentType string
		ext         string
	)
	switch format {
	case "json":
		payload, err = transfer.ExportJSON(collections, bookmarks)
		contentType = "application/json; charset=utf-8"
		ext = "json"
	case "html":
		payload, err = transfer.ExportHTML(collections, bookmarks)
		contentType = "text/html; charset=utf-8"
		ext = "html"
	case "csv":
		payload, err = transfer.ExportCSV(collections, bookmarks)
		contentType = "text/csv; charset=utf-8"
		ext = "csv"
	default:
		writeError(w, http.StatusBadRequest, "unsupported export format (use json, html, or csv)")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to serialize export")
		return
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="linktive-export-%s.%s"`, dateTag, ext))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(payload)
}

func (a *apiHandler) handleImportWorkspace(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsID")
	if !a.authorizeWorkspace(w, r, wsID, domain.RoleEditor) {
		return
	}
	user, _ := userFromContext(r.Context())

	var (
		format         string
		skipDuplicates = true
		rawBytes       []byte
	)

	ct := strings.ToLower(r.Header.Get("Content-Type"))
	if strings.HasPrefix(ct, "multipart/form-data") {
		if err := r.ParseMultipartForm(16 << 20); err != nil {
			writeError(w, http.StatusBadRequest, "invalid multipart form")
			return
		}
		format = r.FormValue("format")
		skipDuplicates = transfer.ParseBoolDefault(r.FormValue("skip_duplicates"), true)
		file, _, err := r.FormFile("file")
		if err != nil {
			writeError(w, http.StatusBadRequest, "import file is required")
			return
		}
		defer func() { _ = file.Close() }()
		rawBytes, err = io.ReadAll(io.LimitReader(file, 16<<20))
		if err != nil {
			writeError(w, http.StatusBadRequest, "failed to read import file")
			return
		}
	} else {
		var req struct {
			Format         string `json:"format"`
			Content        string `json:"content"`
			SkipDuplicates *bool  `json:"skip_duplicates"`
		}
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid import payload")
			return
		}
		format = req.Format
		if req.SkipDuplicates != nil {
			skipDuplicates = *req.SkipDuplicates
		}
		rawBytes = []byte(req.Content)
	}

	bundle, detectedFormat, err := transfer.ParseImport(format, rawBytes)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to parse import file: "+err.Error())
		return
	}

	existingCols, err := a.store.ListCollections(r.Context(), wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load collections")
		return
	}

	// Build lookup map keyed by "parentID|lowercaseName".
	colIndex := make(map[string]domain.Collection, len(existingCols))
	colKey := func(parentID *string, name string) string {
		pid := ""
		if parentID != nil {
			pid = *parentID
		}
		return pid + "|" + strings.ToLower(strings.TrimSpace(name))
	}
	for _, c := range existingCols {
		colIndex[colKey(c.ParentID, c.Name)] = c
	}

	ensureCollectionPath := func(path []string, meta *transfer.ImportedCollection) (*string, error) {
		var parentID *string
		for idx, seg := range path {
			name := strings.TrimSpace(seg)
			if name == "" {
				continue
			}
			key := colKey(parentID, name)
			if found, ok := colIndex[key]; ok {
				idCopy := found.ID
				parentID = &idCopy
				continue
			}
			in := store.CreateCollectionInput{
				WorkspaceID: wsID,
				ParentID:    parentID,
				Name:        name,
			}
			if meta != nil && idx == len(path)-1 {
				in.Description = meta.Description
				in.Icon = meta.Icon
				in.Color = meta.Color
			}
			created, err := a.store.CreateCollection(r.Context(), in)
			if err != nil {
				return nil, err
			}
			colIndex[key] = created
			idCopy := created.ID
			parentID = &idCopy
		}
		return parentID, nil
	}

	createdCollections := 0
	beforeCount := len(colIndex)
	for i := range bundle.Collections {
		c := bundle.Collections[i]
		if _, err := ensureCollectionPath(c.Path, &c); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create imported collection")
			return
		}
	}
	createdCollections = len(colIndex) - beforeCount

	importedCount := 0
	skippedCount := 0
	failedCount := 0

	for _, item := range bundle.Bookmarks {
		targetURL, err := urlutil.EnsureScheme(item.URL)
		if err != nil {
			failedCount++
			continue
		}
		normURL, hostDomain, err := urlutil.Normalize(targetURL)
		if err != nil {
			failedCount++
			continue
		}

		var colID *string
		if len(item.CollectionPath) > 0 {
			before := len(colIndex)
			colID, err = ensureCollectionPath(item.CollectionPath, nil)
			if err != nil {
				failedCount++
				continue
			}
			createdCollections += len(colIndex) - before
		}

		title := strings.TrimSpace(item.Title)
		if title == "" {
			title = hostDomain
		}
		faviconURL := ""
		if parsed, pErr := url.Parse(targetURL); pErr == nil && parsed.Host != "" {
			faviconURL = parsed.Scheme + "://" + parsed.Host + "/favicon.ico"
		}

		_, err = a.store.CreateBookmark(r.Context(), store.CreateBookmarkInput{
			WorkspaceID:    wsID,
			CollectionID:   colID,
			CreatedBy:      user.ID,
			URL:            targetURL,
			NormalizedURL:  normURL,
			Domain:         hostDomain,
			Title:          title,
			Description:    item.Description,
			Note:           item.Note,
			FaviconURL:     faviconURL,
			IsFavorite:     item.IsFavorite,
			Tags:           item.Tags,
			AllowDuplicate: !skipDuplicates,
		})
		if errors.Is(err, store.ErrDuplicateURL) {
			skippedCount++
			continue
		}
		if err != nil {
			failedCount++
			continue
		}
		importedCount++
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"format":              detectedFormat,
		"imported":            importedCount,
		"skipped":             skippedCount,
		"failed":              failedCount,
		"created_collections": createdCollections,
	})
}
