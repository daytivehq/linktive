package clipper

import (
	"bytes"
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
	"github.com/linktive/linktive/internal/urlutil"
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
	revision    string
	workspaceID string
	bookmarkID  string
	createdBy   string
	url         string
	mode        string
}

// ClipOptions configures clipping mode and incremental merge behavior.
type ClipOptions struct {
	queuedRevision string
	Mode           string
	Merge          bool
}

// Manager handles readable/snapshot web page clipping, local asset caching, size limit enforcement, and cleanup.
type Manager struct {
	store      store.Store
	assetsDir  string
	dbPath     string
	backupsDir string
	queue      chan clipJob
	archiveMu  sync.Mutex
	workers    sync.WaitGroup
	slots      chan struct{}
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
		slots:      make(chan struct{}, 2),
		httpClient: urlutil.FetchClient(12 * time.Second),
	}
}

// LockAssets serializes database changes paired with file publication or removal.
func (m *Manager) LockAssets() func() { m.archiveMu.Lock(); return m.archiveMu.Unlock }

// CopyBookmarkAssets prepares the destination before committing a move. Both
// paths remain readable until the database transaction succeeds.
func (m *Manager) CopyBookmarkAssets(from, to, id string) error {
	if !safePart(from) || !safePart(to) || !safePart(id) || from == to {
		return errors.New("invalid archive move")
	}
	src, dst := filepath.Join(m.assetsDir, from, id), filepath.Join(m.assetsDir, to, id)
	entries, err := os.ReadDir(src)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dst, 0755); err != nil {
		return err
	}
	for _, entry := range entries {
		if !entry.Type().IsRegular() {
			return errors.New("unexpected archive file")
		}
		old, newPath := filepath.Join(src, entry.Name()), filepath.Join(dst, entry.Name())
		// Accommodate copies left by an interrupted attempt.
		if err := os.Link(old, newPath); err == nil {
			continue
		}
		if err := copyAsset(old, newPath); err != nil {
			return err
		}
	}
	return nil
}

func copyAsset(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.CreateTemp(filepath.Dir(dst), ".move-*")
	if err != nil {
		return err
	}
	defer os.Remove(out.Name())
	_, err = io.Copy(out, in)
	closeErr := out.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(out.Name(), dst)
}

// AssetsDir returns the root directory path where archived assets are stored.
func (m *Manager) AssetsDir() string {
	return m.assetsDir
}

// Start launches background workers that process auto-clip jobs until ctx is canceled.
func (m *Manager) Start(ctx context.Context) {
	const workers = 2
	for i := 0; i < workers; i++ {
		m.workers.Add(1)
		go func() {
			defer m.workers.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case job := <-m.queue:
					jobCtx, cancel := context.WithTimeout(ctx, 25*time.Second)
					_, _ = m.ClipURLWithOptions(jobCtx, job.workspaceID, job.bookmarkID, job.createdBy, job.url, ClipOptions{Mode: job.mode, queuedRevision: job.revision})
					cancel()
				}
			}
		}()
	}
}

func (m *Manager) Wait() { m.workers.Wait() }

// EnqueueClipWithMode schedules an asynchronous background archive job using the requested archive mode.
func (m *Manager) EnqueueClipWithMode(ctx context.Context, workspaceID, bookmarkID, createdBy, targetURL, mode string) string {
	unlock := m.LockAssets()
	defer unlock()
	normMode := NormalizeArchiveMode(mode)
	if err := m.store.UpsertBookmarkArchive(ctx, domain.BookmarkArchive{
		BookmarkID:  bookmarkID,
		WorkspaceID: workspaceID,
		CreatedBy:   createdBy,
		Source:      "server",
		ArchiveMode: normMode,
		Status:      "pending",
	}); err != nil {
		return "failed"
	}
	ar, err := m.store.GetBookmarkArchive(ctx, workspaceID, bookmarkID)
	if err != nil {
		return "failed"
	}
	if ar.Status != "pending" {
		return ar.Status
	}
	select {
	case m.queue <- clipJob{
		revision:    ar.UpdatedAt.UTC().Format(time.RFC3339Nano),
		workspaceID: workspaceID,
		bookmarkID:  bookmarkID,
		createdBy:   createdBy,
		url:         targetURL,
		mode:        normMode,
	}:
		return "pending"
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
		return "failed"
	}
}

