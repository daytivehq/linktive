package clipper

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	stdhtml "html"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/linktive/linktive/internal/domain"
	"github.com/linktive/linktive/internal/store"
)

const (
	ModeReadable = "readable"
	ModeHTML     = "html"
	ModeBoth     = "both"
)

// NormalizeArchiveMode ensures mode is one of readable, html, or both.
func NormalizeArchiveMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case ModeHTML, "snapshot":
		return ModeHTML
	case ModeBoth:
		return ModeBoth
	default:
		return ModeReadable
	}
}

type clipJob struct {
	workspaceID string
	bookmarkID  string
	createdBy   string
	url         string
	mode        string
}

// ClipOptions configures clipping mode and incremental merge behavior.
type ClipOptions struct {
	Mode  string
	Merge bool
}

// Manager handles readable/snapshot web page clipping, local asset caching, size limit enforcement, and cleanup.
type Manager struct {
	store      store.Store
	assetsDir  string
	dbPath     string
	backupsDir string
	queue      chan clipJob
	httpClient *http.Client
}

// NewManager creates an archiving manager storing local image/CSS assets under assetsDir.
func NewManager(st store.Store, assetsDir, dbPath, backupsDir string) *Manager {
	return &Manager{
		store:      st,
		assetsDir:  assetsDir,
		dbPath:     dbPath,
		backupsDir: backupsDir,
		queue:      make(chan clipJob, 128),
		httpClient: &http.Client{Timeout: 12 * time.Second},
	}
}

// AssetsDir returns the root directory path where archived assets are stored.
func (m *Manager) AssetsDir() string {
	return m.assetsDir
}

// Start launches background workers that process auto-clip jobs until ctx is canceled.
func (m *Manager) Start(ctx context.Context) {
	const workers = 2
	for i := 0; i < workers; i++ {
		go func() {
			for {
				select {
				case <-ctx.Done():
					return
				case job := <-m.queue:
					jobCtx, cancel := context.WithTimeout(ctx, 25*time.Second)
					_, _ = m.ClipURLWithMode(jobCtx, job.workspaceID, job.bookmarkID, job.createdBy, job.url, job.mode)
					cancel()
				}
			}
		}()
	}
}

// EnqueueClip schedules an asynchronous readable background archive job for a newly created bookmark.
func (m *Manager) EnqueueClip(ctx context.Context, workspaceID, bookmarkID, createdBy, targetURL string) {
	m.EnqueueClipWithMode(ctx, workspaceID, bookmarkID, createdBy, targetURL, ModeReadable)
}

// EnqueueClipWithMode schedules an asynchronous background archive job using the requested archive mode.
func (m *Manager) EnqueueClipWithMode(ctx context.Context, workspaceID, bookmarkID, createdBy, targetURL, mode string) {
	normMode := NormalizeArchiveMode(mode)
	_ = m.store.UpsertBookmarkArchive(ctx, domain.BookmarkArchive{
		BookmarkID:  bookmarkID,
		WorkspaceID: workspaceID,
		CreatedBy:   createdBy,
		Source:      "server",
		ArchiveMode: normMode,
		Status:      "pending",
	})
	select {
	case m.queue <- clipJob{
		workspaceID: workspaceID,
		bookmarkID:  bookmarkID,
		createdBy:   createdBy,
		url:         targetURL,
		mode:        normMode,
	}:
	default:
		_ = m.store.UpsertBookmarkArchive(ctx, domain.BookmarkArchive{
			BookmarkID:   bookmarkID,
			WorkspaceID:  workspaceID,
			CreatedBy:    createdBy,
			Source:       "server",
			ArchiveMode:  normMode,
			Status:       "failed",
			ErrorMessage: "clip queue is busy; please retry manually",
		})
	}
}

// ClipURL downloads a bookmark URL in readable mode and persists the archive.
func (m *Manager) ClipURL(ctx context.Context, workspaceID, bookmarkID, createdBy, targetURL string) (domain.BookmarkArchive, error) {
	return m.ClipURLWithMode(ctx, workspaceID, bookmarkID, createdBy, targetURL, ModeReadable)
}

