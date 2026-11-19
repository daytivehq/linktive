package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/linktive/linktive/internal/domain"
	"github.com/linktive/linktive/internal/search"
	"github.com/linktive/linktive/internal/store"
)

// CreateBookmark stores a bookmark, checks duplicates unless bypassed, syncs tags, and updates FTS5.
func (s *Store) CreateBookmark(ctx context.Context, input store.CreateBookmarkInput) (domain.Bookmark, error) {
	colID := normalizeOptionalID(input.CollectionID)
	if colID != nil {
		if err := s.ensureCollectionExists(ctx, input.WorkspaceID, *colID); err != nil {
			return domain.Bookmark{}, store.ErrInvalidParent
		}
	}

	if !input.AllowDuplicate {
		var dupID string
		err := s.db.QueryRowContext(ctx, `
			SELECT id FROM bookmarks WHERE workspace_id = ? AND normalized_url = ? LIMIT 1
		`, input.WorkspaceID, input.NormalizedURL).Scan(&dupID)
		if err == nil {
			existing, getErr := s.GetBookmark(ctx, input.WorkspaceID, dupID)
			if getErr != nil {
				return domain.Bookmark{}, store.ErrDuplicateURL
			}
			return domain.Bookmark{}, &store.DuplicateURLError{Existing: existing}
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return domain.Bookmark{}, err
		}
	}

	tags := normalizeTags(input.Tags)
	now := time.Now().UTC()
	nowStr := formatTime(now)

	bm := domain.Bookmark{
		ID:            newID(),
		WorkspaceID:   input.WorkspaceID,
		CollectionID:  colID,
		CreatedBy:     input.CreatedBy,
		URL:           strings.TrimSpace(input.URL),
		NormalizedURL: input.NormalizedURL,
		Domain:        strings.ToLower(strings.TrimSpace(input.Domain)),
		Title:         strings.TrimSpace(input.Title),
		Description:   strings.TrimSpace(input.Description),
		Note:          strings.TrimSpace(input.Note),
		FaviconURL:    strings.TrimSpace(input.FaviconURL),
		ThumbnailURL:  strings.TrimSpace(input.ThumbnailURL),
		IsFavorite:    input.IsFavorite,
		LinkStatus:    domain.LinkStatusUnknown,
		Tags:          tags,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	tagsText := strings.Join(tags, " ")
	compactText := search.CompactText(bm.Title, tagsText, bm.Note, bm.Description, bm.Domain, bm.URL)
	chosungText := search.ExtractChosung(bm.Title, tagsText, bm.Note, bm.Description)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.Bookmark{}, err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO bookmarks (
			id, workspace_id, collection_id, created_by, url, normalized_url, domain,
			title, description, note, favicon_url, thumbnail_url, is_favorite, link_status,
			compact_text, chosung_text, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, bm.ID, bm.WorkspaceID, nullableString(bm.CollectionID), bm.CreatedBy, bm.URL, bm.NormalizedURL, bm.Domain,
		bm.Title, bm.Description, bm.Note, bm.FaviconURL, bm.ThumbnailURL, boolToInt(bm.IsFavorite), string(bm.LinkStatus),
		compactText, chosungText, nowStr, nowStr); err != nil {
		return domain.Bookmark{}, err
	}

	if err := syncBookmarkTagsTx(ctx, tx, bm.WorkspaceID, bm.ID, tags, nowStr); err != nil {
		return domain.Bookmark{}, err
	}
	if err := upsertBookmarkFTSTx(ctx, tx, bm, tagsText, compactText); err != nil {
		return domain.Bookmark{}, err
	}

	if err := tx.Commit(); err != nil {
		return domain.Bookmark{}, err
	}
	return bm, nil
}

// GetBookmark fetches a single bookmark with its tags within a workspace.
func (s *Store) GetBookmark(ctx context.Context, workspaceID, bookmarkID string) (domain.Bookmark, error) {
	bm, err := s.scanBookmark(s.db.QueryRowContext(ctx, `
		SELECT id, workspace_id, collection_id, created_by, url, normalized_url, domain,
		       title, description, note, favicon_url, thumbnail_url, is_favorite, link_status,
		       last_checked_at, created_at, updated_at
		FROM bookmarks WHERE id = ? AND workspace_id = ?
	`, bookmarkID, workspaceID))
	if err != nil {
		return domain.Bookmark{}, err
	}
	tagMap, err := s.loadTagsForBookmarks(ctx, []string{bm.ID})
	if err != nil {
		return domain.Bookmark{}, err
	}
	bm.Tags = tagMap[bm.ID]
	if bm.Tags == nil {
		bm.Tags = []string{}
	}
	return bm, nil
}

// UpdateBookmark updates bookmark fields, tags, optional collection/workspace move, and FTS5 index.
func (s *Store) UpdateBookmark(ctx context.Context, input store.UpdateBookmarkInput) (domain.Bookmark, error) {
	cur, err := s.GetBookmark(ctx, input.WorkspaceID, input.BookmarkID)
	if err != nil {
		return domain.Bookmark{}, err
	}

	movedWorkspace := false
	if input.TargetWorkspaceID != nil && *input.TargetWorkspaceID != "" && *input.TargetWorkspaceID != cur.WorkspaceID {
		cur.WorkspaceID = *input.TargetWorkspaceID
		cur.CollectionID = nil
		movedWorkspace = true
	}

	if input.ClearCollection {
		cur.CollectionID = nil
	} else if input.CollectionID != nil {
		colID := normalizeOptionalID(input.CollectionID)
		if colID != nil {
			if err := s.ensureCollectionExists(ctx, cur.WorkspaceID, *colID); err != nil {
				return domain.Bookmark{}, store.ErrInvalidParent
			}
		}
		cur.CollectionID = colID
	}

	if input.URL != nil {
		cur.URL = strings.TrimSpace(*input.URL)
	}
	if input.NormalizedURL != nil {
		cur.NormalizedURL = *input.NormalizedURL
	}
	if input.Domain != nil {
		cur.Domain = strings.ToLower(strings.TrimSpace(*input.Domain))
	}
	if input.Title != nil {
		cur.Title = strings.TrimSpace(*input.Title)
	}
	if input.Description != nil {
		cur.Description = strings.TrimSpace(*input.Description)
	}
	if input.Note != nil {
		cur.Note = strings.TrimSpace(*input.Note)
	}
	if input.FaviconURL != nil {
		cur.FaviconURL = strings.TrimSpace(*input.FaviconURL)
	}
	if input.ThumbnailURL != nil {
		cur.ThumbnailURL = strings.TrimSpace(*input.ThumbnailURL)
	}
	if input.IsFavorite != nil {
		cur.IsFavorite = *input.IsFavorite
	}
	if input.ReplaceTags {
		cur.Tags = normalizeTags(input.Tags)
	}

	cur.UpdatedAt = time.Now().UTC()
	nowStr := formatTime(cur.UpdatedAt)
	tagsText := strings.Join(cur.Tags, " ")
	compactText := search.CompactText(cur.Title, tagsText, cur.Note, cur.Description, cur.Domain, cur.URL)
	chosungText := search.ExtractChosung(cur.Title, tagsText, cur.Note, cur.Description)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.Bookmark{}, err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `
		UPDATE bookmarks
		SET workspace_id = ?, collection_id = ?, url = ?, normalized_url = ?, domain = ?,
		    title = ?, description = ?, note = ?, favicon_url = ?, thumbnail_url = ?,
		    is_favorite = ?, compact_text = ?, chosung_text = ?, updated_at = ?
		WHERE id = ?
	`, cur.WorkspaceID, nullableString(cur.CollectionID), cur.URL, cur.NormalizedURL, cur.Domain,
		cur.Title, cur.Description, cur.Note, cur.FaviconURL, cur.ThumbnailURL,
		boolToInt(cur.IsFavorite), compactText, chosungText, nowStr, cur.ID); err != nil {
		return domain.Bookmark{}, err
	}

	if input.ReplaceTags || movedWorkspace {
		if err := syncBookmarkTagsTx(ctx, tx, cur.WorkspaceID, cur.ID, cur.Tags, nowStr); err != nil {
			return domain.Bookmark{}, err
		}
	}
	if err := upsertBookmarkFTSTx(ctx, tx, cur, tagsText, compactText); err != nil {
		return domain.Bookmark{}, err
	}

	if err := tx.Commit(); err != nil {
		return domain.Bookmark{}, err
	}
	return cur, nil
}