func (m *Manager) beginClip(ctx context.Context, wsID, bmID string) (string, func(), error) {
	if !safePart(wsID) || !safePart(bmID) {
		return "", nil, errors.New("invalid archive path")
	}
	revision, err := m.store.ArchiveRevision(ctx, wsID, bmID)
	if err != nil {
		return "", nil, err
	}
	select {
	case m.slots <- struct{}{}:
		return revision, func() { <-m.slots }, nil
	case <-ctx.Done():
		return "", nil, ctx.Err()
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
	revision, release, err := m.beginClip(ctx, workspaceID, bookmarkID)
	if err != nil {
		if opts.queuedRevision != "" {
			m.recordFailure(ctx, workspaceID, bookmarkID, createdBy, opts.queuedRevision, "server", err.Error())
		}
		return domain.BookmarkArchive{}, err
	}
	defer release()
	if opts.queuedRevision != "" && opts.queuedRevision != revision {
		return domain.BookmarkArchive{}, store.ErrAlreadyExists
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return m.recordFailure(ctx, workspaceID, bookmarkID, createdBy, revision, "server", err.Error()), err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; linktive-clipper/0.3)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return m.recordFailure(ctx, workspaceID, bookmarkID, createdBy, revision, "server", err.Error()), err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		msg := fmt.Sprintf("HTTP %d from target site", resp.StatusCode)
		return m.recordFailure(ctx, workspaceID, bookmarkID, createdBy, revision, "server", msg), errors.New(msg)
	}

	rawBytes, err := io.ReadAll(io.LimitReader(resp.Body, (8<<20)+1))
	if err == nil && len(rawBytes) > 8<<20 {
		err = errors.New("page exceeds 8 MiB")
	}
	if err == nil && len(bytes.TrimSpace(rawBytes)) == 0 {
		err = errors.New("empty page")
	}
	if err != nil {
		return m.recordFailure(ctx, workspaceID, bookmarkID, createdBy, revision, "server", err.Error()), err
	}

	finalURL := targetURL
	if resp.Request != nil && resp.Request.URL != nil {
		finalURL = resp.Request.URL.String()
	}

	ar, err := m.saveHTML(ctx, workspaceID, bookmarkID, createdBy, "server", finalURL, rawBytes, "", "", "", opts, revision)
	if err != nil {
		return m.recordFailure(ctx, workspaceID, bookmarkID, createdBy, revision, "server", err.Error()), err
	}
	return ar, nil
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
	revision, release, err := m.beginClip(ctx, workspaceID, bookmarkID)
	if err != nil {
		return domain.BookmarkArchive{}, err
	}
	defer release()
	return m.saveHTML(ctx, workspaceID, bookmarkID, createdBy, source, pageURL, rawHTML, overrideTitle, overrideByline, overrideSite, opts, revision)
}