// ClipURLWithMode downloads a bookmark URL, archives readable and/or snapshot HTML, caches local assets, and persists.
func (m *Manager) ClipURLWithMode(ctx context.Context, workspaceID, bookmarkID, createdBy, targetURL, mode string) (domain.BookmarkArchive, error) {
	return m.ClipURLWithOptions(ctx, workspaceID, bookmarkID, createdBy, targetURL, ClipOptions{Mode: mode})
}

// ClipURLWithOptions downloads a bookmark URL and archives it with the specified ClipOptions.
func (m *Manager) ClipURLWithOptions(ctx context.Context, workspaceID, bookmarkID, createdBy, targetURL string, opts ClipOptions) (domain.BookmarkArchive, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return m.recordFailure(ctx, workspaceID, bookmarkID, createdBy, "server", err.Error()), err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; linktive-clipper/0.3)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return m.recordFailure(ctx, workspaceID, bookmarkID, createdBy, "server", err.Error()), err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		msg := fmt.Sprintf("HTTP %d from target site", resp.StatusCode)
		return m.recordFailure(ctx, workspaceID, bookmarkID, createdBy, "server", msg), errors.New(msg)
	}

	rawBytes, err := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024))
	if err != nil {
		return m.recordFailure(ctx, workspaceID, bookmarkID, createdBy, "server", err.Error()), err
	}

	finalURL := targetURL
	if resp.Request != nil && resp.Request.URL != nil {
		finalURL = resp.Request.URL.String()
	}

	return m.SaveHTMLWithOptions(ctx, workspaceID, bookmarkID, createdBy, "server", finalURL, rawBytes, "", "", "", opts)
}

// SaveHTML sanitizes HTML in readable mode, caches referenced images, and persists the archive.
func (m *Manager) SaveHTML(
	ctx context.Context,
	workspaceID, bookmarkID, createdBy, source, pageURL string,
	rawHTML []byte,
	overrideTitle, overrideByline, overrideSite string,
) (domain.BookmarkArchive, error) {
	return m.SaveHTMLWithOptions(ctx, workspaceID, bookmarkID, createdBy, source, pageURL, rawHTML, overrideTitle, overrideByline, overrideSite, ClipOptions{Mode: ModeReadable})
}

// SaveHTMLWithMode sanitizes HTML for the requested archive mode (readable, html, or both),
// caches referenced images/stylesheets respecting ArchivePolicy, and persists the archive.
func (m *Manager) SaveHTMLWithMode(
	ctx context.Context,
	workspaceID, bookmarkID, createdBy, source, mode, pageURL string,
	rawHTML []byte,
	overrideTitle, overrideByline, overrideSite string,
) (domain.BookmarkArchive, error) {
	return m.SaveHTMLWithOptions(ctx, workspaceID, bookmarkID, createdBy, source, pageURL, rawHTML, overrideTitle, overrideByline, overrideSite, ClipOptions{Mode: mode})
}

