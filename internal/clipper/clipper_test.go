package clipper_test

import (
	"archive/zip"
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/linktive/linktive/internal/clipper"
	"github.com/linktive/linktive/internal/domain"
	"github.com/linktive/linktive/internal/store"
	"github.com/linktive/linktive/internal/store/sqlite"
)

func TestExtractArticleSanitizeAndMarkdown(t *testing.T) {
	raw := []byte(`<!doctype html>
<html>
<head>
  <title>Ignored Site Title</title>
  <meta property="og:title" content="테스트 아티클" />
  <meta property="og:site_name" content="링크티브 블로그" />
  <meta name="author" content="홍길동" />
</head>
<body>
  <nav><a href="/home">메뉴</a></nav>
  <article>
    <h1>테스트 아티클</h1>
    <p>한국어 <strong>본문</strong> 테스트입니다. <a href="/docs/guide" onclick="evil()">가이드</a></p>
    <script>alert('xss')</script>
    <img src="/images/photo.png" alt="샘플 이미지" />
  </article>
  <footer>푸터 정보</footer>
</body>
</html>`)

	extracted := clipper.ExtractArticle(raw, "https://example.com/posts/1")
	if extracted.Title != "테스트 아티클" || extracted.Byline != "홍길동" || extracted.SiteName != "링크티브 블로그" {
		t.Fatalf("unexpected meta: %+v", extracted)
	}
	if strings.Contains(extracted.ContentHTML, "<script") || strings.Contains(extracted.ContentHTML, "onclick") {
		t.Fatalf("expected script/onclick stripped: %s", extracted.ContentHTML)
	}
	if !strings.Contains(extracted.ContentHTML, `href="https://example.com/docs/guide"`) {
		t.Fatalf("expected resolved link href: %s", extracted.ContentHTML)
	}
	if len(extracted.ImageURLs) != 1 || extracted.ImageURLs[0] != "https://example.com/images/photo.png" {
		t.Fatalf("unexpected ImageURLs: %#v", extracted.ImageURLs)
	}

	md := clipper.BuildMarkdown(
		domain.Bookmark{
			Title:     "테스트 아티클",
			URL:       "https://example.com/posts/1",
			Domain:    "example.com",
			Note:      "중요 메모",
			Tags:      []string{"개발", "문서"},
			CreatedAt: time.Now().UTC(),
		},
		domain.BookmarkArchive{
			Title:       extracted.Title,
			Byline:      extracted.Byline,
			SiteName:    extracted.SiteName,
			ContentHTML: extracted.ContentHTML,
			ArchivedAt:  time.Now().UTC(),
		},
	)
	if !strings.Contains(md, `title: "테스트 아티클"`) || !strings.Contains(md, "**본문**") || !strings.Contains(md, "중요 메모") {
		t.Fatalf("unexpected markdown output:\n%s", md)
	}
}

