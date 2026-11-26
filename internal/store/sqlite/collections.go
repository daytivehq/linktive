package sqlite

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
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
		       c.is_public, c.public_slug, COUNT(b.id) AS bookmark_count, c.created_at, c.updated_at
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
		c, err := scanCollectionRow(rows)
		if err != nil {
			return nil, err
		}
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
	row := s.db.QueryRowContext(ctx, `
		SELECT c.id, c.workspace_id, c.parent_id, c.name, c.description, c.icon, c.color,
		       c.is_public, c.public_slug, COUNT(b.id) AS bookmark_count, c.created_at, c.updated_at
		FROM collections c
		LEFT JOIN bookmarks b ON b.collection_id = c.id
		WHERE c.id = ? AND c.workspace_id = ?
		GROUP BY c.id
	`, collectionID, workspaceID)
	c, err := scanCollectionSingle(row)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Collection{}, store.ErrNotFound
	}
	return c, err
}

// SetCollectionPublic toggles unauthenticated public link access for a collection.
func (s *Store) SetCollectionPublic(ctx context.Context, workspaceID, collectionID string, enabled bool) (domain.Collection, error) {
	cur, err := s.getCollection(ctx, workspaceID, collectionID)
	if err != nil {
		return domain.Collection{}, err
	}

	slug := cur.PublicSlug
	if enabled && (slug == nil || *slug == "") {
		buf := make([]byte, 8)
		if _, err := rand.Read(buf); err != nil {
			return domain.Collection{}, err
		}
		val := hex.EncodeToString(buf)
		slug = &val
	}

	_, err = s.db.ExecContext(ctx, `
		UPDATE collections
		SET is_public = ?, public_slug = ?, updated_at = ?
		WHERE id = ? AND workspace_id = ?
	`, boolToInt(enabled), nullableString(slug), formatTime(time.Now().UTC()), collectionID, workspaceID)
	if err != nil {
		return domain.Collection{}, err
	}
	return s.getCollection(ctx, workspaceID, collectionID)
}

// GetPublicCollectionBySlug returns a publicly shared collection and its privacy-filtered bookmarks.
func (s *Store) GetPublicCollectionBySlug(ctx context.Context, slug string) (domain.PublicCollectionView, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT c.id, c.workspace_id, c.parent_id, c.name, c.description, c.icon, c.color,
		       c.is_public, c.public_slug, COUNT(b.id) AS bookmark_count, c.created_at, c.updated_at
		FROM collections c
		LEFT JOIN bookmarks b ON b.collection_id = c.id
		WHERE c.public_slug = ? AND c.is_public = 1
		GROUP BY c.id
	`, strings.TrimSpace(slug))
	col, err := scanCollectionSingle(row)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.PublicCollectionView{}, store.ErrNotFound
	}
	if err != nil {
		return domain.PublicCollectionView{}, err
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, url, domain, title, description, favicon_url, created_at
		FROM bookmarks
		WHERE workspace_id = ? AND collection_id = ?
		ORDER BY created_at DESC
	`, col.WorkspaceID, col.ID)
	if err != nil {
		return domain.PublicCollectionView{}, err
	}
	defer func() { _ = rows.Close() }()

	items := make([]domain.PublicBookmark, 0)
	ids := make([]string, 0)
	for rows.Next() {
		var pb domain.PublicBookmark
		var createdAt string
		if err := rows.Scan(&pb.ID, &pb.URL, &pb.Domain, &pb.Title, &pb.Description, &pb.FaviconURL, &createdAt); err != nil {
			return domain.PublicCollectionView{}, err
		}
		pb.CreatedAt = parseTime(createdAt)
		pb.Tags = []string{}
		items = append(items, pb)
		ids = append(ids, pb.ID)
	}
	if err := rows.Err(); err != nil {
		return domain.PublicCollectionView{}, err
	}

	tagMap, err := s.loadTagsForBookmarks(ctx, ids)
	if err != nil {
		return domain.PublicCollectionView{}, err
	}
	for i := range items {
		if t := tagMap[items[i].ID]; t != nil {
			items[i].Tags = t
		}
	}

	return domain.PublicCollectionView{Collection: col, Bookmarks: items}, nil
}

