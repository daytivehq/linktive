CREATE TABLE bookmark_create_requests (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    bookmark_id TEXT NOT NULL,
    PRIMARY KEY (user_id, request_id)
) WITHOUT ROWID;