// SaveHTMLWithOptions sanitizes HTML and either replaces or merges into an existing archive.
func (m *Manager) SaveHTMLWithOptions(
	ctx context.Context,
	workspaceID, bookmarkID, createdBy, source, pageURL string,
	rawHTML []byte,
	overrideTitle, overrideByline, overrideSite string,
	opts ClipOptions,
) (domain.BookmarkArchive, error) {
	normMode := NormalizeArchiveMode(opts.Mode)
	extracted := ExtractArticle(rawHTML, pageURL)
	if strings.TrimSpace(overrideTitle) != "" {
		extracted.Title = strings.TrimSpace(overrideTitle)
	}
	if strings.TrimSpace(overrideByline) != "" {
		extracted.Byline = strings.TrimSpace(overrideByline)
	}
	if strings.TrimSpace(overrideSite) != "" {
		extracted.SiteName = strings.TrimSpace(overrideSite)
	}

	var snap ExtractedSnapshot
	if normMode == ModeHTML || normMode == ModeBoth {
		snap = ExtractSnapshot(rawHTML, pageURL)
	}

	// Prioritize primary article images before general page icons/thumbnails so article media is never truncated.
	imageURLs := mergeUniqueURLs(extracted.ImageURLs, snap.ImageURLs)

	policy, err := m.store.GetArchivePolicy(ctx)
	if err != nil {
		policy = domain.ArchivePolicy{LimitEnabled: true, MaxAssetMB: 10, MaxBookmarkMB: 30}
	}

	var existing domain.BookmarkArchive
	hasExisting := false
	if opts.Merge {
		if prev, pErr := m.store.GetBookmarkArchive(ctx, workspaceID, bookmarkID); pErr == nil && prev.Status == "ready" {
			existing = prev
			hasExisting = true
		}
	}

	assetDir := filepath.Join(m.assetsDir, workspaceID, bookmarkID)
	var existingBytes int64
	if !hasExisting {
		m.DeleteBookmarkAssets(workspaceID, bookmarkID)
	} else {
		_, existingBytes = MeasureDir(assetDir)
	}

	urlRewriteMap, _, _, notice := m.downloadAssets(ctx, workspaceID, bookmarkID, pageURL, assetDir, imageURLs, snap.StylesheetURLs, policy, existingBytes)

	finalContentHTML := ""
	if normMode == ModeReadable || normMode == ModeBoth {
		finalContentHTML = applyAssetRewrites(extracted.ContentHTML, urlRewriteMap)
	}
	finalSnapshotHTML := ""
	if normMode == ModeHTML || normMode == ModeBoth {
		finalSnapshotHTML = applyAssetRewrites(snap.SnapshotHTML, urlRewriteMap)
	}

	finalMode := normMode
	finalTitle := extracted.Title
	finalByline := extracted.Byline
	finalSite := extracted.SiteName
	finalText := extracted.ContentText

	if hasExisting {
		if finalContentHTML == "" && existing.ContentHTML != "" {
			finalContentHTML = existing.ContentHTML
		}
		if finalSnapshotHTML == "" && existing.SnapshotHTML != "" {
			finalSnapshotHTML = existing.SnapshotHTML
		}
		if finalContentHTML != "" && finalSnapshotHTML != "" {
			finalMode = ModeBoth
		} else if finalSnapshotHTML != "" {
			finalMode = ModeHTML
		} else {
			finalMode = ModeReadable
		}
		if finalTitle == "" {
			finalTitle = existing.Title
		}
		if finalByline == "" {
			finalByline = existing.Byline
		}
		if finalSite == "" {
			finalSite = existing.SiteName
		}
		if strings.TrimSpace(existing.ContentText) != "" && normMode == ModeHTML {
			finalText = existing.ContentText
		}
	}

	assetCount, assetBytes := MeasureDir(assetDir)
	totalBytes := assetBytes + int64(len(finalContentHTML)) + int64(len(finalSnapshotHTML)) + int64(len(finalText))
	ar := domain.BookmarkArchive{
		BookmarkID:   bookmarkID,
		WorkspaceID:  workspaceID,
		CreatedBy:    createdBy,
		Source:       source,
		ArchiveMode:  finalMode,
		Status:       "ready",
		ErrorMessage: notice,
		Title:        finalTitle,
		Byline:       finalByline,
		SiteName:     finalSite,
		ContentHTML:  finalContentHTML,
		SnapshotHTML: finalSnapshotHTML,
		ContentText:  finalText,
		AssetCount:   assetCount,
		TotalBytes:   totalBytes,
		ArchivedAt:   time.Now().UTC(),
	}
	if err := m.store.UpsertBookmarkArchive(ctx, ar); err != nil {
		return domain.BookmarkArchive{}, err
	}
	return m.store.GetBookmarkArchive(ctx, workspaceID, bookmarkID)
}

func mergeUniqueURLs(groups ...[]string) []string {
	seen := make(map[string]struct{})
	var merged []string
	for _, g := range groups {
		for _, u := range g {
			if _, ok := seen[u]; ok {
				continue
			}
			seen[u] = struct{}{}
			merged = append(merged, u)
		}
	}
	return merged
}

