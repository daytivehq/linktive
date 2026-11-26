package backup

import (
	"context"
	"errors"
	"log"
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
	backupPrefix  = "linktive-backup-"
	backupExt     = ".db"
	fullBackupExt = ".zip"
)

// ArchiveAssets provides the storage and lock used by archive writers.
type ArchiveAssets interface {
	AssetsDir() string
	LockAssets() func()
}

var ErrAssetsUnavailable = errors.New("archive asset backups are unavailable")

// Manager coordinates atomic backups, retention pruning, and scheduled runs.
type Manager struct {
	store  store.Store
	dir    string
	assets ArchiveAssets
	mu     sync.Mutex
}

// NewManager creates a backup manager writing snapshots into dir.
func NewManager(st store.Store, dir string, assets ArchiveAssets) *Manager {
	return &Manager{
		store:  st,
		dir:    dir,
		assets: assets,
	}
}

// Settings returns the current persisted auto-backup settings.
func (m *Manager) Settings(ctx context.Context) (domain.AutoBackupSettings, error) {
	return m.store.GetBackupSettings(ctx)
}

// UpdateSettings updates enabled state, interval, and retention count while keeping last_run_at.
func (m *Manager) UpdateSettings(ctx context.Context, enabled *bool, intervalHours, keepCount int, includeAssets *bool) (domain.AutoBackupSettings, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	cur, err := m.store.GetBackupSettings(ctx)
	if err != nil {
		return domain.AutoBackupSettings{}, err
	}
	if enabled != nil {
		cur.Enabled = *enabled
	}
	if includeAssets != nil {
		if *includeAssets && m.assets == nil {
			return domain.AutoBackupSettings{}, ErrAssetsUnavailable
		}
		cur.IncludeAssets = *includeAssets
	}
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

// RunNow creates the configured backup, updates last_run_at, and prunes older backups.
func (m *Manager) RunNow(ctx context.Context) (domain.BackupFileInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	cfg, err := m.Settings(ctx)
	if err != nil {
		return domain.BackupFileInfo{}, err
	}
	ext := backupExt
	if cfg.IncludeAssets {
		if m.assets == nil {
			return domain.BackupFileInfo{}, ErrAssetsUnavailable
		}
		ext = fullBackupExt
	}

	if err := os.MkdirAll(m.dir, 0o700); err != nil {
		return domain.BackupFileInfo{}, err
	}
	if err := os.Chmod(m.dir, 0o700); err != nil {
		return domain.BackupFileInfo{}, err
	}

	now := time.Now().UTC()
	filename := backupPrefix + now.Format("20060102-150405.000000000") + ext
	destPath := filepath.Join(m.dir, filename)
	stage, err := os.MkdirTemp(m.dir, ".backup-")
	if err != nil {
		return domain.BackupFileInfo{}, err
	}
	defer os.RemoveAll(stage)
	stagedPath := filepath.Join(stage, filename)
	if cfg.IncludeAssets {
		err = m.writeFullBackup(ctx, stage, stagedPath)
	} else {
		err = m.store.BackupTo(ctx, stagedPath)
	}
	if err != nil {
		return domain.BackupFileInfo{}, err
	}
	if err := os.Chmod(stagedPath, 0o600); err != nil {
		return domain.BackupFileInfo{}, err
	}
	if err := os.Rename(stagedPath, destPath); err != nil {
		return domain.BackupFileInfo{}, err
	}

	stat, err := os.Stat(destPath)
	if err != nil {
		return domain.BackupFileInfo{}, err
	}

	cfg.LastRunAt = &now
	cfg.LastFailureAt = nil
	if err := m.store.SaveBackupSettings(ctx, cfg); err != nil {
		log.Printf("save backup status: %v", err)
	}
	if err := m.pruneLocked(cfg.KeepCount); err != nil {
		log.Printf("prune backups: %v", err)
	}

	return domain.BackupFileInfo{
		Filename:       filename,
		IncludesAssets: cfg.IncludeAssets,
		SizeBytes:      stat.Size(),
		CreatedAt:      stat.ModTime().UTC(),
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
		if !entry.Type().IsRegular() || !isValidBackupName(entry.Name()) {
			continue
		}
		info, iErr := entry.Info()
		if iErr != nil {
			continue
		}
		items = append(items, domain.BackupFileInfo{
			Filename:       entry.Name(),
			IncludesAssets: strings.HasSuffix(entry.Name(), fullBackupExt),
			SizeBytes:      info.Size(),
			CreatedAt:      info.ModTime().UTC(),
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
	info, err := os.Lstat(full)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", errors.New("backup is not a regular file")
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
	if _, err := m.RunNow(ctx); err != nil && ctx.Err() == nil {
		log.Printf("scheduled backup failed: %v", err)
		m.mu.Lock()
		defer m.mu.Unlock()
		if current, err := m.store.GetBackupSettings(ctx); err == nil {
			now := time.Now().UTC()
			if current.LastRunAt == nil || cfg.LastRunAt != nil && current.LastRunAt.Equal(*cfg.LastRunAt) {
				current.LastFailureAt = &now
				if err := m.store.SaveBackupSettings(ctx, current); err != nil {
					log.Printf("record scheduled backup failure: %v", err)
				}
			}
		}
	}
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
	return strings.HasPrefix(name, backupPrefix) && (strings.HasSuffix(name, backupExt) || strings.HasSuffix(name, fullBackupExt)) && !strings.Contains(name, "..")
}
