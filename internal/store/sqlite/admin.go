package sqlite

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"github.com/linktive/linktive/internal/domain"
	"github.com/linktive/linktive/internal/store"
)

// SetRegistrationEnabled toggles open registration for new users.
func (s *Store) SetRegistrationEnabled(ctx context.Context, enabled bool) error {
	val := "false"
	if enabled {
		val = "true"
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO app_settings (key, value, updated_at)
		VALUES ('registration_enabled', ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
	`, val, formatTime(time.Now().UTC()))
	return err
}

// ListUsers returns all registered users ordered by creation date.
func (s *Store) ListUsers(ctx context.Context) ([]domain.User, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, email, name, password_hash, settings_json, is_admin, totp_enabled, totp_secret, created_at, updated_at
		FROM users
		ORDER BY created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	users := make([]domain.User, 0)
	for rows.Next() {
		var u domain.User
		var isAdmin, totpEnabled int
		var createdAt, updatedAt string
		if err := rows.Scan(
			&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.SettingsJSON,
			&isAdmin, &totpEnabled, &u.TOTPSecret, &createdAt, &updatedAt,
		); err != nil {
			return nil, err
		}
		u.IsAdmin = isAdmin != 0
		u.TOTPEnabled = totpEnabled != 0
		u.CreatedAt = parseTime(createdAt)
		u.UpdatedAt = parseTime(updatedAt)
		users = append(users, u)
	}
	return users, rows.Err()
}

// UpdateUserAdmin updates a user's admin status (preventing removal of the last admin).
func (s *Store) UpdateUserAdmin(ctx context.Context, userID string, isAdmin bool) (domain.User, error) {
	if !isAdmin {
		var adminCount int
		if err := s.db.QueryRowContext(ctx, `SELECT COUNT(1) FROM users WHERE is_admin = 1`).Scan(&adminCount); err != nil {
			return domain.User{}, err
		}
		var targetIsAdmin int
		if err := s.db.QueryRowContext(ctx, `SELECT is_admin FROM users WHERE id = ?`, userID).Scan(&targetIsAdmin); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.User{}, store.ErrNotFound
			}
			return domain.User{}, err
		}
		if targetIsAdmin != 0 && adminCount <= 1 {
			return domain.User{}, store.ErrPermissionDenied
		}
	}

	res, err := s.db.ExecContext(ctx, `
		UPDATE users SET is_admin = ?, updated_at = ? WHERE id = ?
	`, boolToInt(isAdmin), formatTime(time.Now().UTC()), userID)
	if err != nil {
		return domain.User{}, err
	}
	if rows, _ := res.RowsAffected(); rows == 0 {
		return domain.User{}, store.ErrNotFound
	}
	return s.GetUserByID(ctx, userID)
}

// DeleteUser removes a user, cleans up owned workspaces, and reassigns shared bookmarks.
func (s *Store) DeleteUser(ctx context.Context, userID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	// Clean up FTS rows and owned workspaces first to satisfy ON DELETE RESTRICT.
	rows, err := tx.QueryContext(ctx, `SELECT id FROM workspaces WHERE owner_id = ?`, userID)
	if err != nil {
		return err
	}
	var ownedWS []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			_ = rows.Close()
			return err
		}
		ownedWS = append(ownedWS, id)
	}
	_ = rows.Close()

	for _, wsID := range ownedWS {
		if _, err := tx.ExecContext(ctx, `DELETE FROM bookmarks_fts WHERE workspace_id = ?`, wsID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM bookmark_archives_fts WHERE workspace_id=?`, wsID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM workspaces WHERE id = ?`, wsID); err != nil {
			return err
		}
	}

	// Reassign bookmarks created by this user inside other users' shared workspaces to workspace owner.
	if _, err := tx.ExecContext(ctx, `
		UPDATE bookmarks
		SET created_by = (SELECT owner_id FROM workspaces WHERE workspaces.id = bookmarks.workspace_id)
		WHERE created_by = ?
	`, userID); err != nil {
		return err
	}

	// Keep explicitly shared content accessible. Private copies leave with the account.
	if _, err := tx.ExecContext(ctx, `UPDATE bookmark_archives SET created_by='' WHERE created_by=? AND EXISTS (
		SELECT 1 FROM users WHERE id=? AND CASE WHEN json_valid(settings_json) THEN json_extract(settings_json,'$.archive_share_scope') END='shared_members')`, userID, userID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM bookmark_archives_fts WHERE bookmark_id IN (SELECT bookmark_id FROM bookmark_archives WHERE created_by=?)`, userID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM bookmark_archives WHERE created_by=?`, userID); err != nil {
		return err
	}
	res, err := tx.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, userID)
	if err != nil {
		return err
	}
	if rowsAff, _ := res.RowsAffected(); rowsAff == 0 {
		return store.ErrNotFound
	}
	return tx.Commit()
}

// CreateUserInvite creates a single-use registration invite link token.
func (s *Store) CreateUserInvite(ctx context.Context, createdBy string, expiresAt time.Time) (domain.UserInvite, error) {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		return domain.UserInvite{}, err
	}
	now := time.Now().UTC()
	inv := domain.UserInvite{
		ID:        newID(),
		Token:     hex.EncodeToString(buf),
		CreatedBy: createdBy,
		ExpiresAt: expiresAt.UTC(),
		CreatedAt: now,
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO user_invites (id, token, created_by, expires_at, created_at)
		VALUES (?, ?, ?, ?, ?)
	`, inv.ID, inv.Token, inv.CreatedBy, formatTime(inv.ExpiresAt), formatTime(inv.CreatedAt))
	return inv, err
}

// ListUserInvites returns admin-issued invite links ordered newest first.
func (s *Store) ListUserInvites(ctx context.Context) ([]domain.UserInvite, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT i.id, i.token, i.created_by, i.used_by, COALESCE(u.email, ''), i.expires_at, i.used_at, i.created_at
		FROM user_invites i
		LEFT JOIN users u ON u.id = i.used_by
		ORDER BY i.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	items := make([]domain.UserInvite, 0)
	for rows.Next() {
		var inv domain.UserInvite
		var usedBy, usedAt sql.NullString
		var expiresAt, createdAt string
		if err := rows.Scan(
			&inv.ID, &inv.Token, &inv.CreatedBy, &usedBy, &inv.UsedByEmail,
			&expiresAt, &usedAt, &createdAt,
		); err != nil {
			return nil, err
		}
		if usedBy.Valid && usedBy.String != "" {
			v := usedBy.String
			inv.UsedBy = &v
		}
		if usedAt.Valid && usedAt.String != "" {
			t := parseTime(usedAt.String)
			inv.UsedAt = &t
		}
		inv.ExpiresAt = parseTime(expiresAt)
		inv.CreatedAt = parseTime(createdAt)
		items = append(items, inv)
	}
	return items, rows.Err()
}

// DeleteUserInvite revokes an invite link.
func (s *Store) DeleteUserInvite(ctx context.Context, inviteID string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM user_invites WHERE id = ?`, inviteID)
	if err != nil {
		return err
	}
	if rows, _ := res.RowsAffected(); rows == 0 {
		return store.ErrNotFound
	}
	return nil
}

// GetBackupSettings returns automatic backup configuration from app_settings with sensible defaults.
func (s *Store) GetBackupSettings(ctx context.Context) (domain.AutoBackupSettings, error) {
	cfg := domain.AutoBackupSettings{
		Enabled:       true,
		IntervalHours: 24,
		KeepCount:     7,
	}
	var raw string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM app_settings WHERE key = 'auto_backup'`).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return cfg, nil
	}
	if err != nil {
		return cfg, err
	}
	if unmarshalErr := json.Unmarshal([]byte(raw), &cfg); unmarshalErr != nil {
		return domain.AutoBackupSettings{Enabled: true, IntervalHours: 24, KeepCount: 7}, nil
	}
	if cfg.IntervalHours <= 0 {
		cfg.IntervalHours = 24
	}
	if cfg.KeepCount <= 0 {
		cfg.KeepCount = 7
	}
	return cfg, nil
}

// SaveBackupSettings persists automatic backup settings into app_settings.
func (s *Store) SaveBackupSettings(ctx context.Context, cfg domain.AutoBackupSettings) error {
	if cfg.IntervalHours <= 0 {
		cfg.IntervalHours = 24
	}
	if cfg.KeepCount <= 0 {
		cfg.KeepCount = 7
	}
	b, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO app_settings (key, value, updated_at)
		VALUES ('auto_backup', ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
	`, string(b), formatTime(time.Now().UTC()))
	return err
}

// BackupTo creates a consistent online SQLite snapshot at destPath using VACUUM INTO.
func (s *Store) BackupTo(ctx context.Context, destPath string) error {
	_, err := s.db.ExecContext(ctx, `VACUUM INTO ?`, destPath)
	return err
}