// DeleteBookmark removes a bookmark and its FTS5 index row.
func (s *Store) DeleteBookmark(ctx context.Context, workspaceID, bookmarkID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	res, err := tx.ExecContext(ctx, `DELETE FROM bookmarks WHERE id = ? AND workspace_id = ?`, bookmarkID, workspaceID)
	if err != nil {
		return err
	}
	if rows, _ := res.RowsAffected(); rows == 0 {
		return store.ErrNotFound
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM bookmarks_fts WHERE bookmark_id = ?`, bookmarkID); err != nil {
		return err
	}
	return tx.Commit()
}

// BulkBookmarks executes batch favorite/move/delete/tag updates on multiple bookmarks in a single transaction.
func (s *Store) BulkBookmarks(ctx context.Context, input store.BulkBookmarkInput) (int, error) {
	if len(input.BookmarkIDs) == 0 {
		return 0, nil
	}
	if input.Action == "move" && input.CollectionID != nil && *input.CollectionID != "" {
		if err := s.ensureCollectionExists(ctx, input.WorkspaceID, *input.CollectionID); err != nil {
			return 0, store.ErrInvalidParent
		}
	}

	nowStr := formatTime(time.Now().UTC())
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	affected := 0
	normalizedInputTags := normalizeTags(input.Tags)

	for _, bmID := range input.BookmarkIDs {
		var exists int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(1) FROM bookmarks WHERE id = ? AND workspace_id = ?`, bmID, input.WorkspaceID).Scan(&exists); err != nil {
			return 0, err
		}
		if exists == 0 {
			continue
		}

		switch input.Action {
		case "favorite", "unfavorite":
			fav := 0
			if input.Action == "favorite" {
				fav = 1
			}
			if _, err := tx.ExecContext(ctx, `UPDATE bookmarks SET is_favorite = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`, fav, nowStr, bmID, input.WorkspaceID); err != nil {
				return 0, err
			}
		case "move":
			col := normalizeOptionalID(input.CollectionID)
			if _, err := tx.ExecContext(ctx, `UPDATE bookmarks SET collection_id = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`, nullableString(col), nowStr, bmID, input.WorkspaceID); err != nil {
				return 0, err
			}
		case "delete":
			if _, err := tx.ExecContext(ctx, `DELETE FROM bookmarks WHERE id = ? AND workspace_id = ?`, bmID, input.WorkspaceID); err != nil {
				return 0, err
			}
			if _, err := tx.ExecContext(ctx, `DELETE FROM bookmarks_fts WHERE bookmark_id = ?`, bmID); err != nil {
				return 0, err
			}
		case "tags_set", "tags_add", "tags_remove":
			curTags, err := loadTagsForBookmarkTx(ctx, tx, bmID)
			if err != nil {
				return 0, err
			}
			nextTags := mergeTagChange(curTags, normalizedInputTags, input.Action)
			if err := syncBookmarkTagsTx(ctx, tx, input.WorkspaceID, bmID, nextTags, nowStr); err != nil {
				return 0, err
			}
			if _, err := tx.ExecContext(ctx, `UPDATE bookmarks SET updated_at = ? WHERE id = ?`, nowStr, bmID); err != nil {
				return 0, err
			}
			if err := reindexBookmarkTx(ctx, tx, bmID); err != nil {
				return 0, err
			}
		default:
			return 0, store.ErrInvalidParent
		}
		affected++
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return affected, nil
}

