package backup

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/linktive/linktive/internal/domain"
	"github.com/linktive/linktive/internal/store"
)

const (
	backupPrefix = "linktive-backup-"
	backupExt    = ".db"
)

// Manager coordinates atomic SQLite backups, retention pruning, and scheduled runs.
type Manager struct {
	store store.Store
	dir   string
	mu    sync.Mutex
}

// NewManager creates a backup manager writing snapshots into dir.
func NewManager(st store.Store, dir string) *Manager {
	return &Manager{
		store: st,
		dir:   dir,
	}
}

// Settings returns the current persisted auto-backup settings.
func (m *Manager) Settings(ctx context.Context) (domain.AutoBackupSettings, error) {
	return m.store.GetBackupSettings(ctx)
}

// UpdateSettings updates enabled state, interval, and retention count while keeping last_run_at.
func (m *Manager) UpdateSettings(ctx context.Context, enabled bool, intervalHours, keepCount int) (domain.AutoBackupSettings, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	cur, err := m.store.GetBackupSettings(ctx)
	if err != nil {
		return domain.AutoBackupSettings{}, err
	}
	cur.Enabled = enabled
	if intervalHours > 0 {
		cur.IntervalHours = intervalHours
	}
	if keepCount > 0 {
		cur.KeepCount = keepCount
	}
	if err := m.store.SaveBackupSettings(ctx, cur); err != nil {
		return domain.AutoBackupSettings{}, err
	}
	return cur, nil
}

// RunNow creates an online database snapshot, updates last_run_at, and prunes older snapshots.
func (m *Manager) RunNow(ctx context.Context) (domain.BackupFileInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if err := os.MkdirAll(m.dir, 0o755); err != nil {
		return domain.BackupFileInfo{}, err
	}

	now := time.Now().UTC()
	filename := backupPrefix + now.Format("20060102-150405.000") + backupExt
	destPath := filepath.Join(m.dir, filename)
	if err := m.store.BackupTo(ctx, destPath); err != nil {
		_ = os.Remove(destPath)
		return domain.BackupFileInfo{}, err
	}

	stat, err := os.Stat(destPath)
	if err != nil {
		return domain.BackupFileInfo{}, err
	}

	cfg, err := m.store.GetBackupSettings(ctx)
	if err == nil {
		cfg.LastRunAt = &now
		_ = m.store.SaveBackupSettings(ctx, cfg)
		_ = m.pruneLocked(cfg.KeepCount)
	}

	return domain.BackupFileInfo{
		Filename:  filename,
		SizeBytes: stat.Size(),
		CreatedAt: stat.ModTime().UTC(),
	}, nil
}

// ListBackups lists stored backup files ordered newest first.
func (m *Manager) ListBackups() ([]domain.BackupFileInfo, error) {
	entries, err := os.ReadDir(m.dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []domain.BackupFileInfo{}, nil
		}
		return nil, err
	}

	items := make([]domain.BackupFileInfo, 0)
	for _, entry := range entries {
		if entry.IsDir() || !isValidBackupName(entry.Name()) {
			continue
		}
		info, iErr := entry.Info()
		if iErr != nil {
			continue
		}
		items = append(items, domain.BackupFileInfo{
			Filename:  entry.Name(),
			SizeBytes: info.Size(),
			CreatedAt: info.ModTime().UTC(),
		})
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].CreatedAt.Equal(items[j].CreatedAt) {
			return items[i].Filename > items[j].Filename
		}
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
	return items, nil
}

// ResolvePath validates a backup filename and returns its absolute path on disk.
func (m *Manager) ResolvePath(filename string) (string, error) {
	base := filepath.Base(filename)
	if base != filename || !isValidBackupName(base) {
		return "", errors.New("invalid backup filename")
	}
	full := filepath.Join(m.dir, base)
	if _, err := os.Stat(full); err != nil {
		return "", err
	}
	return full, nil
}

// DeleteBackup removes a validated backup file from disk.
func (m *Manager) DeleteBackup(filename string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	full, err := m.ResolvePath(filename)
	if err != nil {
		return err
	}
	return os.Remove(full)
}

// StartScheduler periodically checks backup settings and runs automatic backups when due.
func (m *Manager) StartScheduler(ctx context.Context) {
	m.runIfDue(ctx)

	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.runIfDue(ctx)
		}
	}
}

func (m *Manager) runIfDue(ctx context.Context) {
	cfg, err := m.store.GetBackupSettings(ctx)
	if err != nil || !cfg.Enabled {
		return
	}
	interval := time.Duration(cfg.IntervalHours) * time.Hour
	if interval <= 0 {
		interval = 24 * time.Hour
	}
	if cfg.LastRunAt != nil && time.Since(*cfg.LastRunAt) < interval {
		return
	}
	_, _ = m.RunNow(ctx)
}

func (m *Manager) pruneLocked(keepCount int) error {
	if keepCount <= 0 {
		return nil
	}
	items, err := m.ListBackups()
	if err != nil || len(items) <= keepCount {
		return err
	}
	for _, old := range items[keepCount:] {
		_ = os.Remove(filepath.Join(m.dir, old.Filename))
	}
	return nil
}

func isValidBackupName(name string) bool {
	return strings.HasPrefix(name, backupPrefix) && strings.HasSuffix(name, backupExt) && !strings.Contains(name, "..")
}