func TestClipURLWithAssetsSizeLimitAndOrphanCleanup(t *testing.T) {
	ctx := context.Background()
	st, err := sqlite.Open(ctx, ":memory:")
	if err != nil {
		t.Fatalf("sqlite.Open: %v", err)
	}
	defer func() { _ = st.Close() }()

	user, ws, err := st.CreateUserWithPersonalWorkspace(ctx, "clipper@linktive.local", "테스터", "hash")
	if err != nil {
		t.Fatalf("CreateUserWithPersonalWorkspace: %v", err)
	}

	bigPNG := append([]byte{0x89, 'P', 'N', 'G'}, make([]byte, 2*1024*1024)...)
	smallPNG := []byte{0x89, 'P', 'N', 'G', 1, 2, 3, 4}

	var srvURL string
	t.Setenv("LINKTIVE_ALLOW_PRIVATE_NETWORKS", "true")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/post":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`<html><body><article><p>본문 내용입니다. 충분한 길이의 한국어 텍스트를 제공합니다. 아카이빙 테스트 문장입니다.</p><img src="/small.png"/><img src="/big.png"/></article></body></html>`))
		case "/small.png":
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(smallPNG)
		case "/big.png":
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(bigPNG)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()
	srvURL = srv.URL

	bm, err := st.CreateBookmark(ctx, store.CreateBookmarkInput{
		WorkspaceID:   ws.ID,
		CreatedBy:     user.ID,
		URL:           srvURL + "/post",
		NormalizedURL: srvURL + "/post",
		Domain:        "127.0.0.1",
		Title:         "테스트 포스트",
	})
	if err != nil {
		t.Fatalf("CreateBookmark: %v", err)
	}

	// Set tight 1MB limit so small.png succeeds and big.png is skipped.
	if err := st.SaveArchivePolicy(ctx, domain.ArchivePolicy{
		LimitEnabled:  true,
		MaxAssetMB:    1,
		MaxBookmarkMB: 30,
	}); err != nil {
		t.Fatalf("SaveArchivePolicy: %v", err)
	}

	assetsDir := filepath.Join(t.TempDir(), "assets")
	mgr := clipper.NewManager(st, assetsDir, ":memory:", "")
	ar, err := mgr.ClipURL(ctx, ws.ID, bm.ID, user.ID, bm.URL)
	if err != nil {
		t.Fatalf("ClipURL: %v", err)
	}
	if ar.Status != "ready" || ar.AssetCount != 1 {
		t.Fatalf("expected 1 cached asset (small.png), got status=%s count=%d err=%s", ar.Status, ar.AssetCount, ar.ErrorMessage)
	}
	if !strings.Contains(ar.ContentHTML, "/api/v1/workspaces/"+ws.ID+"/bookmarks/"+bm.ID+"/assets/") {
		t.Fatalf("expected local asset URL rewrite in HTML: %s", ar.ContentHTML)
	}

	if _, err := mgr.ClipURL(ctx, ws.ID, bm.ID, user.ID, srvURL+"/missing"); err == nil {
		t.Fatal("expected fetch failure")
	}
	preserved, err := st.GetBookmarkArchive(ctx, ws.ID, bm.ID)
	if err != nil || preserved.ContentHTML != ar.ContentHTML || preserved.Status != "ready" {
		t.Fatal("last successful archive lost")
	}
	if count, _ := clipper.MeasureDir(assetsDir); count != 1 {
		t.Fatal("last successful image lost")
	}
	// Deleting bookmark leaves asset dir orphaned until CleanupOrphanAssets cleans it up.
	if err := st.DeleteBookmark(ctx, ws.ID, bm.ID, user.ID); err != nil {
		t.Fatalf("DeleteBookmark: %v", err)
	}
	removed, freed, err := mgr.CleanupOrphanAssets(ctx)
	if err != nil || removed != 1 || freed == 0 {
		t.Fatalf("expected orphan cleanup removed=1, got removed=%d freed=%d err=%v", removed, freed, err)
	}
}

