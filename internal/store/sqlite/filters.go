package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/linktive/linktive/internal/domain"
	"github.com/linktive/linktive/internal/store"
)

// ListSavedFilters returns saved filter presets in a workspace ordered by name.
func (s *Store) ListSavedFilters(ctx context.Context, workspaceID string) ([]domain.SavedFilter, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, workspace_id, name, query, icon, color, created_at, updated_at
		FROM saved_filters
		WHERE workspace_id = ?
		ORDER BY created_at ASC
	`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	items := make([]domain.SavedFilter, 0)
	for rows.Next() {
		var item domain.SavedFilter
		var createdAt, updatedAt string
		if err := rows.Scan(
			&item.ID, &item.WorkspaceID, &item.Name, &item.Query,
			&item.Icon, &item.Color, &createdAt, &updatedAt,
		); err != nil {
			return nil, err
		}
		item.CreatedAt = parseTime(createdAt)
		item.UpdatedAt = parseTime(updatedAt)
		items = append(items, item)
	}
	return items, rows.Err()
}

// CreateSavedFilter creates a reusable saved search filter in the workspace sidebar.
func (s *Store) CreateSavedFilter(ctx context.Context, workspaceID, name, query, icon, color string) (domain.SavedFilter, error) {
	cleanName := strings.TrimSpace(name)
	cleanQuery := strings.TrimSpace(query)
	if cleanName == "" || cleanQuery == "" {
		return domain.SavedFilter{}, errors.New("filter name and query are required")
	}
	if strings.TrimSpace(icon) == "" {
		icon = "filter"
	}
	if strings.TrimSpace(color) == "" {
		color = "#0284c7"
	}

	now := time.Now().UTC()
	nowStr := formatTime(now)
	f := domain.SavedFilter{
		ID:          newID(),
		WorkspaceID: workspaceID,
		Name:        cleanName,
		Query:       cleanQuery,
		Icon:        strings.TrimSpace(icon),
		Color:       strings.TrimSpace(color),
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO saved_filters (id, workspace_id, name, query, icon, color, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, f.ID, f.WorkspaceID, f.Name, f.Query, f.Icon, f.Color, nowStr, nowStr); err != nil {
		return domain.SavedFilter{}, err
	}
	return f, nil
}

// UpdateSavedFilter updates an existing saved filter preset.
func (s *Store) UpdateSavedFilter(ctx context.Context, workspaceID, filterID, name, query, icon, color string) (domain.SavedFilter, error) {
	cleanName := strings.TrimSpace(name)
	cleanQuery := strings.TrimSpace(query)
	if cleanName == "" || cleanQuery == "" {
		return domain.SavedFilter{}, errors.New("filter name and query are required")
	}
	if strings.TrimSpace(icon) == "" {
		icon = "filter"
	}
	if strings.TrimSpace(color) == "" {
		color = "#0284c7"
	}

	nowStr := formatTime(time.Now().UTC())
	res, err := s.db.ExecContext(ctx, `
		UPDATE saved_filters
		SET name = ?, query = ?, icon = ?, color = ?, updated_at = ?
		WHERE id = ? AND workspace_id = ?
	`, cleanName, cleanQuery, strings.TrimSpace(icon), strings.TrimSpace(color), nowStr, filterID, workspaceID)
	if err != nil {
		return domain.SavedFilter{}, err
	}
	if rows, _ := res.RowsAffected(); rows == 0 {
		return domain.SavedFilter{}, store.ErrNotFound
	}

	var f domain.SavedFilter
	var createdAt, updatedAt string
	err = s.db.QueryRowContext(ctx, `
		SELECT id, workspace_id, name, query, icon, color, created_at, updated_at
		FROM saved_filters WHERE id = ? AND workspace_id = ?
	`, filterID, workspaceID).Scan(
		&f.ID, &f.WorkspaceID, &f.Name, &f.Query,
		&f.Icon, &f.Color, &createdAt, &updatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return domain.SavedFilter{}, store.ErrNotFound
		}
		return domain.SavedFilter{}, err
	}
	f.CreatedAt = parseTime(createdAt)
	f.UpdatedAt = parseTime(updatedAt)
	return f, nil
}

// DeleteSavedFilter deletes a saved filter preset from a workspace.
func (s *Store) DeleteSavedFilter(ctx context.Context, workspaceID, filterID string) error {
	res, err := s.db.ExecContext(ctx, `
		DELETE FROM saved_filters WHERE id = ? AND workspace_id = ?
	`, filterID, workspaceID)
	if err != nil {
		return err
	}
	if rows, _ := res.RowsAffected(); rows == 0 {
		return store.ErrNotFound
	}
	return nil
}