func applyAssetRewrites(markup string, rewrites map[string]string) string {
	if markup == "" || len(rewrites) == 0 {
		return markup
	}
	pairs := make([]string, 0, len(rewrites)*6)
	for remoteURL, localPath := range rewrites {
		escapedRemote := stdhtml.EscapeString(remoteURL)
		for _, attr := range []string{`src="`, `href="`, `poster="`, `srcset="`} {
			pairs = append(pairs, attr+remoteURL+`"`, attr+localPath+`"`)
			if escapedRemote != remoteURL {
				pairs = append(pairs, attr+escapedRemote+`"`, attr+localPath+`"`)
			}
		}
	}
	return strings.NewReplacer(pairs...).Replace(markup)
}

type assetFetchJob struct {
	url   string
	isCSS bool
}

func (m *Manager) downloadAssets(
	ctx context.Context,
	workspaceID, bookmarkID, refererURL, assetDir string,
	imageURLs, cssURLs []string,
	policy domain.ArchivePolicy,
	existingBytes int64,
) (rewrites map[string]string, assetCount int, totalBytes int64, notice string) {
	rewrites = make(map[string]string)
	totalBytes = existingBytes
	if len(imageURLs) == 0 && len(cssURLs) == 0 {
		return
	}

	if err := os.MkdirAll(assetDir, 0o755); err != nil {
		return
	}

	var maxAssetBytes int64
	var maxBookmarkBytes int64
	if policy.LimitEnabled {
		maxAssetBytes = int64(policy.MaxAssetMB) * 1024 * 1024
		maxBookmarkBytes = int64(policy.MaxBookmarkMB) * 1024 * 1024
	}

	type fetchedAsset struct {
		remoteURL string
		filename  string
		data      []byte
		overLimit bool
	}

	var allJobs []assetFetchJob
	for _, u := range cssURLs {
		if len(allJobs) >= 20 {
			break
		}
		allJobs = append(allJobs, assetFetchJob{url: u, isCSS: true})
	}
	imgCap := 120
	for i, u := range imageURLs {
		if i >= imgCap {
			break
		}
		allJobs = append(allJobs, assetFetchJob{url: u, isCSS: false})
	}
	if len(allJobs) == 0 {
		if existingBytes == 0 {
			_ = os.Remove(assetDir)
		}
		return
	}

	jobs := make(chan assetFetchJob, len(allJobs))
	for _, j := range allJobs {
		jobs <- j
	}
	close(jobs)

	results := make([]fetchedAsset, 0, len(allJobs))
	var mu sync.Mutex
	var wg sync.WaitGroup
	workers := 4
	if len(allJobs) < workers {
		workers = len(allJobs)
	}

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for job := range jobs {
				if strings.HasPrefix(strings.ToLower(job.url), "data:") {
					continue
				}
				var (
					data      []byte
					ext       string
					overLimit bool
					err       error
				)
				if job.isCSS {
					data, overLimit, err = m.fetchStylesheet(ctx, job.url, refererURL, maxAssetBytes)
					ext = ".css"
				} else {
					data, ext, overLimit, err = m.fetchSingleImage(ctx, job.url, refererURL, maxAssetBytes)
				}
				if err != nil {
					continue
				}
				if overLimit {
					mu.Lock()
					results = append(results, fetchedAsset{remoteURL: job.url, overLimit: true})
					mu.Unlock()
					continue
				}
				sum := sha256.Sum256([]byte(job.url))
				filename := hex.EncodeToString(sum[:8]) + ext
				mu.Lock()
				results = append(results, fetchedAsset{
					remoteURL: job.url,
					filename:  filename,
					data:      data,
				})
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	skippedForLimit := 0
	for _, r := range results {
		dest := filepath.Join(assetDir, r.filename)
		localURL := fmt.Sprintf("/api/v1/workspaces/%s/bookmarks/%s/assets/%s",
			url.PathEscape(workspaceID), url.PathEscape(bookmarkID), url.PathEscape(r.filename))
		if r.overLimit {
			skippedForLimit++
			continue
		}
		// Reuse existing cached file without counting against remaining budget if already saved.
		if _, statErr := os.Stat(dest); statErr == nil {
			rewrites[r.remoteURL] = localURL
			continue
		}
		if maxBookmarkBytes > 0 && totalBytes+int64(len(r.data)) > maxBookmarkBytes {
			skippedForLimit++
			continue
		}
		if err := os.WriteFile(dest, r.data, 0o644); err != nil {
			continue
		}
		totalBytes += int64(len(r.data))
		assetCount++
		rewrites[r.remoteURL] = localURL
	}

	if assetCount == 0 && existingBytes == 0 {
		_ = os.Remove(assetDir)
	}
	if skippedForLimit > 0 {
		notice = fmt.Sprintf("용량 제한 정책에 따라 리소스 %d개는 로컬 저장에서 제외되었습니다.", skippedForLimit)
	}
	return
}

func (m *Manager) fetchStylesheet(ctx context.Context, cssURL, refererURL string, maxAssetBytes int64) ([]byte, bool, error) {
	reqCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, cssURL, nil)
	if err != nil {
		return nil, false, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; linktive-clipper/0.3)")
	if refererURL != "" {
		req.Header.Set("Referer", refererURL)
	}

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, false, err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return nil, false, fmt.Errorf("status %d", resp.StatusCode)
	}
	if maxAssetBytes > 0 && resp.ContentLength > maxAssetBytes {
		return nil, true, nil
	}

	readCap := int64(16 * 1024 * 1024)
	if maxAssetBytes > 0 {
		readCap = maxAssetBytes + 1
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, readCap))
	if err != nil {
		return nil, false, err
	}
	if maxAssetBytes > 0 && int64(len(data)) > maxAssetBytes {
		return nil, true, nil
	}

	rewritten := RewriteCSSURLs(string(data), cssURL)
	return []byte(rewritten), false, nil
}