// ListCollectionShares returns all user and workspace shares for a collection.
func (s *Store) ListCollectionShares(ctx context.Context, workspaceID, collectionID string) ([]domain.CollectionShare, error) {
	if err := s.ensureCollectionExists(ctx, workspaceID, collectionID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT cs.id, cs.collection_id, cs.target_type, cs.target_id, cs.role, cs.created_at,
		       COALESCE(u.name || ' (' || u.email || ')', w.name, cs.target_id) AS target_label
		FROM collection_shares cs
		LEFT JOIN users u ON cs.target_type = 'user' AND u.id = cs.target_id
		LEFT JOIN workspaces w ON cs.target_type = 'workspace' AND w.id = cs.target_id
		WHERE cs.collection_id = ?
		ORDER BY cs.created_at ASC
	`, collectionID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	shares := make([]domain.CollectionShare, 0)
	for rows.Next() {
		var sh domain.CollectionShare
		var role, createdAt string
		if err := rows.Scan(&sh.ID, &sh.CollectionID, &sh.TargetType, &sh.TargetID, &role, &createdAt, &sh.TargetLabel); err != nil {
			return nil, err
		}
		sh.Role = domain.MemberRole(role)
		sh.CreatedAt = parseTime(createdAt)
		shares = append(shares, sh)
	}
	return shares, rows.Err()
}

// UpsertCollectionShare adds or updates sharing permission for a user or workspace.
func (s *Store) UpsertCollectionShare(ctx context.Context, input store.CreateCollectionShareInput) (domain.CollectionShare, error) {
	if err := s.ensureCollectionExists(ctx, input.WorkspaceID, input.CollectionID); err != nil {
		return domain.CollectionShare{}, err
	}

	var targetID, targetLabel string
	switch input.TargetType {
	case "user":
		u, err := s.GetUserByEmail(ctx, input.TargetEmail)
		if err != nil {
			return domain.CollectionShare{}, err
		}
		targetID = u.ID
		targetLabel = u.Name + " (" + u.Email + ")"
	case "workspace":
		if input.TargetWorkspaceID == "" || input.TargetWorkspaceID == input.WorkspaceID {
			return domain.CollectionShare{}, store.ErrInvalidParent
		}
		var wsName string
		if err := s.db.QueryRowContext(ctx, `SELECT name FROM workspaces WHERE id = ?`, input.TargetWorkspaceID).Scan(&wsName); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.CollectionShare{}, store.ErrNotFound
			}
			return domain.CollectionShare{}, err
		}
		targetID = input.TargetWorkspaceID
		targetLabel = wsName
	default:
		return domain.CollectionShare{}, store.ErrInvalidParent
	}

	now := time.Now().UTC()
	nowStr := formatTime(now)
	id := newID()

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO collection_shares (id, collection_id, target_type, target_id, role, created_by, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(collection_id, target_type, target_id) DO UPDATE SET role = excluded.role
	`, id, input.CollectionID, input.TargetType, targetID, string(input.Role), input.CreatedBy, nowStr)
	if err != nil {
		return domain.CollectionShare{}, err
	}

	var storedID, storedRole, storedCreated string
	err = s.db.QueryRowContext(ctx, `
		SELECT id, role, created_at FROM collection_shares
		WHERE collection_id = ? AND target_type = ? AND target_id = ?
	`, input.CollectionID, input.TargetType, targetID).Scan(&storedID, &storedRole, &storedCreated)
	if err != nil {
		return domain.CollectionShare{}, err
	}

	return domain.CollectionShare{
		ID:           storedID,
		CollectionID: input.CollectionID,
		TargetType:   input.TargetType,
		TargetID:     targetID,
		TargetLabel:  targetLabel,
		Role:         domain.MemberRole(storedRole),
		CreatedAt:    parseTime(storedCreated),
	}, nil
}

// DeleteCollectionShare removes a collection share record.
func (s *Store) DeleteCollectionShare(ctx context.Context, workspaceID, collectionID, shareID string) error {
	if err := s.ensureCollectionExists(ctx, workspaceID, collectionID); err != nil {
		return err
	}
	res, err := s.db.ExecContext(ctx, `DELETE FROM collection_shares WHERE id = ? AND collection_id = ?`, shareID, collectionID)
	if err != nil {
		return err
	}
	if rows, _ := res.RowsAffected(); rows == 0 {
		return store.ErrNotFound
	}
	return nil
}

const collectionShareTarget = `(
			(cs.target_type = 'user' AND cs.target_id = ?)
			OR (cs.target_type = 'workspace' AND cs.target_id IN (
				SELECT workspace_id FROM workspace_members WHERE user_id = ?
			))
		)`