func TestSnapshotBothModeAndMarkdownZipBundle(t *testing.T) {
	ctx := context.Background()
	st, err := sqlite.Open(ctx, ":memory:")
	if err != nil {
		t.Fatalf("sqlite.Open: %v", err)
	}
	defer func() { _ = st.Close() }()

	user, ws, err := st.CreateUserWithPersonalWorkspace(ctx, "snap@linktive.local", "스냅", "hash")
	if err != nil {
		t.Fatalf("CreateUserWithPersonalWorkspace: %v", err)
	}

	pngBytes := []byte{0x89, 'P', 'N', 'G', 1, 2, 3, 4}
	t.Setenv("LINKTIVE_ALLOW_PRIVATE_NETWORKS", "true")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/page":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`<!doctype html><html><head><link rel="stylesheet" href="/style.css"/></head><body><script>alert(1)</script><article class="layout"><h1>제목</h1><p>스냅샷 본문 테스트입니다.</p><img src="/img.png?w=400&q=80" alt="pic"/></article></body></html>`))
		case "/style.css":
			w.Header().Set("Content-Type", "text/css")
			_, _ = w.Write([]byte(`body{background:url('/bg.png')}`))
		case "/img.png":
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(pngBytes)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	bm, err := st.CreateBookmark(ctx, store.CreateBookmarkInput{
		WorkspaceID:   ws.ID,
		CreatedBy:     user.ID,
		URL:           srv.URL + "/page",
		NormalizedURL: srv.URL + "/page",
		Domain:        "127.0.0.1",
		Title:         "레이아웃 테스트",
	})
	if err != nil {
		t.Fatalf("CreateBookmark: %v", err)
	}

	assetsDir := filepath.Join(t.TempDir(), "assets")
	mgr := clipper.NewManager(st, assetsDir, ":memory:", "")
	ar, err := mgr.ClipURLWithMode(ctx, ws.ID, bm.ID, user.ID, bm.URL, clipper.ModeBoth)
	if err != nil {
		t.Fatalf("ClipURLWithMode: %v", err)
	}
	if ar.ArchiveMode != clipper.ModeBoth {
		t.Fatalf("expected archive_mode=both, got %s", ar.ArchiveMode)
	}
	if ar.ContentHTML == "" || ar.SnapshotHTML == "" {
		t.Fatalf("expected both content_html and snapshot_html populated")
	}
	if strings.Contains(ar.SnapshotHTML, "<script") {
		t.Fatalf("expected <script> stripped from snapshot_html")
	}
	if !strings.Contains(ar.SnapshotHTML, ".css") {
		t.Fatalf("expected localized stylesheet in snapshot_html: %s", ar.SnapshotHTML)
	}
	if !strings.Contains(ar.ContentHTML, "/assets/") || !strings.Contains(ar.SnapshotHTML, "/assets/") {
		t.Fatalf("expected query-string image rewritten to local asset in both HTMLs")
	}

	zipBytes, mdOut, bundledCount, err := clipper.BuildMarkdownBundle(bm, ar, assetsDir, "레이아웃 테스트")
	if err != nil {
		t.Fatalf("BuildMarkdownBundle: %v", err)
	}
	if bundledCount != 1 || len(zipBytes) == 0 {
		t.Fatalf("expected 1 bundled image in zip, got count=%d len=%d", bundledCount, len(zipBytes))
	}
	if !strings.Contains(mdOut, "](assets/") {
		t.Fatalf("expected relative assets/ image link in markdown:\n%s", mdOut)
	}

	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		t.Fatalf("zip.NewReader: %v", err)
	}
	var hasMD, hasImg bool
	for _, f := range zr.File {
		if f.Name == "레이아웃 테스트.md" {
			hasMD = true
		}
		if strings.HasPrefix(f.Name, "assets/") && strings.HasSuffix(f.Name, ".png") {
			hasImg = true
		}
	}
	if !hasMD || !hasImg {
		t.Fatalf("expected md and assets/*.png inside zip, got hasMD=%v hasImg=%v", hasMD, hasImg)
	}
}