// RenameTag renames (or merges into an existing target tag) and updates affected search indexes.
func (s *Store) RenameTag(ctx context.Context, workspaceID, oldName, newName string) error {
	oldClean := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(oldName, "#")))
	newClean := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(newName, "#")))
	if oldClean == "" || newClean == "" {
		return store.ErrInvalidParent
	}
	if oldClean == newClean {
		return nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var oldID string
	err = tx.QueryRowContext(ctx, `SELECT id FROM tags WHERE workspace_id = ? AND name = ?`, workspaceID, oldClean).Scan(&oldID)
	if errors.Is(err, sql.ErrNoRows) {
		return store.ErrNotFound
	}
	if err != nil {
		return err
	}

	affectedIDs, err := bookmarkIDsForTagTx(ctx, tx, oldID)
	if err != nil {
		return err
	}

	var targetID string
	err = tx.QueryRowContext(ctx, `SELECT id FROM tags WHERE workspace_id = ? AND name = ?`, workspaceID, newClean).Scan(&targetID)
	if errors.Is(err, sql.ErrNoRows) {
		if _, err := tx.ExecContext(ctx, `UPDATE tags SET name = ? WHERE id = ?`, newClean, oldID); err != nil {
			return err
		}
	} else if err != nil {
		return err
	} else {
		// Merge into existing tag.
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id) SELECT bookmark_id, ? FROM bookmark_tags WHERE tag_id = ?`, targetID, oldID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM tags WHERE id = ?`, oldID); err != nil {
			return err
		}
	}

	for _, bmID := range affectedIDs {
		if err := reindexBookmarkTx(ctx, tx, bmID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// DeleteTag removes a tag from the workspace without deleting bookmarks and updates search indexes.
func (s *Store) DeleteTag(ctx context.Context, workspaceID, tagName string) error {
	clean := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(tagName, "#")))
	if clean == "" {
		return store.ErrNotFound
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var tagID string
	err = tx.QueryRowContext(ctx, `SELECT id FROM tags WHERE workspace_id = ? AND name = ?`, workspaceID, clean).Scan(&tagID)
	if errors.Is(err, sql.ErrNoRows) {
		return store.ErrNotFound
	}
	if err != nil {
		return err
	}

	affectedIDs, err := bookmarkIDsForTagTx(ctx, tx, tagID)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM tags WHERE id = ?`, tagID); err != nil {
		return err
	}
	for _, bmID := range affectedIDs {
		if err := reindexBookmarkTx(ctx, tx, bmID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func bookmarkIDsForTagTx(ctx context.Context, tx *sql.Tx, tagID string) ([]string, error) {
	rows, err := tx.QueryContext(ctx, `SELECT bookmark_id FROM bookmark_tags WHERE tag_id = ?`, tagID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func loadTagsForBookmarkTx(ctx context.Context, tx *sql.Tx, bookmarkID string) ([]string, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT t.name FROM bookmark_tags bt
		JOIN tags t ON t.id = bt.tag_id
		WHERE bt.bookmark_id = ?
		ORDER BY t.name COLLATE NOCASE ASC
	`, bookmarkID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var tags []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		tags = append(tags, name)
	}
	return tags, rows.Err()
}

