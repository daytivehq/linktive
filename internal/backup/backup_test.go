package backup_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/linktive/linktive/internal/backup"
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
	mgr := backup.NewManager(st, dir)

	if _, err := mgr.UpdateSettings(ctx, true, 12, 2); err != nil {
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

	if err := mgr.DeleteBackup(items[0].Filename); err != nil {
		t.Fatalf("DeleteBackup: %v", err)
	}
	if _, err := mgr.ResolvePath("../evil.db"); err == nil {
		t.Fatalf("expected invalid filename rejection")
	}
}
