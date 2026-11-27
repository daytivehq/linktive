# linktive

**English** | [한국어](README.ko.md)

A lightweight, fast, self-hosted bookmark and web archiving service.

## Key Features

- **Desktop & Mobile-First UI**: Independent left/right scroll panes on desktop, single-row header & slide-out drawer on mobile, list/card view modes, collection labels, customizable visible fields, drag-and-drop collection sorting, and multi-select bulk actions.
- **Fast Search & Korean Support**: Substring, Hangul initial consonant (`ㄱㄹ`), 1–2 char, and space-insensitive matching, optional full-text search across archived pages, search operators (`tags:`, `-tags:`, `site:`, `in:`, `date:`, `after:`, `before:`, `is:favorite`, `is:broken`, `is:blocked`, `is:archived`, `-is:archived`), and **Saved Filters**.
- **Web Clipper & Archiving**: Manual or automatic content capture (**Reader View**, **Original HTML**, or **Both**, plus adding the other format later), local image/CSS caching (`/data/assets`), full-screen viewer, and **Markdown + images (`.zip`)** / **PDF** export.
- **Quick Save & Link Health**: Auto-fetches title, description, and favicon (`https://` optional), and detects **broken**, **access-blocked**, and **duplicate** URLs.
- **Collections & Sharing**: Nested folders (expand/collapse all), custom icons (built-in + Iconify) and colors, public read-only links (`/share/...`, archived content stays private), and user/workspace shares with archive visibility controls.
- **Browser Extension**: Available on the Chrome Web Store with one-click tab saving and `lk` omnibox instant search.
- **Import / Export · Stats · Auto Backups**: Export as JSON, HTML, Raindrop CSV, or Excel-oriented CSV; import from Linkwarden, Karakeep, and other bookmarks; workspace & server usage dashboards; configurable archive size safeguards (default `10MB / 30MB`); automatic SQLite backups (`/data/backups`).
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

**The first registered account automatically becomes the system administrator.**

- If you create the administrator account before allowing public access, you can leave `LINKTIVE_SETUP_TOKEN` unset.
- If you allow public access before the first registration, including from the moment the server starts, someone else could register first and gain administrator access. Set the `LINKTIVE_SETUP_TOKEN` container environment variable to a long random value before allowing public access.

```bash
docker compose up -d
```

Open `http://localhost:18080` in your browser.

> To build from source, clone the repository and run `docker compose up --build -d`.

---

## Quick Tips

- **Keyboard shortcuts** — `/` focuses search, `Q` opens Add Site, and `Delete` asks you to confirm deletion of the open, keyboard-focused, or selected bookmark(s). Shortcuts are disabled while typing.
- **Archive search** — `is:archived` finds bookmarks with a completed archive you can open. `-is:archived` finds the remaining bookmarks.
- **Move between workspaces** — Open a bookmark and choose Edit to move it to another workspace you can edit. A private archive from another member can prevent deletion or a workspace move.
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
- **Related links** — Open the Chrome Web Store listing or GitHub from extension settings.
- **Quick save**: Click the toolbar icon or press `Alt+Shift+L` (macOS: `Cmd+Shift+L`).
- **Omnibox instant search**: Type `lk` in the address bar, press `Space`/`Tab`, and enter a query (`Enter`: current tab, `Alt+Enter` / macOS `Option+Enter`: new tab).

<details>
<summary>Install from source (Developer mode)</summary>

1. Build: `cd extension && npm install && npm run build`
2. Open `chrome://extensions` (or `edge://extensions`) and enable **Developer mode**
3. Click **Load unpacked** and select the `extension/dist` directory

</details>

---

## Fetching home network links

Private URLs can be saved as bookmarks. Set `LINKTIVE_ALLOW_PRIVATE_NETWORKS=true` in the Compose `.env` file if the server should fetch metadata, archives, assets, and link status from your home network. The default is `false`. Enabling this also allows pages requested by shared users to reach the server’s private network.

## Reverse proxies

If a reverse proxy on the host is the only entry point, set `LINKTIVE_BIND_IP=127.0.0.1` in the source Compose setup. If the proxy appends the client address to `X-Forwarded-For`, set `LINKTIVE_TRUSTED_PROXY_IPS` to the proxy addresses as seen by the app, separated by commas. Image-based installs can also pass the trusted addresses and setup token through the container environment.

## Backups & Storage

- **Persistent volume (`./data`)**: Stores the SQLite database, `/data/assets` (archived images & CSS), and `/data/backups` (automatic snapshots).
- **Automatic backups** — In **Admin Console → Automatic Backups**, select **Database only** (`.db`) or **Full backup** (`.zip` with the database and archived files). The same scope applies to scheduled and manual backups. Retention counts both types together.
- **Storage & exports**: Monitor space usage, clean up orphan assets, and export bookmarks from **Settings**, and manage SQLite snapshots in **Admin Console**.

For a restore check, extract a full backup into a new data directory, then start a separate linktive container with that directory. The ZIP has `linktive.db` and `assets/` at its root. If you use a custom DB path, place the extracted DB at that path. Check login, a saved page, and its images before restoring production. Keep a separate copy of important backups to protect against disk failure.