// ListSharedCollectionsForUser returns collections shared directly with the user or their workspaces.
func (s *Store) ListSharedCollectionsForUser(ctx context.Context, userID string) ([]domain.SharedCollectionView, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT c.id, c.workspace_id, c.parent_id, c.name, c.description, c.icon, c.color,
		       c.is_public, c.public_slug, COUNT(DISTINCT b.id) AS bookmark_count,
		       c.created_at, c.updated_at,
		       CASE WHEN MAX(CASE WHEN cs.role = 'editor' THEN 2 ELSE 1 END) = 2 THEN 'editor' ELSE 'viewer' END AS effective_role,
		       owner_u.name, src_ws.name
		FROM collection_shares cs
		JOIN collections c ON c.id = cs.collection_id
		JOIN workspaces src_ws ON src_ws.id = c.workspace_id
		JOIN users owner_u ON owner_u.id = src_ws.owner_id
		LEFT JOIN bookmarks b ON b.collection_id = c.id
		WHERE `+collectionShareTarget+`
		AND NOT EXISTS (
			SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = c.workspace_id AND wm.user_id = ?
		)
		GROUP BY c.id
		ORDER BY c.name COLLATE NOCASE ASC
	`, userID, userID, userID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	items := make([]domain.SharedCollectionView, 0)
	for rows.Next() {
		var item domain.SharedCollectionView
		var parentID, publicSlug sql.NullString
		var isPublic int
		var createdAt, updatedAt, role string
		if err := rows.Scan(
			&item.ID, &item.WorkspaceID, &parentID, &item.Name, &item.Description, &item.Icon, &item.Color,
			&isPublic, &publicSlug, &item.BookmarkCount, &createdAt, &updatedAt,
			&role, &item.OwnerName, &item.SourceWorkspaceName,
		); err != nil {
			return nil, err
		}
		if parentID.Valid {
			v := parentID.String
			item.ParentID = &v
		}
		if publicSlug.Valid && publicSlug.String != "" {
			v := publicSlug.String
			item.PublicSlug = &v
		}
		item.IsPublic = isPublic != 0
		item.CreatedAt = parseTime(createdAt)
		item.UpdatedAt = parseTime(updatedAt)
		item.Role = domain.MemberRole(role)
		items = append(items, item)
	}
	return items, rows.Err()
}

// GetSharedCollectionAccess verifies and returns a user's shared access to a collection.
func (s *Store) GetSharedCollectionAccess(ctx context.Context, userID, collectionID string) (domain.SharedCollectionView, error) {
	items, err := s.ListSharedCollectionsForUser(ctx, userID)
	if err != nil {
		return domain.SharedCollectionView{}, err
	}
	for _, item := range items {
		if item.ID == collectionID {
			return item, nil
		}
	}
	// Also check if user is directly a member of the owning workspace.
	var wsID string
	err = s.db.QueryRowContext(ctx, `SELECT workspace_id FROM collections WHERE id = ?`, collectionID).Scan(&wsID)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.SharedCollectionView{}, store.ErrNotFound
	}
	if err != nil {
		return domain.SharedCollectionView{}, err
	}
	wsRole, err := s.GetWorkspaceRole(ctx, wsID, userID)
	if err != nil {
		return domain.SharedCollectionView{}, store.ErrPermissionDenied
	}
	col, err := s.getCollection(ctx, wsID, collectionID)
	if err != nil {
		return domain.SharedCollectionView{}, err
	}
	return domain.SharedCollectionView{
		Collection: col,
		Role:       wsRole,
	}, nil
}

func scanCollectionRow(rows *sql.Rows) (domain.Collection, error) {
	var c domain.Collection
	var parentID, publicSlug sql.NullString
	var isPublic int
	var createdAt, updatedAt string
	err := rows.Scan(
		&c.ID, &c.WorkspaceID, &parentID, &c.Name, &c.Description, &c.Icon, &c.Color,
		&isPublic, &publicSlug, &c.BookmarkCount, &createdAt, &updatedAt,
	)
	if err != nil {
		return domain.Collection{}, err
	}
	hydrateCollectionFields(&c, parentID, isPublic, publicSlug, createdAt, updatedAt)
	return c, nil
}

func scanCollectionSingle(row *sql.Row) (domain.Collection, error) {
	var c domain.Collection
	var parentID, publicSlug sql.NullString
	var isPublic int
	var createdAt, updatedAt string
	err := row.Scan(
		&c.ID, &c.WorkspaceID, &parentID, &c.Name, &c.Description, &c.Icon, &c.Color,
		&isPublic, &publicSlug, &c.BookmarkCount, &createdAt, &updatedAt,
	)
	if err != nil {
		return domain.Collection{}, err
	}
	hydrateCollectionFields(&c, parentID, isPublic, publicSlug, createdAt, updatedAt)
	return c, nil
}

func hydrateCollectionFields(c *domain.Collection, parentID sql.NullString, isPublic int, publicSlug sql.NullString, createdAt, updatedAt string) {
	if parentID.Valid {
		v := parentID.String
		c.ParentID = &v
	}
	c.IsPublic = isPublic != 0
	if publicSlug.Valid && publicSlug.String != "" {
		v := publicSlug.String
		c.PublicSlug = &v
	}
	c.CreatedAt = parseTime(createdAt)
	c.UpdatedAt = parseTime(updatedAt)
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
