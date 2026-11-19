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

// ListCollections returns all collections in a workspace sorted alphabetically with bookmark counts.
func (s *Store) ListCollections(ctx context.Context, workspaceID string) ([]domain.Collection, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT c.id, c.workspace_id, c.parent_id, c.name, c.description, c.icon, c.color,
		       COUNT(b.id) AS bookmark_count, c.created_at, c.updated_at
		FROM collections c
		LEFT JOIN bookmarks b ON b.collection_id = c.id
		WHERE c.workspace_id = ?
		GROUP BY c.id
		ORDER BY c.name COLLATE NOCASE ASC
	`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	items := make([]domain.Collection, 0)
	for rows.Next() {
		var c domain.Collection
		var parentID sql.NullString
		var createdAt, updatedAt string
		if err := rows.Scan(
			&c.ID, &c.WorkspaceID, &parentID, &c.Name, &c.Description, &c.Icon, &c.Color,
			&c.BookmarkCount, &createdAt, &updatedAt,
		); err != nil {
			return nil, err
		}
		if parentID.Valid {
			v := parentID.String
			c.ParentID = &v
		}
		c.CreatedAt = parseTime(createdAt)
		c.UpdatedAt = parseTime(updatedAt)
		items = append(items, c)
	}
	return items, rows.Err()
}

// CreateCollection creates a collection folder under an optional parent within the workspace.
func (s *Store) CreateCollection(ctx context.Context, input store.CreateCollectionInput) (domain.Collection, error) {
	if input.ParentID != nil && *input.ParentID != "" {
		if err := s.ensureCollectionExists(ctx, input.WorkspaceID, *input.ParentID); err != nil {
			return domain.Collection{}, store.ErrInvalidParent
		}
	}

	now := time.Now().UTC()
	nowStr := formatTime(now)
	icon := strings.TrimSpace(input.Icon)
	if icon == "" {
		icon = "folder"
	}
	color := strings.TrimSpace(input.Color)
	if color == "" {
		color = "#64748b"
	}

	c := domain.Collection{
		ID:          newID(),
		WorkspaceID: input.WorkspaceID,
		ParentID:    normalizeOptionalID(input.ParentID),
		Name:        strings.TrimSpace(input.Name),
		Description: strings.TrimSpace(input.Description),
		Icon:        icon,
		Color:       color,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO collections (id, workspace_id, parent_id, name, description, icon, color, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, c.ID, c.WorkspaceID, nullableString(c.ParentID), c.Name, c.Description, c.Icon, c.Color, nowStr, nowStr)
	if err != nil {
		return domain.Collection{}, err
	}
	return c, nil
}

// UpdateCollection updates a collection's attributes or moves it in the folder hierarchy.
func (s *Store) UpdateCollection(ctx context.Context, input store.UpdateCollectionInput) (domain.Collection, error) {
	cur, err := s.getCollection(ctx, input.WorkspaceID, input.ID)
	if err != nil {
		return domain.Collection{}, err
	}

	if input.SetParent {
		nextParent := normalizeOptionalID(input.ParentID)
		if nextParent != nil {
			if *nextParent == input.ID {
				return domain.Collection{}, store.ErrInvalidParent
			}
			if err := s.ensureNoCycle(ctx, input.WorkspaceID, input.ID, *nextParent); err != nil {
				return domain.Collection{}, err
			}
		}
		cur.ParentID = nextParent
	}
	if input.Name != nil {
		cur.Name = strings.TrimSpace(*input.Name)
	}
	if input.Description != nil {
		cur.Description = strings.TrimSpace(*input.Description)
	}
	if input.Icon != nil && strings.TrimSpace(*input.Icon) != "" {
		cur.Icon = strings.TrimSpace(*input.Icon)
	}
	if input.Color != nil && strings.TrimSpace(*input.Color) != "" {
		cur.Color = strings.TrimSpace(*input.Color)
	}
	cur.UpdatedAt = time.Now().UTC()

	_, err = s.db.ExecContext(ctx, `
		UPDATE collections
		SET parent_id = ?, name = ?, description = ?, icon = ?, color = ?, updated_at = ?
		WHERE id = ? AND workspace_id = ?
	`, nullableString(cur.ParentID), cur.Name, cur.Description, cur.Icon, cur.Color, formatTime(cur.UpdatedAt), cur.ID, cur.WorkspaceID)
	if err != nil {
		return domain.Collection{}, err
	}
	return s.getCollection(ctx, input.WorkspaceID, input.ID)
}

// DeleteCollection removes a collection, reparenting child collections to its parent.
func (s *Store) DeleteCollection(ctx context.Context, workspaceID, collectionID string) error {
	cur, err := s.getCollection(ctx, workspaceID, collectionID)
	if err != nil {
		return err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `
		UPDATE collections SET parent_id = ? WHERE workspace_id = ? AND parent_id = ?
	`, nullableString(cur.ParentID), workspaceID, collectionID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM collections WHERE id = ? AND workspace_id = ?
	`, collectionID, workspaceID); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) getCollection(ctx context.Context, workspaceID, collectionID string) (domain.Collection, error) {
	var c domain.Collection
	var parentID sql.NullString
	var createdAt, updatedAt string
	err := s.db.QueryRowContext(ctx, `
		SELECT c.id, c.workspace_id, c.parent_id, c.name, c.description, c.icon, c.color,
		       COUNT(b.id) AS bookmark_count, c.created_at, c.updated_at
		FROM collections c
		LEFT JOIN bookmarks b ON b.collection_id = c.id
		WHERE c.id = ? AND c.workspace_id = ?
		GROUP BY c.id
	`, collectionID, workspaceID).Scan(
		&c.ID, &c.WorkspaceID, &parentID, &c.Name, &c.Description, &c.Icon, &c.Color,
		&c.BookmarkCount, &createdAt, &updatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Collection{}, store.ErrNotFound
	}
	if err != nil {
		return domain.Collection{}, err
	}
	if parentID.Valid {
		v := parentID.String
		c.ParentID = &v
	}
	c.CreatedAt = parseTime(createdAt)
	c.UpdatedAt = parseTime(updatedAt)
	return c, nil
}

func (s *Store) ensureCollectionExists(ctx context.Context, workspaceID, collectionID string) error {
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(1) FROM collections WHERE id = ? AND workspace_id = ?`, collectionID, workspaceID).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		return store.ErrNotFound
	}
	return nil
}

func (s *Store) ensureNoCycle(ctx context.Context, workspaceID, movingID, candidateParentID string) error {
	cursor := candidateParentID
	for depth := 0; depth < 64 && cursor != ""; depth++ {
		if cursor == movingID {
			return store.ErrInvalidParent
		}
		var parent sql.NullString
		err := s.db.QueryRowContext(ctx, `
			SELECT parent_id FROM collections WHERE id = ? AND workspace_id = ?
		`, cursor, workspaceID).Scan(&parent)
		if errors.Is(err, sql.ErrNoRows) {
			return store.ErrInvalidParent
		}
		if err != nil {
			return err
		}
		if !parent.Valid {
			return nil
		}
		cursor = parent.String
	}
	return store.ErrInvalidParent
}

func normalizeOptionalID(id *string) *string {
	if id == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*id)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func nullableString(id *string) sql.NullString {
	if id == nil || *id == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: *id, Valid: true}
}
