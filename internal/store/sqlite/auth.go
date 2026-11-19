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

const defaultSettingsJSON = `{"click_action":"new_tab","view_mode":"list","visible_fields":{"thumbnail":true,"title":true,"description":true,"note":true,"tags":true,"createdAt":true}}`

// CreateUserWithPersonalWorkspace registers a user and provisions their default personal workspace.
func (s *Store) CreateUserWithPersonalWorkspace(ctx context.Context, email, name, passwordHash string) (domain.User, domain.Workspace, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	now := time.Now().UTC()
	nowStr := formatTime(now)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.User{}, domain.Workspace{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var existing int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(1) FROM users WHERE email = ?`, email).Scan(&existing); err != nil {
		return domain.User{}, domain.Workspace{}, err
	}
	if existing > 0 {
		return domain.User{}, domain.Workspace{}, store.ErrAlreadyExists
	}

	user := domain.User{
		ID:           newID(),
		Email:        email,
		Name:         strings.TrimSpace(name),
		PasswordHash: passwordHash,
		SettingsJSON: defaultSettingsJSON,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO users (id, email, name, password_hash, settings_json, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, user.ID, user.Email, user.Name, user.PasswordHash, user.SettingsJSON, nowStr, nowStr); err != nil {
		return domain.User{}, domain.Workspace{}, err
	}

	ws := domain.Workspace{
		ID:        newID(),
		Name:      "개인 공간",
		Type:      domain.WorkspacePersonal,
		OwnerID:   user.ID,
		Role:      domain.RoleOwner,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO workspaces (id, name, type, owner_id, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, ws.ID, ws.Name, string(ws.Type), ws.OwnerID, nowStr, nowStr); err != nil {
		return domain.User{}, domain.Workspace{}, err
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
		VALUES (?, ?, ?, ?)
	`, ws.ID, user.ID, string(domain.RoleOwner), nowStr); err != nil {
		return domain.User{}, domain.Workspace{}, err
	}

	if err := tx.Commit(); err != nil {
		return domain.User{}, domain.Workspace{}, err
	}
	return user, ws, nil
}

// GetUserByEmail finds a user by normalized email.
func (s *Store) GetUserByEmail(ctx context.Context, email string) (domain.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	return s.scanUser(s.db.QueryRowContext(ctx, `
		SELECT id, email, name, password_hash, settings_json, created_at, updated_at
		FROM users WHERE email = ?
	`, email))
}

// GetUserByID finds a user by ID.
func (s *Store) GetUserByID(ctx context.Context, id string) (domain.User, error) {
	return s.scanUser(s.db.QueryRowContext(ctx, `
		SELECT id, email, name, password_hash, settings_json, created_at, updated_at
		FROM users WHERE id = ?
	`, id))
}

// UpdateUserSettings updates a user's persisted UI/click behavior settings JSON.
func (s *Store) UpdateUserSettings(ctx context.Context, userID, settingsJSON string) (domain.User, error) {
	now := formatTime(time.Now().UTC())
	res, err := s.db.ExecContext(ctx, `
		UPDATE users SET settings_json = ?, updated_at = ? WHERE id = ?
	`, settingsJSON, now, userID)
	if err != nil {
		return domain.User{}, err
	}
	if rows, _ := res.RowsAffected(); rows == 0 {
		return domain.User{}, store.ErrNotFound
	}
	return s.GetUserByID(ctx, userID)
}

// CreateSession stores a hashed session token.
func (s *Store) CreateSession(ctx context.Context, userID, tokenHash string, expiresAt time.Time) (domain.Session, error) {
	now := time.Now().UTC()
	sess := domain.Session{
		ID:        newID(),
		UserID:    userID,
		TokenHash: tokenHash,
		ExpiresAt: expiresAt.UTC(),
		CreatedAt: now,
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
		VALUES (?, ?, ?, ?, ?)
	`, sess.ID, sess.UserID, sess.TokenHash, formatTime(sess.ExpiresAt), formatTime(sess.CreatedAt))
	return sess, err
}

// GetUserBySessionHash resolves an unexpired session token hash to its user.
func (s *Store) GetUserBySessionHash(ctx context.Context, tokenHash string) (domain.User, error) {
	now := formatTime(time.Now().UTC())
	return s.scanUser(s.db.QueryRowContext(ctx, `
		SELECT u.id, u.email, u.name, u.password_hash, u.settings_json, u.created_at, u.updated_at
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = ? AND s.expires_at > ?
	`, tokenHash, now))
}

// DeleteSessionByHash revokes a session token.
func (s *Store) DeleteSessionByHash(ctx context.Context, tokenHash string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash = ?`, tokenHash)
	return err
}

// CreateAPIKey stores a hashed personal API key.
func (s *Store) CreateAPIKey(ctx context.Context, userID, name, keyHash string) (domain.APIKey, error) {
	now := time.Now().UTC()
	key := domain.APIKey{
		ID:        newID(),
		UserID:    userID,
		Name:      strings.TrimSpace(name),
		CreatedAt: now,
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO api_keys (id, user_id, name, key_hash, created_at)
		VALUES (?, ?, ?, ?, ?)
	`, key.ID, key.UserID, key.Name, keyHash, formatTime(now))
	return key, err
}

// ListAPIKeys returns API keys belonging to a user (without secret values).
func (s *Store) ListAPIKeys(ctx context.Context, userID string) ([]domain.APIKey, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, name, last_used_at, created_at
		FROM api_keys WHERE user_id = ? ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	keys := make([]domain.APIKey, 0)
	for rows.Next() {
		var k domain.APIKey
		var lastUsed sql.NullString
		var createdAt string
		if err := rows.Scan(&k.ID, &k.UserID, &k.Name, &lastUsed, &createdAt); err != nil {
			return nil, err
		}
		k.CreatedAt = parseTime(createdAt)
		if lastUsed.Valid && lastUsed.String != "" {
			t := parseTime(lastUsed.String)
			k.LastUsedAt = &t
		}
		keys = append(keys, k)
	}
	return keys, rows.Err()
}

// DeleteAPIKey revokes a user's API key.
func (s *Store) DeleteAPIKey(ctx context.Context, userID, keyID string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM api_keys WHERE id = ? AND user_id = ?`, keyID, userID)
	if err != nil {
		return err
	}
	if rows, _ := res.RowsAffected(); rows == 0 {
		return store.ErrNotFound
	}
	return nil
}

// GetUserByAPIKeyHash resolves a bearer API key hash and updates last_used_at.
func (s *Store) GetUserByAPIKeyHash(ctx context.Context, keyHash string) (domain.User, error) {
	u, err := s.scanUser(s.db.QueryRowContext(ctx, `
		SELECT u.id, u.email, u.name, u.password_hash, u.settings_json, u.created_at, u.updated_at
		FROM api_keys k
		JOIN users u ON u.id = k.user_id
		WHERE k.key_hash = ?
	`, keyHash))
	if err != nil {
		return domain.User{}, err
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?`, formatTime(time.Now().UTC()), keyHash)
	return u, nil
}

func (s *Store) scanUser(row *sql.Row) (domain.User, error) {
	var u domain.User
	var createdAt, updatedAt string
	err := row.Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.SettingsJSON, &createdAt, &updatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.User{}, store.ErrNotFound
	}
	if err != nil {
		return domain.User{}, err
	}
	u.CreatedAt = parseTime(createdAt)
	u.UpdatedAt = parseTime(updatedAt)
	return u, nil
}
