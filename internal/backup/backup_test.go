package backup_test

import (
	"archive/zip"
	"bytes"
	"context"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/linktive/linktive/internal/backup"
	"github.com/linktive/linktive/internal/clipper"
	"github.com/linktive/linktive/internal/domain"
	"github.com/linktive/linktive/internal/store"
	"github.com/linktive/linktive/internal/store/sqlite"
)

func TestBackupRunListPruneAndDelete(t *testing.T) {
	ctx := context.Background()
	st, err := sqlite.Open(ctx, ":memory:")
	if err != nil {
		t.Fatalf("sqlite.Open: %v", err)
	}
	defer func() { _ = st.Close() }()

	dir := t.TempDir()
	mgr := backup.NewManager(st, dir, nil)

	if _, err := mgr.UpdateSettings(ctx, nil, 12, 2, nil); err != nil {
		t.Fatalf("UpdateSettings: %v", err)
	}

	for i := 0; i < 3; i++ {
		info, err := mgr.RunNow(ctx)
		if err != nil {
			t.Fatalf("RunNow #%d: %v", i, err)
		}
		if info.SizeBytes == 0 {
			t.Fatalf("expected non-empty backup file")
		}
		time.Sleep(5 * time.Millisecond)
	}

	items, err := mgr.ListBackups()
	if err != nil {
		t.Fatalf("ListBackups: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected retention prune to keep 2 backups, got %d", len(items))
	}

	fullPath, err := mgr.ResolvePath(items[0].Filename)
	if err != nil {
		t.Fatalf("ResolvePath: %v", err)
	}
	if _, err := os.Stat(fullPath); err != nil {
		t.Fatalf("stat backup file: %v", err)
	}

	restored, err := sqlite.Open(ctx, fullPath)
	if err != nil {
		t.Fatalf("open backup: %v", err)
	}
	settings, err := restored.GetBackupSettings(ctx)
	restored.Close()
	if err != nil || !settings.Enabled {
		t.Fatalf("backup settings missing: %v", err)
	}
	if err := mgr.DeleteBackup(items[0].Filename); err != nil {
		t.Fatalf("DeleteBackup: %v", err)
	}
	if _, err := mgr.ResolvePath("../evil.db"); err == nil {
		t.Fatalf("expected invalid filename rejection")
	}
}

func TestFullBackupRestoresArchive(t *testing.T) {
	ctx := context.Background()
	st, err := sqlite.Open(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	user, ws, err := st.CreateUserWithPersonalWorkspace(ctx, "restore@example.invalid", "Restore", "test")
	if err != nil {
		t.Fatal(err)
	}
	bm, err := st.CreateBookmark(ctx, store.CreateBookmarkInput{
		WorkspaceID: ws.ID, CreatedBy: user.ID, URL: "https://example.invalid", NormalizedURL: "https://example.invalid",
	})
	if err != nil {
		t.Fatal(err)
	}
	relative := filepath.Join(ws.ID, bm.ID)
	assetURL := "/api/v1/workspaces/" + ws.ID + "/bookmarks/" + bm.ID + "/assets/image.png"
	snapshot := `<img src="` + assetURL + `">`
	if err := st.UpsertBookmarkArchive(ctx, domain.BookmarkArchive{
		WorkspaceID: ws.ID, BookmarkID: bm.ID, CreatedBy: user.ID, Status: "ready", SnapshotHTML: snapshot,
	}); err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	assetsDir, backupsDir := filepath.Join(dir, "assets"), filepath.Join(dir, "backups")
	clipMgr := clipper.NewManager(st, assetsDir, "", backupsDir)
	mgr := backup.NewManager(st, backupsDir, clipMgr)
	if err := os.MkdirAll(filepath.Join(assetsDir, relative), 0o700); err != nil {
		t.Fatal(err)
	}
	fixtures := map[string][]byte{
		"image.png": {0x89, 'P', 'N', 'G'},
		"page.css":  []byte("body { color: black }"),
	}
	for name, content := range fixtures {
		if err := os.WriteFile(filepath.Join(assetsDir, relative, name), content, 0o600); err != nil {
			t.Fatal(err)
		}
	}

	dbOnly, err := mgr.RunNow(ctx)
	if err != nil || dbOnly.IncludesAssets || filepath.Ext(dbOnly.Filename) != ".db" {
		t.Fatalf("default backup should remain DB-only: %+v, %v", dbOnly, err)
	}
	full := true
	if cfg, err := mgr.UpdateSettings(ctx, nil, 0, 2, &full); err != nil || !cfg.IncludeAssets {
		t.Fatalf("select full backup: %+v, %v", cfg, err)
	}
	if cfg, err := mgr.UpdateSettings(ctx, nil, 12, 0, nil); err != nil || !cfg.IncludeAssets {
		t.Fatalf("old settings clients should preserve scope: %+v, %v", cfg, err)
	}
	info, err := mgr.RunNow(ctx)
	if err != nil || !info.IncludesAssets || filepath.Ext(info.Filename) != ".zip" {
		t.Fatalf("expected full ZIP backup: %+v, %v", info, err)
	}

	zipPath, err := mgr.ResolvePath(info.Filename)
	if err != nil {
		t.Fatal(err)
	}
	archive, err := zip.OpenReader(zipPath)
	if err != nil {
		t.Fatal(err)
	}
	defer archive.Close()
	members := make(map[string][]byte)
	for _, file := range archive.File {
		rc, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		members[file.Name], err = io.ReadAll(rc)
		rc.Close()
		if err != nil {
			t.Fatal(err)
		}
	}
	for name, want := range fixtures {
		entry := filepath.ToSlash(filepath.Join("assets", relative, name))
		if !bytes.Equal(members[entry], want) {
			t.Errorf("ZIP member %s differs from original", entry)
		}
	}
	restoredPath := filepath.Join(t.TempDir(), "linktive.db")
	if err := os.WriteFile(restoredPath, members["linktive.db"], 0o600); err != nil {
		t.Fatal(err)
	}
	restored, err := sqlite.Open(ctx, restoredPath)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	record, err := restored.GetBookmarkArchive(ctx, ws.ID, bm.ID)
	if err != nil || record.SnapshotHTML != snapshot {
		t.Fatalf("restored archive: %+v, %v", record, err)
	}
	items, err := mgr.ListBackups()
	if err != nil || len(items) != 2 || !items[0].IncludesAssets || items[1].IncludesAssets {
		t.Fatalf("mixed backup list: %+v, %v", items, err)
	}

	cfg, err := mgr.Settings(ctx)
	if err != nil {
		t.Fatal(err)
	}
	cfg.LastRunAt = nil
	if err := st.SaveBackupSettings(ctx, cfg); err != nil {
		t.Fatal(err)
	}
	// An overdue scheduled run follows the saved scope and shares retention.
	schedulerCtx, stop := context.WithCancel(ctx)
	stopped := make(chan struct{})
	go func() {
		defer close(stopped)
		mgr.StartScheduler(schedulerCtx)
	}()
	defer func() {
		stop()
		<-stopped
	}()
	deadline := time.Now().Add(3 * time.Second)
	for {
		cfg, err := mgr.Settings(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if cfg.LastRunAt != nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("scheduled backup did not complete")
		}
		time.Sleep(10 * time.Millisecond)
	}
	stop()
	<-stopped
	items, err = mgr.ListBackups()
	if err != nil || len(items) != 2 || !items[0].IncludesAssets || !items[1].IncludesAssets {
		t.Fatalf("scheduled full backup and retention: %+v, %v", items, err)
	}
}
