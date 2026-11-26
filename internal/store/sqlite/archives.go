package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/linktive/linktive/internal/domain"
	"github.com/linktive/linktive/internal/search"
	"github.com/linktive/linktive/internal/store"
)

// UpsertBookmarkArchive stores or updates a bookmark's archived content and updates its archive FTS5 index.
func (s *Store) UpsertBookmarkArchive(ctx context.Context, ar domain.BookmarkArchive) error {
	now := time.Now().UTC()
	if ar.ArchivedAt.IsZero() {
		ar.ArchivedAt = now
	}
	ar.UpdatedAt = now

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if strings.TrimSpace(ar.ArchiveMode) == "" {
		ar.ArchiveMode = "readable"
	}

	result, err := tx.ExecContext(ctx, `
		INSERT INTO bookmark_archives (
			bookmark_id, workspace_id, created_by, source, archive_mode, status, error_message,
			title, byline, site_name, content_html, snapshot_html, content_text,
			asset_count, total_bytes, archived_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(bookmark_id) DO UPDATE SET
			workspace_id = excluded.workspace_id,
			created_by = excluded.created_by,
			source = excluded.source,
			archive_mode = excluded.archive_mode,
			status = excluded.status,
			error_message = excluded.error_message,
			title = excluded.title,
			byline = excluded.byline,
			site_name = excluded.site_name,
			content_html = excluded.content_html,
			snapshot_html = excluded.snapshot_html,
			content_text = excluded.content_text,
			asset_count = excluded.asset_count,
			total_bytes = excluded.total_bytes,
			archived_at = excluded.archived_at,
			updated_at = excluded.updated_at
		WHERE bookmark_archives.status != 'ready' OR excluded.status = 'ready'
	`, ar.BookmarkID, ar.WorkspaceID, ar.CreatedBy, ar.Source, ar.ArchiveMode, ar.Status, ar.ErrorMessage,
		ar.Title, ar.Byline, ar.SiteName, ar.ContentHTML, ar.SnapshotHTML, ar.ContentText,
		ar.AssetCount, ar.TotalBytes, formatTime(ar.ArchivedAt), formatTime(ar.UpdatedAt))
	if err != nil {
		return err
	}

	if n, err := result.RowsAffected(); err != nil || n == 0 {
		return err
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM bookmark_archives_fts WHERE bookmark_id = ?`, ar.BookmarkID); err != nil {
		return err
	}
	if ar.Status == "ready" && strings.TrimSpace(ar.ContentText) != "" {
		compact := search.CompactText(ar.Title, ar.Byline, ar.SiteName, ar.ContentText)
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO bookmark_archives_fts (bookmark_id, workspace_id, content_text, compact_text)
			VALUES (?, ?, ?, ?)
		`, ar.BookmarkID, ar.WorkspaceID, ar.ContentText, compact); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// GetBookmarkArchive loads an archived web page copy for a bookmark within a workspace.
func (s *Store) GetBookmarkArchive(ctx context.Context, workspaceID, bookmarkID string) (domain.BookmarkArchive, error) {
	var ar domain.BookmarkArchive
	var archivedAt, updatedAt string
	err := s.db.QueryRowContext(ctx, `
		SELECT bookmark_id, workspace_id, created_by, source, archive_mode, status, error_message,
		       title, byline, site_name, content_html, snapshot_html, content_text,
		       asset_count, total_bytes, archived_at, updated_at
		FROM bookmark_archives
		WHERE bookmark_id = ? AND workspace_id = ?
	`, bookmarkID, workspaceID).Scan(
		&ar.BookmarkID, &ar.WorkspaceID, &ar.CreatedBy, &ar.Source, &ar.ArchiveMode, &ar.Status, &ar.ErrorMessage,
		&ar.Title, &ar.Byline, &ar.SiteName, &ar.ContentHTML, &ar.SnapshotHTML, &ar.ContentText,
		&ar.AssetCount, &ar.TotalBytes, &archivedAt, &updatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.BookmarkArchive{}, store.ErrNotFound
	}
	if err != nil {
		return domain.BookmarkArchive{}, err
	}
	ar.ArchivedAt = parseTime(archivedAt)
	ar.UpdatedAt = parseTime(updatedAt)
	return ar, nil
}

// DeleteBookmarkArchive removes only the archived content and FTS entry without deleting the bookmark itself.
func (s *Store) DeleteBookmarkArchive(ctx context.Context, workspaceID, bookmarkID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	res, err := tx.ExecContext(ctx, `DELETE FROM bookmark_archives WHERE bookmark_id = ? AND workspace_id = ?`, bookmarkID, workspaceID)
	if err != nil {
		return err
	}
	if rows, _ := res.RowsAffected(); rows == 0 {
		return store.ErrNotFound
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM bookmark_archives_fts WHERE bookmark_id = ?`, bookmarkID); err != nil {
		return err
	}
	return tx.Commit()
}

// ClearWorkspaceArchives deletes all archived pages inside a workspace.
func (s *Store) ClearWorkspaceArchives(ctx context.Context, workspaceID string) (int64, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	res, err := tx.ExecContext(ctx, `DELETE FROM bookmark_archives WHERE workspace_id = ?`, workspaceID)
	if err != nil {
		return 0, err
	}
	deleted, _ := res.RowsAffected()
	if _, err := tx.ExecContext(ctx, `DELETE FROM bookmark_archives_fts WHERE workspace_id = ?`, workspaceID); err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return deleted, nil
}

// ArchiveExists reports whether a bookmark currently has an archive record in the given workspace.
func (s *Store) ArchiveExists(ctx context.Context, workspaceID, bookmarkID string) (bool, error) {
	var cnt int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(1) FROM bookmark_archives WHERE workspace_id = ? AND bookmark_id = ?
	`, workspaceID, bookmarkID).Scan(&cnt)
	return cnt > 0, err
}

// GetArchivePolicy loads server-wide clipping size limits (default: enabled, 10MB per asset, 30MB per bookmark).
func (s *Store) GetArchivePolicy(ctx context.Context) (domain.ArchivePolicy, error) {
	policy := domain.ArchivePolicy{
		LimitEnabled:  true,
		MaxAssetMB:    10,
		MaxBookmarkMB: 30,
	}
	var raw string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM app_settings WHERE key = 'archive_policy'`).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return policy, nil
	}
	if err != nil {
		return policy, err
	}
	if uErr := json.Unmarshal([]byte(raw), &policy); uErr != nil {
		return domain.ArchivePolicy{LimitEnabled: true, MaxAssetMB: 10, MaxBookmarkMB: 30}, nil
	}
	if policy.MaxAssetMB <= 0 {
		policy.MaxAssetMB = 10
	}
	if policy.MaxBookmarkMB <= 0 {
		policy.MaxBookmarkMB = 30
	}
	return policy, nil
}

// SaveArchivePolicy persists server-wide archive size limits into app_settings.
func (s *Store) SaveArchivePolicy(ctx context.Context, policy domain.ArchivePolicy) error {
	if policy.MaxAssetMB <= 0 {
		policy.MaxAssetMB = 10
	}
	if policy.MaxBookmarkMB <= 0 {
		policy.MaxBookmarkMB = 30
	}
	b, err := json.Marshal(policy)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO app_settings (key, value, updated_at)
		VALUES ('archive_policy', ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
	`, string(b), formatTime(time.Now().UTC()))
	return err
}