func reindexBookmarkTx(ctx context.Context, tx *sql.Tx, bookmarkID string) error {
	var bm domain.Bookmark
	err := tx.QueryRowContext(ctx, `
		SELECT id, workspace_id, url, domain, title, description, note
		FROM bookmarks WHERE id = ?
	`, bookmarkID).Scan(&bm.ID, &bm.WorkspaceID, &bm.URL, &bm.Domain, &bm.Title, &bm.Description, &bm.Note)
	if err != nil {
		return err
	}
	tags, err := loadTagsForBookmarkTx(ctx, tx, bookmarkID)
	if err != nil {
		return err
	}
	tagsText := strings.Join(tags, " ")
	compactText := search.CompactText(bm.Title, tagsText, bm.Note, bm.Description, bm.Domain, bm.URL)
	chosungText := search.ExtractChosung(bm.Title, tagsText, bm.Note, bm.Description)
	if _, err := tx.ExecContext(ctx, `UPDATE bookmarks SET compact_text = ?, chosung_text = ? WHERE id = ?`, compactText, chosungText, bookmarkID); err != nil {
		return err
	}
	return upsertBookmarkFTSTx(ctx, tx, bm, tagsText, compactText)
}

func mergeTagChange(curTags, inputTags []string, action string) []string {
	switch action {
	case "tags_set":
		return inputTags
	case "tags_add":
		return normalizeTags(append(append([]string{}, curTags...), inputTags...))
	case "tags_remove":
		removeSet := make(map[string]struct{}, len(inputTags))
		for _, t := range inputTags {
			removeSet[t] = struct{}{}
		}
		out := make([]string, 0, len(curTags))
		for _, t := range curTags {
			if _, rm := removeSet[t]; !rm {
				out = append(out, t)
			}
		}
		return out
	default:
		return curTags
	}
}