func (m *Manager) saveHTML(
	ctx context.Context,
	workspaceID, bookmarkID, createdBy, source, pageURL string,
	rawHTML []byte,
	overrideTitle, overrideByline, overrideSite string,
	opts ClipOptions, revision string,
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

	// Download into a private staging directory. Workspace mutations only wait
	// for local publication, never for the remote page or its assets.
	stage, err := os.MkdirTemp("", "linktive-clip-*")
	if err != nil {
		return domain.BookmarkArchive{}, err
	}
	defer os.RemoveAll(stage)
	rewrites, notice, incomplete, err := m.downloadAssets(ctx, workspaceID, bookmarkID, pageURL, stage, imageURLs, snap.StylesheetURLs, policy)
	if err != nil {
		return domain.BookmarkArchive{}, err
	}

	unlock := m.LockAssets()
	defer unlock()
	current, err := m.store.ArchiveRevision(ctx, workspaceID, bookmarkID)
	if err != nil {
		return domain.BookmarkArchive{}, err
	}
	if current != revision {
		return domain.BookmarkArchive{}, store.ErrAlreadyExists
	}
	var existing domain.BookmarkArchive
	hasExisting := false
	if (opts.Merge || incomplete) && current != "" {
		existing, err = m.store.GetBookmarkArchive(ctx, workspaceID, bookmarkID)
		if err != nil {
			return domain.BookmarkArchive{}, err
		}
		hasExisting = opts.Merge && existing.Status == "ready"
	}
	assetDir := filepath.Join(m.assetsDir, workspaceID, bookmarkID)
	files, err := os.ReadDir(stage)
	if err != nil {
		return domain.BookmarkArchive{}, err
	}
	if len(files) > 0 {
		if err := os.MkdirAll(assetDir, 0755); err != nil {
			return domain.BookmarkArchive{}, err
		}
	}
	var size int64
	if hasExisting {
		_, size = MeasureDir(assetDir)
	}
	var published []string
	committed := false
	defer func() {
		if !committed {
			for _, p := range published {
				_ = os.Remove(p)
			}
		}
	}()
	for _, file := range files {
		src, dest := filepath.Join(stage, file.Name()), filepath.Join(assetDir, file.Name())
		if _, err := os.Stat(dest); err == nil {
			continue
		} else if !errors.Is(err, os.ErrNotExist) {
			return domain.BookmarkArchive{}, err
		}
		info, err := file.Info()
		if err != nil {
			return domain.BookmarkArchive{}, err
		}
		if hasExisting && policy.LimitEnabled && size+info.Size() > int64(policy.MaxBookmarkMB)<<20 {
			for remote, path := range rewrites {
				if filepath.Base(path) == file.Name() {
					delete(rewrites, remote)
				}
			}
			notice = "Some resources exceeded the archive size limit."
			continue
		}
		if err := os.Link(src, dest); err != nil {
			if err := copyAsset(src, dest); err != nil {
				return domain.BookmarkArchive{}, err
			}
		}
		published = append(published, dest)
		size += info.Size()
	}

	finalContentHTML := ""
	if normMode == ModeReadable || normMode == ModeBoth {
		finalContentHTML = applyAssetRewrites(extracted.ContentHTML, rewrites)
	}
	finalSnapshotHTML := ""
	if normMode == ModeHTML || normMode == ModeBoth {
		finalSnapshotHTML = applyAssetRewrites(snap.SnapshotHTML, rewrites)
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

	// The committed HTML decides which immutable files remain live.
	entries, err := os.ReadDir(assetDir)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return domain.BookmarkArchive{}, err
	}
	var obsolete []string
	var assetCount int
	var assetBytes int64
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		assetPath := "/assets/" + name
		if !strings.Contains(finalContentHTML, assetPath) && !strings.Contains(finalSnapshotHTML, assetPath) {
			if incomplete && existing.Status == "ready" && (strings.Contains(existing.ContentHTML, assetPath) || strings.Contains(existing.SnapshotHTML, assetPath)) {
				return domain.BookmarkArchive{}, errors.New("could not refresh archived resources; previous archive retained")
			}
			obsolete = append(obsolete, filepath.Join(assetDir, name))
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return domain.BookmarkArchive{}, err
		}
		assetCount++
		assetBytes += info.Size()
	}
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
	committed = true
	for _, path := range obsolete {
		_ = os.Remove(path)
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
) (rewrites map[string]string, notice string, incomplete bool, err error) {
	rewrites = make(map[string]string)
	var totalBytes int64
	var maxAssetBytes int64
	var maxBookmarkBytes int64
	if policy.LimitEnabled {
		maxAssetBytes = int64(policy.MaxAssetMB) * 1024 * 1024
		maxBookmarkBytes = int64(policy.MaxBookmarkMB) * 1024 * 1024
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
	jobs := make(chan assetFetchJob, len(allJobs))
	for _, j := range allJobs {
		jobs <- j
	}
	close(jobs)

	var stageErr error
	var skippedForLimit int
	var mu sync.Mutex
	var wg sync.WaitGroup
	for range min(4, len(allJobs)) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for job := range jobs {
				if ctx.Err() != nil {
					return
				}
				mu.Lock()
				full := maxBookmarkBytes > 0 && totalBytes >= maxBookmarkBytes
				if full {
					skippedForLimit++
				}
				mu.Unlock()
				if full {
					continue
				}
				data, ext, over, err := m.fetchAsset(ctx, job, refererURL, maxAssetBytes)
				mu.Lock()
				if err != nil {
					incomplete = true
				} else if over {
					skippedForLimit++
				} else {
					sum := sha256.Sum256(data)
					name := hex.EncodeToString(sum[:16]) + ext
					dest := filepath.Join(assetDir, name)
					_, statErr := os.Stat(dest)
					localURL := fmt.Sprintf("/api/v1/workspaces/%s/bookmarks/%s/assets/%s", workspaceID, bookmarkID, name)
					if statErr == nil {
						rewrites[job.url] = localURL
					} else if maxBookmarkBytes > 0 && totalBytes+int64(len(data)) > maxBookmarkBytes {
						skippedForLimit++
					} else if writeErr := os.WriteFile(dest, data, 0644); writeErr != nil {
						stageErr = writeErr
					} else {
						totalBytes += int64(len(data))
						rewrites[job.url] = localURL
					}
				}
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if stageErr != nil {
		return nil, "", false, stageErr
	}
	if err := ctx.Err(); err != nil {
		return nil, "", false, err
	}

	if skippedForLimit > 0 {
		notice = fmt.Sprintf("Skipped %d resource(s) due to archive size limits.", skippedForLimit)
	}
	return
}

func safePart(s string) bool {
	return filepath.IsLocal(s) && s != "." && !strings.ContainsAny(s, "/\\\\")
}

func (m *Manager) fetchAsset(ctx context.Context, job assetFetchJob, refererURL string, maxBytes int64) (data []byte, ext string, over bool, err error) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, job.url, nil)
	if err != nil {
		return nil, "", false, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; linktive-clipper/0.3)")
	if referer, err := url.Parse(refererURL); err == nil && referer.Host != "" {
		req.Header.Set("Referer", referer.Scheme+"://"+referer.Host+"/")
	}
	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, "", false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", false, fmt.Errorf("resource HTTP status %d", resp.StatusCode)
	}
	ct := strings.ToLower(resp.Header.Get("Content-Type"))
	if !job.isCSS && ct != "" && !strings.HasPrefix(ct, "image/") && !strings.Contains(ct, "octet-stream") {
		return nil, "", false, errors.New("not an image")
	}
	if maxBytes <= 0 {
		maxBytes = 64 << 20
		if job.isCSS {
			maxBytes = 16 << 20
		}
	}
	if resp.ContentLength > maxBytes {
		return nil, "", true, nil
	}
	data, err = io.ReadAll(io.LimitReader(resp.Body, maxBytes+1))
	if err != nil {
		return nil, "", false, err
	}
	if int64(len(data)) > maxBytes {
		return nil, "", true, nil
	}
	if job.isCSS {
		return []byte(RewriteCSSURLs(string(data), resp.Request.URL.String())), ".css", false, nil
	}
	return data, detectImageExt(job.url, ct), false, nil
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