func (m *Manager) fetchSingleImage(ctx context.Context, imgURL, refererURL string, maxAssetBytes int64) ([]byte, string, bool, error) {
	reqCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, imgURL, nil)
	if err != nil {
		return nil, "", false, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; linktive-clipper/0.3)")
	if refererURL != "" {
		req.Header.Set("Referer", refererURL)
	}

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, "", false, err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return nil, "", false, fmt.Errorf("status %d", resp.StatusCode)
	}

	ct := strings.ToLower(resp.Header.Get("Content-Type"))
	if ct != "" && !strings.HasPrefix(ct, "image/") && !strings.Contains(ct, "octet-stream") {
		return nil, "", false, errors.New("not an image")
	}
	if maxAssetBytes > 0 && resp.ContentLength > maxAssetBytes {
		return nil, "", true, nil
	}

	readCap := int64(64 * 1024 * 1024)
	if maxAssetBytes > 0 {
		readCap = maxAssetBytes + 1
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, readCap))
	if err != nil {
		return nil, "", false, err
	}
	if maxAssetBytes > 0 && int64(len(data)) > maxAssetBytes {
		return nil, "", true, nil
	}

	ext := detectImageExt(imgURL, ct)
	return data, ext, false, nil
}

func detectImageExt(imgURL, contentType string) string {
	mediaType, _, _ := mime.ParseMediaType(contentType)
	switch mediaType {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	case "image/svg+xml":
		return ".svg"
	case "image/avif":
		return ".avif"
	}
	if u, err := url.Parse(imgURL); err == nil {
		ext := strings.ToLower(filepath.Ext(u.Path))
		switch ext {
		case ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif":
			return ext
		}
	}
	return ".img"
}

func (m *Manager) recordFailure(ctx context.Context, workspaceID, bookmarkID, createdBy, source, msg string) domain.BookmarkArchive {
	ar := domain.BookmarkArchive{
		BookmarkID:   bookmarkID,
		WorkspaceID:  workspaceID,
		CreatedBy:    createdBy,
		Source:       source,
		Status:       "failed",
		ErrorMessage: msg,
		ArchivedAt:   time.Now().UTC(),
	}
	_ = m.store.UpsertBookmarkArchive(ctx, ar)
	return ar
}

