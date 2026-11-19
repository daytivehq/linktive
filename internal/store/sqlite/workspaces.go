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

// ListWorkspacesForUser returns all personal and shared workspaces the user belongs to.
func (s *Store) ListWorkspacesForUser(ctx context.Context, userID string) ([]domain.Workspace, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT w.id, w.name, w.type, w.owner_id, m.role, w.created_at, w.updated_at
		FROM workspaces w
		JOIN workspace_members m ON m.workspace_id = w.id
		WHERE m.user_id = ?
		ORDER BY CASE WHEN w.type = 'personal' THEN 0 ELSE 1 END, w.name COLLATE NOCASE ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	list := make([]domain.Workspace, 0)
	for rows.Next() {
		var ws domain.Workspace
		var wsType, role, createdAt, updatedAt string
		if err := rows.Scan(&ws.ID, &ws.Name, &wsType, &ws.OwnerID, &role, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		ws.Type = domain.WorkspaceType(wsType)
		ws.Role = domain.MemberRole(role)
		ws.CreatedAt = parseTime(createdAt)
		ws.UpdatedAt = parseTime(updatedAt)
		list = append(list, ws)
	}
	return list, rows.Err()
}

// GetWorkspaceRole returns a user's role in a workspace, or ErrNotFound if not a member.
func (s *Store) GetWorkspaceRole(ctx context.Context, workspaceID, userID string) (domain.MemberRole, error) {
	var role string
	err := s.db.QueryRowContext(ctx, `
		SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?
	`, workspaceID, userID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", store.ErrNotFound
	}
	if err != nil {
		return "", err
	}
	return domain.MemberRole(role), nil
}

// CreateSharedWorkspace creates a shared workspace for family/team collaboration.
func (s *Store) CreateSharedWorkspace(ctx context.Context, ownerID, name string) (domain.Workspace, error) {
	now := time.Now().UTC()
	nowStr := formatTime(now)
	ws := domain.Workspace{
		ID:        newID(),
		Name:      strings.TrimSpace(name),
		Type:      domain.WorkspaceShared,
		OwnerID:   ownerID,
		Role:      domain.RoleOwner,
		CreatedAt: now,
		UpdatedAt: now,
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.Workspace{}, err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO workspaces (id, name, type, owner_id, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, ws.ID, ws.Name, string(ws.Type), ws.OwnerID, nowStr, nowStr); err != nil {
		return domain.Workspace{}, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
		VALUES (?, ?, ?, ?)
	`, ws.ID, ownerID, string(domain.RoleOwner), nowStr); err != nil {
		return domain.Workspace{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.Workspace{}, err
	}
	return ws, nil
}

// UpdateWorkspace renames a workspace.
func (s *Store) UpdateWorkspace(ctx context.Context, workspaceID, name string) (domain.Workspace, error) {
	now := time.Now().UTC()
	trimmed := strings.TrimSpace(name)
	res, err := s.db.ExecContext(ctx, `
		UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?
	`, trimmed, formatTime(now), workspaceID)
	if err != nil {
		return domain.Workspace{}, err
	}
	if rows, _ := res.RowsAffected(); rows == 0 {
		return domain.Workspace{}, store.ErrNotFound
	}

	var ws domain.Workspace
	var wsType, createdAt, updatedAt string
	err = s.db.QueryRowContext(ctx, `
		SELECT id, name, type, owner_id, created_at, updated_at FROM workspaces WHERE id = ?
	`, workspaceID).Scan(&ws.ID, &ws.Name, &wsType, &ws.OwnerID, &createdAt, &updatedAt)
	if err != nil {
		return domain.Workspace{}, err
	}
	ws.Type = domain.WorkspaceType(wsType)
	ws.Role = domain.RoleOwner
	ws.CreatedAt = parseTime(createdAt)
	ws.UpdatedAt = parseTime(updatedAt)
	return ws, nil
}

// DeleteWorkspace removes a shared workspace (personal workspaces cannot be deleted).
func (s *Store) DeleteWorkspace(ctx context.Context, workspaceID string) error {
	var wsType string
	err := s.db.QueryRowContext(ctx, `SELECT type FROM workspaces WHERE id = ?`, workspaceID).Scan(&wsType)
	if errors.Is(err, sql.ErrNoRows) {
		return store.ErrNotFound
	}
	if err != nil {
		return err
	}
	if domain.WorkspaceType(wsType) == domain.WorkspacePersonal {
		return store.ErrPermissionDenied
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `DELETE FROM bookmarks_fts WHERE workspace_id = ?`, workspaceID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM workspaces WHERE id = ?`, workspaceID); err != nil {
		return err
	}
	return tx.Commit()
}

// ListWorkspaceMembers returns all members of a workspace.
func (s *Store) ListWorkspaceMembers(ctx context.Context, workspaceID string) ([]domain.WorkspaceMember, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT m.workspace_id, m.user_id, u.email, u.name, m.role, m.created_at
		FROM workspace_members m
		JOIN users u ON u.id = m.user_id
		WHERE m.workspace_id = ?
		ORDER BY m.created_at ASC
	`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	members := make([]domain.WorkspaceMember, 0)
	for rows.Next() {
		var m domain.WorkspaceMember
		var role, createdAt string
		if err := rows.Scan(&m.WorkspaceID, &m.UserID, &m.Email, &m.Name, &role, &createdAt); err != nil {
			return nil, err
		}
		m.Role = domain.MemberRole(role)
		m.CreatedAt = parseTime(createdAt)
		members = append(members, m)
	}
	return members, rows.Err()
}

// AddWorkspaceMemberByEmail invites/updates an existing user in a shared workspace.
func (s *Store) AddWorkspaceMemberByEmail(ctx context.Context, workspaceID, email string, role domain.MemberRole) (domain.WorkspaceMember, error) {
	u, err := s.GetUserByEmail(ctx, email)
	if err != nil {
		return domain.WorkspaceMember{}, err
	}
	now := time.Now().UTC()
	nowStr := formatTime(now)
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(workspace_id, user_id) DO UPDATE SET role = excluded.role
	`, workspaceID, u.ID, string(role), nowStr)
	if err != nil {
		return domain.WorkspaceMember{}, err
	}
	return domain.WorkspaceMember{
		WorkspaceID: workspaceID,
		UserID:      u.ID,
		Email:       u.Email,
		Name:        u.Name,
		Role:        role,
		CreatedAt:   now,
	}, nil
}

// RemoveWorkspaceMember removes a non-owner member from a workspace.
func (s *Store) RemoveWorkspaceMember(ctx context.Context, workspaceID, userID string) error {
	var ownerID string
	if err := s.db.QueryRowContext(ctx, `SELECT owner_id FROM workspaces WHERE id = ?`, workspaceID).Scan(&ownerID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return store.ErrNotFound
		}
		return err
	}
	if ownerID == userID {
		return store.ErrPermissionDenied
	}
	res, err := s.db.ExecContext(ctx, `DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?`, workspaceID, userID)
	if err != nil {
		return err
	}
	if rows, _ := res.RowsAffected(); rows == 0 {
		return store.ErrNotFound
	}
	return nil
}
