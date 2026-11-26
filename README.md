# linktive

**English** | [한국어](README.ko.md)

A lightweight, fast, self-hosted bookmark and web archiving service.

## Key Features

- **Desktop & Mobile-First UI**: Independent left/right scroll panes on desktop, single-row header & slide-out drawer on mobile, list/card view modes, customizable visible fields, drag-and-drop collection sorting, and multi-select bulk actions.
- **Fast Search & Korean Support**: Substring, Hangul initial consonant (`ㄱㄹ`), 1–2 char, and space-insensitive matching, optional full-text search across archived pages, search operators (`tags:`, `-tags:`, `site:`, `in:`, `date:`, `after:`, `before:`, `is:favorite`, `is:broken`, `is:blocked`), and **Saved Filters**.
- **Web Clipper & Archiving**: Manual or automatic content capture (**Reader View**, **Original HTML**, or **Both**, plus adding the other format later), local image/CSS caching (`/data/assets`), full-screen viewer, and **Markdown + images (`.zip`)** / **PDF** export.
- **Quick Save & Link Health**: Auto-fetches title, description, and favicon (`https://` optional), and detects **broken**, **access-blocked**, and **duplicate** URLs.
- **Collections & Sharing**: Nested folders (expand/collapse all), custom icons (built-in + Iconify) and colors, public read-only links (`/share/...`, archived content stays private), and user/workspace shares with archive visibility controls.
- **Browser Extension**: Available on the Chrome Web Store with one-click tab saving and `lk` omnibox instant search.
- **Import / Export · Stats · Auto Backups**: Import/export via JSON, HTML, Raindrop CSV, Linkwarden, or Karakeep; workspace & server usage dashboards; configurable archive size safeguards (default `10MB / 30MB`); automatic SQLite backups (`/data/backups`).
- **Security · Languages · REST API**: English (default) & Korean UI, TOTP 2FA, Admin Console (signup/invite controls, user management, orphan asset cleanup, backups), and Bearer API keys.

---

## Quick Start (Docker)

### 1. Create `docker-compose.yml`

```yaml
services:
  linktive:
    image: ghcr.io/daytivehq/linktive:latest
    container_name: linktive
    restart: unless-stopped
    ports:
      - "18080:8080"
    volumes:
      - ./data:/data
```

### 2. Start the server

```bash
docker compose up -d
```

Open `http://localhost:18080` in your browser.  
**The first registered account automatically becomes the system administrator.**

> To build from source, clone the repository and run `docker compose up --build -d`.

---

## Quick Tips

- **`/` shortcut**: Jump straight to the search bar from anywhere.
- **Context menu**: Right-click any bookmark, collection, filter, or tag for quick actions.
- **Open archive directly**: Click a bookmark's **`Archived`** badge to open the full-screen reader view immediately.
- **Account menu (top-right)**: Switch workspaces (when shared workspaces exist), or access **Settings** (including display language), **Extensions**, **Admin Console**, **Sign out**, and the **GitHub version link**.
- **Signup & invites**: Disable open registration and issue one-time invite links in **Admin Console**.
- **REST API**: Generate a token under **Settings → API Keys**, and read [API.md](API.md) or the in-app **REST API Manual** (`/api-docs`).

---

## Browser Extension

Works on Chromium-based browsers such as Chrome and Edge.

- **Chrome Web Store**: [Install linktive](https://chromewebstore.google.com/detail/linktive/opalenmkjhflejpemlkbliiadchgjhje)
- **Setup**: Enter your linktive **Server URL** and **API Key** (**Settings → API Keys**) in the extension options.
- **Quick save**: Click the toolbar icon or press `Alt+Shift+L` (macOS: `Cmd+Shift+L`).
- **Omnibox instant search**: Type `lk` in the address bar, press `Space`/`Tab`, and enter a query (`Enter`: current tab, `Alt+Enter` / macOS `Option+Enter`: new tab).

<details>
<summary>Install from source (Developer mode)</summary>

1. Build: `cd extension && npm install && npm run build`
2. Open `chrome://extensions` (or `edge://extensions`) and enable **Developer mode**
3. Click **Load unpacked** and select the `extension/dist` directory

</details>

---

## Backups & Storage

- **Persistent volume (`./data`)**: Stores the SQLite database, `/data/assets` (archived images & CSS), and `/data/backups` (automatic snapshots).
- **Automatic backups**: Configure interval, retention count, or trigger/download manual backups under **Admin Console → Automatic Database Backups**.
- **Storage & exports**: Monitor space usage, clean up orphan assets, and export JSON/HTML/CSV archives from **Settings** and **Admin Console**.
