# linktive REST API Manual

**English** | [한국어](API.ko.md)

The base path is `/api/v1`. The web UI, browser extension, and automation scripts (n8n, cron backups, Shortcuts, etc.) all use this same REST API.

## 1. Authentication

Generate a `lkt_...` token under **Settings → API Keys** in the web UI, then send it in the `Authorization` header:

```http
Authorization: Bearer lkt_YOUR_API_KEY
```

---

## 2. Endpoints

### Health & Account
- `GET /api/v1/health` — Server and SQLite health check (no auth required)
- `GET /api/v1/auth/me` — Current account and workspaces
- `PATCH /api/v1/auth/settings` — Save user preferences (`language`, click action, view mode, clip format, search defaults, etc.)
- `GET /api/v1/api-keys`, `POST /api/v1/api-keys`, `DELETE /api/v1/api-keys/{keyID}` — Manage API keys

### Workspaces
- `GET /api/v1/workspaces` — List workspaces
- `POST /api/v1/workspaces` — Create a shared workspace (`{"name": "Team"}`)
- `PATCH /api/v1/workspaces/{wsID}` — Rename workspace (Owner)
- `DELETE /api/v1/workspaces/{wsID}` — Delete shared workspace (Owner, personal workspace cannot be deleted)
- `GET/POST /api/v1/workspaces/{wsID}/members`, `DELETE /api/v1/workspaces/{wsID}/members/{userID}` — Manage workspace members

### Collections & Sharing
- `GET /api/v1/workspaces/{wsID}/collections` — List collections with bookmark counts
- `POST /api/v1/workspaces/{wsID}/collections` — Create collection (`name`, `parent_id`, `description`, `icon`, `color`)
- `PATCH /api/v1/workspaces/{wsID}/collections/{colID}` — Update or move collection
- `DELETE /api/v1/workspaces/{wsID}/collections/{colID}` — Delete collection
- `POST /api/v1/workspaces/{wsID}/collections/{colID}/public` — Toggle public link (`{"enabled": true}`)
- `GET /api/v1/public/collections/{slug}` — Read public collection (no auth required)
- `GET/POST /api/v1/workspaces/{wsID}/collections/{colID}/shares`, `DELETE .../shares/{shareID}` — Manage user/workspace shares
- `GET /api/v1/shared-collections` — List collections shared with you

### Bookmarks · Search · Bulk Actions
- `GET /api/v1/workspaces/{wsID}/bookmarks`
  - Query params: `q`, `collection_id` (`uncollected` supported), `include_children=true`, `favorite=true`, `tag`, `link_status` (`unknown|ok|broken|blocked`), `search_archive` (`true|false`), `sort` (`relevance|newest|oldest|title`), `limit`, `offset`
  - Search operators: `tags:`, `-tags:`, `site:`, `in:`, `date:YYYY-MM-DD`, `after:YYYY-MM-DD`, `before:YYYY-MM-DD`, `is:favorite`, `is:broken`, `is:blocked`
- `POST /api/v1/workspaces/{wsID}/bookmarks`
  - `{"url": "https://example.com", "collection_id": null, "tags": ["dev"], "allow_duplicate": false, "clip_now": false}`
  - Leave `title` / `description` empty to auto-fetch metadata and favicon.
  - Duplicate normalized URLs return `409 Conflict` with the `existing` bookmark.
- `GET /api/v1/workspaces/{wsID}/bookmarks/{bmID}` — Get bookmark
- `PATCH /api/v1/workspaces/{wsID}/bookmarks/{bmID}` — Update bookmark or move to `target_workspace_id`
- `DELETE /api/v1/workspaces/{wsID}/bookmarks/{bmID}` — Delete bookmark and its archived copy/assets
- `POST /api/v1/workspaces/{wsID}/bookmarks/bulk`
  - `action`: `favorite`, `unfavorite`, `move`, `delete`, `tags_add`, `tags_set`, `tags_remove`