// ListTags returns tags currently in use within a workspace sorted by name.
func (s *Store) ListTags(ctx context.Context, workspaceID string) ([]domain.TagSummary, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT t.name, COUNT(bt.bookmark_id) AS cnt
		FROM tags t
		JOIN bookmark_tags bt ON bt.tag_id = t.id
		JOIN bookmarks b ON b.id = bt.bookmark_id AND b.workspace_id = t.workspace_id
		WHERE t.workspace_id = ?
		GROUP BY t.id
		HAVING cnt > 0
		ORDER BY t.name COLLATE NOCASE ASC
	`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	items := make([]domain.TagSummary, 0)
	for rows.Next() {
		var item domain.TagSummary
		if err := rows.Scan(&item.Name, &item.Count); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// GetWorkspaceStats returns sidebar counters for all, favorite, and uncollected bookmarks.
func (s *Store) GetWorkspaceStats(ctx context.Context, workspaceID string) (domain.WorkspaceStats, error) {
	var stats domain.WorkspaceStats
	err := s.db.QueryRowContext(ctx, `
		SELECT
			COUNT(1),
			COALESCE(SUM(CASE WHEN is_favorite = 1 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN collection_id IS NULL THEN 1 ELSE 0 END), 0)
		FROM bookmarks
		WHERE workspace_id = ?
	`, workspaceID).Scan(&stats.AllCount, &stats.FavoriteCount, &stats.UncollectedCount)
	return stats, err
}

// SearchBookmarks executes Korean hybrid search (FTS5 trigram for 3+ chars, compact substring/chosung for 1-2 chars)
// combined with operator filters.
func (s *Store) SearchBookmarks(ctx context.Context, query store.SearchQuery) (store.SearchResult, error) {
	where := []string{"b.workspace_id = ?"}
	args := []any{query.WorkspaceID}

	if query.CollectionID != nil && *query.CollectionID != "" {
		if *query.CollectionID == "uncollected" {
			where = append(where, "b.collection_id IS NULL")
		} else if query.IncludeSubcollections {
			where = append(where, `b.collection_id IN (
				WITH RECURSIVE subcols(id) AS (
					SELECT id FROM collections WHERE id = ? AND workspace_id = ?
					UNION ALL
					SELECT c.id FROM collections c JOIN subcols s ON c.parent_id = s.id WHERE c.workspace_id = ?
				)
				SELECT id FROM subcols
			)`)
			args = append(args, *query.CollectionID, query.WorkspaceID, query.WorkspaceID)
		} else {
			where = append(where, "b.collection_id = ?")
			args = append(args, *query.CollectionID)
		}
	}
	if query.OnlyFavorite != nil && *query.OnlyFavorite {
		where = append(where, "b.is_favorite = 1")
	}
	if query.LinkStatus != nil {
		where = append(where, "b.link_status = ?")
		args = append(args, string(*query.LinkStatus))
	}
	if query.Collection != "" {
		where = append(where, "EXISTS (SELECT 1 FROM collections c WHERE c.id = b.collection_id AND LOWER(c.name) = LOWER(?))")
		args = append(args, query.Collection)
	}
	if query.DateExact != "" {
		where = append(where, "b.created_at LIKE ?")
		args = append(args, query.DateExact+"%")
	}
	if query.DateAfter != "" {
		where = append(where, "b.created_at >= ?")
		args = append(args, query.DateAfter)
	}
	if query.DateBefore != "" {
		where = append(where, "b.created_at <= ?")
		args = append(args, query.DateBefore+"T23:59:59.999999999Z")
	}
	for _, d := range query.Domains {
		d = strings.ToLower(strings.TrimSpace(d))
		if d == "" {
			continue
		}
		where = append(where, "(LOWER(b.domain) = ? OR LOWER(b.domain) LIKE ?)")
		args = append(args, d, "%."+d)
	}
	for _, tag := range query.IncludeTags {
		t := strings.ToLower(strings.TrimSpace(tag))
		if t == "" {
			continue
		}
		where = append(where, `EXISTS (
			SELECT 1 FROM bookmark_tags bt
			JOIN tags tg ON tg.id = bt.tag_id
			WHERE bt.bookmark_id = b.id AND LOWER(tg.name) = ?
		)`)
		args = append(args, t)
	}
	for _, tag := range query.ExcludeTags {
		t := strings.ToLower(strings.TrimSpace(tag))
		if t == "" {
			continue
		}
		where = append(where, `NOT EXISTS (
			SELECT 1 FROM bookmark_tags bt
			JOIN tags tg ON tg.id = bt.tag_id
			WHERE bt.bookmark_id = b.id AND LOWER(tg.name) = ?
		)`)
		args = append(args, t)
	}

	var relevanceParts []string
	var relevanceArgs []any
	for _, term := range query.Terms {
		compact := search.CompactText(term)
		if compact == "" {
			continue
		}
		runes := utf8.RuneCountInString(compact)
		if search.IsChosungOnly(compact) {
			where = append(where, "(INSTR(b.chosung_text, ?) > 0 OR INSTR(b.compact_text, ?) > 0)")
			args = append(args, compact, compact)
		} else if runes >= 3 {
			where = append(where, `b.id IN (
				SELECT bookmark_id FROM bookmarks_fts WHERE workspace_id = ? AND bookmarks_fts MATCH ?
			)`)
			args = append(args, query.WorkspaceID, search.QuoteFTS5Literal(compact))
		} else {
			// 1-2 character Korean/ASCII queries bypass trigram and match normalized compact text directly.
			where = append(where, "INSTR(b.compact_text, ?) > 0")
			args = append(args, compact)
		}

		relevanceParts = append(relevanceParts, "CASE WHEN INSTR(LOWER(b.title), ?) > 0 THEN 4 ELSE 0 END")
		relevanceArgs = append(relevanceArgs, strings.ToLower(term))
	}

	whereClause := strings.Join(where, " AND ")

	var total int
	countSQL := fmt.Sprintf("SELECT COUNT(1) FROM bookmarks b WHERE %s", whereClause)
	if err := s.db.QueryRowContext(ctx, countSQL, args...).Scan(&total); err != nil {
		return store.SearchResult{}, err
	}

	orderBy := "b.created_at DESC"
	switch query.Sort {
	case "oldest":
		orderBy = "b.created_at ASC"
	case "title":
		orderBy = "b.title COLLATE NOCASE ASC, b.created_at DESC"
	default:
		if len(relevanceParts) > 0 && (query.Sort == "" || query.Sort == "relevance") {
			orderBy = "(" + strings.Join(relevanceParts, " + ") + ") DESC, b.created_at DESC"
		}
	}

	limit := query.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	offset := query.Offset
	if offset < 0 {
		offset = 0
	}

	listSQL := fmt.Sprintf(`
		SELECT b.id, b.workspace_id, b.collection_id, b.created_by, b.url, b.normalized_url, b.domain,
		       b.title, b.description, b.note, b.favicon_url, b.thumbnail_url, b.is_favorite, b.link_status,
		       b.last_checked_at, b.created_at, b.updated_at
		FROM bookmarks b
		WHERE %s
		ORDER BY %s
		LIMIT ? OFFSET ?
	`, whereClause, orderBy)

	queryArgs := make([]any, 0, len(args)+len(relevanceArgs)+2)
	queryArgs = append(queryArgs, args...)
	if strings.Contains(orderBy, "CASE WHEN") {
		queryArgs = append(queryArgs, relevanceArgs...)
	}
	queryArgs = append(queryArgs, limit, offset)

	rows, err := s.db.QueryContext(ctx, listSQL, queryArgs...)
	if err != nil {
		return store.SearchResult{}, err
	}
	defer func() { _ = rows.Close() }()

	items := make([]domain.Bookmark, 0)
	ids := make([]string, 0)
	for rows.Next() {
		bm, err := scanBookmarkRows(rows)
		if err != nil {
			return store.SearchResult{}, err
		}
		items = append(items, bm)
		ids = append(ids, bm.ID)
	}
	if err := rows.Err(); err != nil {
		return store.SearchResult{}, err
	}

	tagMap, err := s.loadTagsForBookmarks(ctx, ids)
	if err != nil {
		return store.SearchResult{}, err
	}
	for i := range items {
		tags := tagMap[items[i].ID]
		if tags == nil {
			tags = []string{}
		}
		items[i].Tags = tags
	}

	return store.SearchResult{Items: items, Total: total}, nil
}

func (s *Store) loadTagsForBookmarks(ctx context.Context, bookmarkIDs []string) (map[string][]string, error) {
	result := make(map[string][]string, len(bookmarkIDs))
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
		SELECT bt.bookmark_id, t.name
		FROM bookmark_tags bt
		JOIN tags t ON t.id = bt.tag_id
		WHERE bt.bookmark_id IN (%s)
		ORDER BY t.name COLLATE NOCASE ASC
	`, strings.Join(placeholders, ","))

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	for rows.Next() {
		var bmID, tagName string
		if err := rows.Scan(&bmID, &tagName); err != nil {
			return nil, err
		}
		result[bmID] = append(result[bmID], tagName)
	}
	return result, rows.Err()
}

