ALTER TABLE collections ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
ALTER TABLE collections ADD COLUMN public_slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_public_slug
    ON collections(public_slug) WHERE public_slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS collection_shares (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK(target_type IN ('user', 'workspace')),
    target_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('viewer', 'editor')),
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    UNIQUE(collection_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_shares_target
    ON collection_shares(target_type, target_id);