// GetWorkspaceUsage aggregates bookmark, tag, collection, and archive usage metrics for a workspace.
func (s *Store) GetWorkspaceUsage(ctx context.Context, workspaceID string) (domain.WorkspaceUsage, error) {
	usage := domain.WorkspaceUsage{WorkspaceID: workspaceID}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(1) FROM bookmarks WHERE workspace_id = ?`, workspaceID).Scan(&usage.BookmarkCount); err != nil {
		return usage, err
	}
	if err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(DISTINCT t.id)
		FROM tags t
		JOIN bookmark_tags bt ON bt.tag_id = t.id
		WHERE t.workspace_id = ?
	`, workspaceID).Scan(&usage.TagCount); err != nil {
		return usage, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(1) FROM collections WHERE workspace_id = ?`, workspaceID).Scan(&usage.CollectionCount); err != nil {
		return usage, err
	}
	if err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(1), COALESCE(SUM(asset_count), 0), COALESCE(SUM(total_bytes), 0)
		FROM bookmark_archives
		WHERE workspace_id = ? AND status = 'ready'
	`, workspaceID).Scan(&usage.ArchivedCount, &usage.ArchiveAssetCount, &usage.ArchiveBytes); err != nil {
		return usage, err
	}
	return usage, nil
}

// GetAdminUsageSummary returns server-wide counts from SQLite (disk sizes are enriched by the HTTP layer).
func (s *Store) GetAdminUsageSummary(ctx context.Context) (domain.AdminUsage, error) {
	var out domain.AdminUsage
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(1) FROM users`).Scan(&out.TotalUsers); err != nil {
		return out, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(1) FROM workspaces`).Scan(&out.TotalWorkspaces); err != nil {
		return out, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(1) FROM bookmarks`).Scan(&out.TotalBookmarks); err != nil {
		return out, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(1) FROM tags`).Scan(&out.TotalTags); err != nil {
		return out, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(1) FROM bookmark_archives WHERE status = 'ready'`).Scan(&out.TotalArchived); err != nil {
		return out, err
	}
	policy, err := s.GetArchivePolicy(ctx)
	if err != nil {
		return out, err
	}
	out.ArchivePolicy = policy
	return out, nil
}

type archiveMeta struct {
	status string
	bytes  int64
}

func (s *Store) loadArchiveMetaForBookmarks(ctx context.Context, bookmarkIDs []string) (map[string]archiveMeta, error) {
	result := make(map[string]archiveMeta, len(bookmarkIDs))
	if len(bookmarkIDs) == 0 {
		return result, nil
	}

	placeholders := make([]string, len(bookmarkIDs))
	args := make([]any, len(bookmarkIDs))
	for i, id := range bookmarkIDs {
		placeholders[i] = "?"
		args[i] = id
	}

	query := fmt.Sprintf(`
		SELECT bookmark_id, status, total_bytes
		FROM bookmark_archives
		WHERE bookmark_id IN (%s)
	`, strings.Join(placeholders, ","))

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	for rows.Next() {
		var bmID, status string
		var totalBytes int64
		if err := rows.Scan(&bmID, &status, &totalBytes); err != nil {
			return nil, err
		}
		result[bmID] = archiveMeta{status: status, bytes: totalBytes}
	}
	return result, rows.Err()
}