func syncBookmarkTagsTx(ctx context.Context, tx *sql.Tx, workspaceID, bookmarkID string, tags []string, nowStr string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM bookmark_tags WHERE bookmark_id = ?`, bookmarkID); err != nil {
		return err
	}
	for _, tagName := range tags {
		var tagID string
		err := tx.QueryRowContext(ctx, `SELECT id FROM tags WHERE workspace_id = ? AND name = ?`, workspaceID, tagName).Scan(&tagID)
		if errors.Is(err, sql.ErrNoRows) {
			tagID = newID()
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO tags (id, workspace_id, name, created_at) VALUES (?, ?, ?, ?)
			`, tagID, workspaceID, tagName, nowStr); err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)
		`, bookmarkID, tagID); err != nil {
			return err
		}
	}
	return nil
}

func upsertBookmarkFTSTx(ctx context.Context, tx *sql.Tx, bm domain.Bookmark, tagsText, compactText string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM bookmarks_fts WHERE bookmark_id = ?`, bm.ID); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `
		INSERT INTO bookmarks_fts (
			bookmark_id, workspace_id, title, tags_text, note, description, domain, url, compact_text
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, bm.ID, bm.WorkspaceID, bm.Title, tagsText, bm.Note, bm.Description, bm.Domain, bm.URL, compactText)
	return err
}

func (s *Store) scanBookmark(row *sql.Row) (domain.Bookmark, error) {
	var bm domain.Bookmark
	var colID, lastChecked sql.NullString
	var isFav int
	var status, createdAt, updatedAt string
	err := row.Scan(
		&bm.ID, &bm.WorkspaceID, &colID, &bm.CreatedBy, &bm.URL, &bm.NormalizedURL, &bm.Domain,
		&bm.Title, &bm.Description, &bm.Note, &bm.FaviconURL, &bm.ThumbnailURL, &isFav, &status,
		&lastChecked, &createdAt, &updatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Bookmark{}, store.ErrNotFound
	}
	if err != nil {
		return domain.Bookmark{}, err
	}
	hydrateBookmarkFields(&bm, colID, lastChecked, isFav, status, createdAt, updatedAt)
	return bm, nil
}

func scanBookmarkRows(rows *sql.Rows) (domain.Bookmark, error) {
	var bm domain.Bookmark
	var colID, lastChecked sql.NullString
	var isFav int
	var status, createdAt, updatedAt string
	err := rows.Scan(
		&bm.ID, &bm.WorkspaceID, &colID, &bm.CreatedBy, &bm.URL, &bm.NormalizedURL, &bm.Domain,
		&bm.Title, &bm.Description, &bm.Note, &bm.FaviconURL, &bm.ThumbnailURL, &isFav, &status,
		&lastChecked, &createdAt, &updatedAt,
	)
	if err != nil {
		return domain.Bookmark{}, err
	}
	hydrateBookmarkFields(&bm, colID, lastChecked, isFav, status, createdAt, updatedAt)
	return bm, nil
}

func hydrateBookmarkFields(bm *domain.Bookmark, colID, lastChecked sql.NullString, isFav int, status, createdAt, updatedAt string) {
	if colID.Valid {
		v := colID.String
		bm.CollectionID = &v
	}
	bm.IsFavorite = isFav != 0
	bm.LinkStatus = domain.LinkStatus(status)
	if lastChecked.Valid && lastChecked.String != "" {
		t := parseTime(lastChecked.String)
		bm.LastCheckedAt = &t
	}
	bm.CreatedAt = parseTime(createdAt)
	bm.UpdatedAt = parseTime(updatedAt)
	bm.Tags = []string{}
}

func normalizeTags(tags []string) []string {
	seen := make(map[string]struct{}, len(tags))
	out := make([]string, 0, len(tags))
	for _, t := range tags {
		clean := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(t, "#")))
		if clean == "" {
			continue
		}
		if _, ok := seen[clean]; ok {
			continue
		}
		seen[clean] = struct{}{}
		out = append(out, clean)
	}
	return out
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
