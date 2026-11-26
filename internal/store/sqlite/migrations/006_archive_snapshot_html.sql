ALTER TABLE bookmark_archives ADD COLUMN archive_mode TEXT NOT NULL DEFAULT 'readable';
ALTER TABLE bookmark_archives ADD COLUMN snapshot_html TEXT NOT NULL DEFAULT '';