### Web Clipper · Archiving · Usage
- `GET /api/v1/workspaces/{wsID}/bookmarks/{bmID}/archive` — Fetch archived content (respects owner visibility policy)
- `POST /api/v1/workspaces/{wsID}/bookmarks/{bmID}/archive` — Clip or save archived content (`mode`: `readable|snapshot|both`, optional `html`)
- `DELETE /api/v1/workspaces/{wsID}/bookmarks/{bmID}/archive` — Delete archived content and cached assets
- `GET /api/v1/workspaces/{wsID}/bookmarks/{bmID}/export/markdown` — Export Markdown with YAML frontmatter (plus local images `.zip` when present)
- `DELETE /api/v1/workspaces/{wsID}/archives` — Clear all archived data in the workspace
- `GET /api/v1/workspaces/{wsID}/usage` — Workspace bookmark, tag, collection, and archive storage usage

### Saved Filters & Link Health
- `GET /api/v1/workspaces/{wsID}/filters` — List saved filters
- `POST /api/v1/workspaces/{wsID}/filters` — Create saved filter (`name`, `query`, `icon`, `color`)
- `PATCH /api/v1/workspaces/{wsID}/filters/{filterID}` — Update saved filter
- `DELETE /api/v1/workspaces/{wsID}/filters/{filterID}` — Delete saved filter
- `POST /api/v1/workspaces/{wsID}/bookmarks/{bmID}/check-link` — Check a single bookmark URL
- `POST /api/v1/workspaces/{wsID}/bookmarks/{bmID}/link-status` — Manually override link status (`{"link_status": "ok|broken|blocked|unknown"}`)
- `POST /api/v1/workspaces/{wsID}/links/check` — Batch-check workspace links (optional `{"only_unchecked": true}`)
- `GET /api/v1/workspaces/{wsID}/links/duplicates` — List duplicate URL groups

### Tags · Stats · Import / Export
- `GET /api/v1/workspaces/{wsID}/tags` — List tags and counts
- `PATCH /api/v1/workspaces/{wsID}/tags/{tagName}` — Rename tag (auto-merges if target name exists)
- `DELETE /api/v1/workspaces/{wsID}/tags/{tagName}` — Delete tag
- `GET /api/v1/workspaces/{wsID}/stats` — Counts for all, favorites, uncollected, broken, blocked, and duplicate bookmarks
- `GET /api/v1/workspaces/{wsID}/export?format=json|html|csv` — Export workspace data
- `POST /api/v1/workspaces/{wsID}/import` — Import (`multipart/form-data`: `file`, `format=auto|linktive_json|html|raindrop_csv|linkwarden_json|karakeep_json`, `skip_duplicates=true`)

### Admin · Backups · Archive Policies (Admin Only)
- `GET /api/v1/admin/usage` — Server-wide DB, asset, and backup storage usage
- `PATCH /api/v1/admin/archive-settings` — Configure archive size limits (`limit_enabled`, `max_asset_mb`, `max_bookmark_mb`)
- `POST /api/v1/admin/assets/cleanup` — Remove unreferenced orphan asset files
- `GET /api/v1/admin/backups` — Get auto-backup settings and list snapshots
- `PATCH /api/v1/admin/backups/settings` — Update auto-backup schedule, interval (hours), and retention count
- `POST /api/v1/admin/backups/run` — Run an online SQLite snapshot backup immediately
- `GET /api/v1/admin/backups/{filename}`, `DELETE /api/v1/admin/backups/{filename}` — Download or delete a backup snapshot

---

## 3. curl Examples

```bash
# Search bookmarks (tag filter + keyword)
curl -sS "http://localhost:18080/api/v1/workspaces/<WS_ID>/bookmarks?q=tags:finance+invoice" \
  -H "Authorization: Bearer lkt_YOUR_API_KEY"

# Add a bookmark by URL
curl -sS -X POST "http://localhost:18080/api/v1/workspaces/<WS_ID>/bookmarks" \
  -H "Authorization: Bearer lkt_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"example.com"}'

# Export full JSON backup
curl -sS "http://localhost:18080/api/v1/workspaces/<WS_ID>/export?format=json" \
  -H "Authorization: Bearer lkt_YOUR_API_KEY" -o backup.json
```