func (m *Manager) recordFailure(ctx context.Context, workspaceID, bookmarkID, createdBy, revision, source, msg string) domain.BookmarkArchive {
	ar := domain.BookmarkArchive{
		BookmarkID:   bookmarkID,
		WorkspaceID:  workspaceID,
		CreatedBy:    createdBy,
		Source:       source,
		Status:       "failed",
		ErrorMessage: msg,
		ArchivedAt:   time.Now().UTC(),
	}
	// A timeout must still finish a pending job. A deleted or changed archive
	// belongs to a newer operation and must stay untouched.
	saveCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 2*time.Second)
	defer cancel()
	unlock := m.LockAssets()
	defer unlock()
	if current, err := m.store.ArchiveRevision(saveCtx, workspaceID, bookmarkID); err == nil && current == revision {
		_ = m.store.UpsertBookmarkArchive(saveCtx, ar)
	}
	return ar
}

// ResolveAssetPath validates parameters against directory traversal and returns the file path on disk.
func (m *Manager) ResolveAssetPath(workspaceID, bookmarkID, filename string) (string, error) {
	if !safePart(workspaceID) || !safePart(bookmarkID) || !safePart(filename) {
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
	if !safePart(workspaceID) || !safePart(bookmarkID) {
		return
	}
	_ = os.RemoveAll(filepath.Join(m.assetsDir, workspaceID, bookmarkID))
}

// DeleteWorkspaceAssets removes all cached assets for a workspace.
func (m *Manager) DeleteWorkspaceAssets(workspaceID string) {
	if !safePart(workspaceID) {
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
