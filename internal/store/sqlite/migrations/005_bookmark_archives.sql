CREATE TABLE IF NOT EXISTS bookmark_archives (
    bookmark_id TEXT PRIMARY KEY REFERENCES bookmarks(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'server',
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'ready', 'failed')),
    error_message TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    byline TEXT NOT NULL DEFAULT '',
    site_name TEXT NOT NULL DEFAULT '',
    content_html TEXT NOT NULL DEFAULT '',
    content_text TEXT NOT NULL DEFAULT '',
    asset_count INTEGER NOT NULL DEFAULT 0,
    total_bytes INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bookmark_archives_ws_status
    ON bookmark_archives(workspace_id, status);

CREATE VIRTUAL TABLE IF NOT EXISTS bookmark_archives_fts USING fts5(
    bookmark_id UNINDEXED,
    workspace_id UNINDEXED,
    content_text,
    compact_text,
    tokenize='trigram'
);