// ResolveAssetPath validates parameters against directory traversal and returns the file path on disk.
func (m *Manager) ResolveAssetPath(workspaceID, bookmarkID, filename string) (string, error) {
	if filepath.Base(workspaceID) != workspaceID || filepath.Base(bookmarkID) != bookmarkID || filepath.Base(filename) != filename {
		return "", errors.New("invalid asset path")
	}
	if strings.Contains(filename, "..") || strings.Contains(workspaceID, "..") || strings.Contains(bookmarkID, "..") {
		return "", errors.New("invalid asset path")
	}
	full := filepath.Join(m.assetsDir, workspaceID, bookmarkID, filename)
	info, err := os.Stat(full)
	if err != nil || info.IsDir() {
		return "", os.ErrNotExist
	}
	return full, nil
}

// DeleteBookmarkAssets removes cached assets for a single bookmark.
func (m *Manager) DeleteBookmarkAssets(workspaceID, bookmarkID string) {
	if workspaceID == "" || bookmarkID == "" || filepath.Base(workspaceID) != workspaceID || filepath.Base(bookmarkID) != bookmarkID {
		return
	}
	_ = os.RemoveAll(filepath.Join(m.assetsDir, workspaceID, bookmarkID))
}

// DeleteWorkspaceAssets removes all cached assets for a workspace.
func (m *Manager) DeleteWorkspaceAssets(workspaceID string) {
	if workspaceID == "" || filepath.Base(workspaceID) != workspaceID {
		return
	}
	_ = os.RemoveAll(filepath.Join(m.assetsDir, workspaceID))
}

// CleanupOrphanAssets removes asset directories whose bookmarks or archives no longer exist in SQLite.
func (m *Manager) CleanupOrphanAssets(ctx context.Context) (removedFiles int, freedBytes int64, err error) {
	wsEntries, err := os.ReadDir(m.assetsDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return 0, 0, nil
		}
		return 0, 0, err
	}

	for _, wsEntry := range wsEntries {
		if !wsEntry.IsDir() {
			continue
		}
		wsID := wsEntry.Name()
		wsPath := filepath.Join(m.assetsDir, wsID)
		bmEntries, rErr := os.ReadDir(wsPath)
		if rErr != nil {
			continue
		}
		for _, bmEntry := range bmEntries {
			if !bmEntry.IsDir() {
				continue
			}
			bmID := bmEntry.Name()
			exists, aErr := m.store.ArchiveExists(ctx, wsID, bmID)
			if aErr != nil || exists {
				continue
			}
			bmPath := filepath.Join(wsPath, bmID)
			files, size := MeasureDir(bmPath)
			if rmErr := os.RemoveAll(bmPath); rmErr == nil {
				removedFiles += files
				freedBytes += size
			}
		}
		if remaining, _ := os.ReadDir(wsPath); len(remaining) == 0 {
			_ = os.Remove(wsPath)
		}
	}
	return removedFiles, freedBytes, nil
}

// EnrichAdminUsage populates disk sizes for DB, assets, and backups directories.
func (m *Manager) EnrichAdminUsage(usage *domain.AdminUsage) {
	if m.dbPath != "" && m.dbPath != ":memory:" {
		if info, err := os.Stat(m.dbPath); err == nil {
			usage.DBSizeBytes = info.Size()
		}
	}
	usage.AssetsFileCount, usage.AssetsSizeBytes = MeasureDir(m.assetsDir)
	usage.BackupsFileCount, usage.BackupsSizeBytes = MeasureDir(m.backupsDir)
}

// MeasureDir recursively counts regular files and total bytes in dir.
func MeasureDir(dir string) (count int, total int64) {
	_ = filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if info, iErr := d.Info(); iErr == nil {
			count++
			total += info.Size()
		}
		return nil
	})
	return count, total
}