func TestNaverLazyImageSnapshotAndIncrementalMerge(t *testing.T) {
	ctx := context.Background()
	st, err := sqlite.Open(ctx, ":memory:")
	if err != nil {
		t.Fatalf("sqlite.Open: %v", err)
	}
	defer func() { _ = st.Close() }()

	user, ws, err := st.CreateUserWithPersonalWorkspace(ctx, "naver@linktive.local", "뉴스", "hash")
	if err != nil {
		t.Fatalf("CreateUserWithPersonalWorkspace: %v", err)
	}

	pngBytes := []byte{0x89, 'P', 'N', 'G', 5, 6, 7, 8}
	t.Setenv("LINKTIVE_ALLOW_PRIVATE_NETWORKS", "true")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/news":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`<!doctype html><html><head><link rel="stylesheet" href="/news.css"/></head><body><article id="dic_area"><p>네이버 스타일 본문 테스트 문장입니다. 충분한 길이의 본문 내용을 넣어 리더뷰가 잘 추출되게 합니다. 경제 기사 테스트.</p><img id="img1" data-src="/photo.png?type=w860" class="_LAZY_LOADING _LAZY_LOADING_INIT_HIDE" style="display: none; max-width:100%;" alt="기사사진"/></article></body></html>`))
		case "/news.css":
			w.Header().Set("Content-Type", "text/css")
			_, _ = w.Write([]byte(`.nbd_a img{width:100%}`))
		case "/photo.png":
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(pngBytes)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	bm, err := st.CreateBookmark(ctx, store.CreateBookmarkInput{
		WorkspaceID:   ws.ID,
		CreatedBy:     user.ID,
		URL:           srv.URL + "/news",
		NormalizedURL: srv.URL + "/news",
		Domain:        "127.0.0.1",
		Title:         "뉴스 테스트",
	})
	if err != nil {
		t.Fatalf("CreateBookmark: %v", err)
	}

	assetsDir := filepath.Join(t.TempDir(), "assets")
	mgr := clipper.NewManager(st, assetsDir, ":memory:", "")

	// 1) Save readable first.
	ar, err := mgr.ClipURLWithOptions(ctx, ws.ID, bm.ID, user.ID, bm.URL, clipper.ClipOptions{Mode: clipper.ModeReadable})
	if err != nil {
		t.Fatalf("ClipURLWithOptions readable: %v", err)
	}
	if ar.ArchiveMode != clipper.ModeReadable || ar.ContentHTML == "" || ar.SnapshotHTML != "" {
		t.Fatalf("expected readable-only archive, got mode=%s content=%d snap=%d", ar.ArchiveMode, len(ar.ContentHTML), len(ar.SnapshotHTML))
	}

	// 2) Merge HTML snapshot while preserving readable content_html.
	ar, err = mgr.ClipURLWithOptions(ctx, ws.ID, bm.ID, user.ID, bm.URL, clipper.ClipOptions{Mode: clipper.ModeHTML, Merge: true})
	if err != nil {
		t.Fatalf("ClipURLWithOptions merge html: %v", err)
	}
	if ar.ArchiveMode != clipper.ModeBoth || ar.ContentHTML == "" || ar.SnapshotHTML == "" {
		t.Fatalf("expected merged both archive, got mode=%s content=%d snap=%d", ar.ArchiveMode, len(ar.ContentHTML), len(ar.SnapshotHTML))
	}
	if strings.Contains(ar.SnapshotHTML, "display: none") || strings.Contains(ar.SnapshotHTML, "_LAZY_LOADING_INIT_HIDE") {
		t.Fatalf("expected lazy-hide inline display:none and class stripped from snapshot_html:\n%s", ar.SnapshotHTML)
	}
	if !strings.Contains(ar.SnapshotHTML, "max-width:100%") || !strings.Contains(ar.SnapshotHTML, "/assets/") {
		t.Fatalf("expected remaining style and local asset src preserved in snapshot_html:\n%s", ar.SnapshotHTML)
	}

	// 3) Save HTML first, then merge readable.
	ar2, err := mgr.ClipURLWithOptions(ctx, ws.ID, bm.ID, user.ID, bm.URL, clipper.ClipOptions{Mode: clipper.ModeHTML})
	if err != nil {
		t.Fatalf("ClipURLWithOptions html only: %v", err)
	}
	if ar2.ArchiveMode != clipper.ModeHTML || ar2.ContentHTML != "" || ar2.SnapshotHTML == "" {
		t.Fatalf("expected html-only archive, got mode=%s", ar2.ArchiveMode)
	}
	ar2, err = mgr.ClipURLWithOptions(ctx, ws.ID, bm.ID, user.ID, bm.URL, clipper.ClipOptions{Mode: clipper.ModeReadable, Merge: true})
	if err != nil {
		t.Fatalf("ClipURLWithOptions merge readable: %v", err)
	}
	if ar2.ArchiveMode != clipper.ModeBoth || ar2.ContentHTML == "" || ar2.SnapshotHTML == "" {
		t.Fatalf("expected both after merging readable into html, got mode=%s", ar2.ArchiveMode)
	}
}
