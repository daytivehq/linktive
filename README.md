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
- **Import / Export · Stats · Auto Backups**: Export as JSON, HTML, Raindrop CSV, or Excel-oriented CSV. Import from Linkwarden, Karakeep, and other bookmarks. Monitor workspace and server usage, configure archive size limits (default `10MB / 30MB`), and schedule database-only or full backups (`/data/backups`).
- **Security · Languages · REST API**: English and Korean account preferences, TOTP two-factor authentication, self-service account deletion, an Admin Console for registration, invites, user management, orphan asset cleanup, and backups, and Bearer API keys.

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
    environment:
      LINKTIVE_SETUP_TOKEN: "${LINKTIVE_SETUP_TOKEN:-}"
    volumes:
      - ./data:/data
```

### 2. Start the server

**The first registered account automatically becomes the system administrator.**

- If you create the administrator account before allowing public access, you can leave `LINKTIVE_SETUP_TOKEN` unset.
- If you allow public access before the first registration, including from the moment the server starts, someone else could register first and gain administrator access. Before starting the server, create a `.env` file next to `docker-compose.yml` and add `LINKTIVE_SETUP_TOKEN=<your long random token>`. You can generate a token with `openssl rand -hex 32`.

Compose reads `.env` for variable substitution. The `environment` entry in the example above passes the token into the container and uses an empty value when the token is omitted. The repository's `docker-compose.yml` already includes this entry. To make Compose fail when the token is unset or empty, use `"${LINKTIVE_SETUP_TOKEN:?Set the setup token in .env}"` as the value.

```bash
docker compose up -d
```

Open `http://localhost:18080` in your browser. If you set a setup token, enter it when registering the first account. Use the eye icon to check the setup token or password you entered. The language you choose during signup stays with your account.

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
- **Account security**: In **Settings → Account & API**, you can change your password, manage two-factor authentication, or delete your account. Deletion requires your current password and your two-factor authentication code if enabled. It permanently removes the account and its owned workspaces. The last administrator must assign another administrator first.
- **REST API**: Generate a token under **Settings → Account & API → API Keys & Automation**. See [API.md](API.md) or the in-app **REST API Manual** (`/api-docs`).

---

## Browser Extension

Works on Chromium-based browsers such as Chrome and Edge.
The extension displays Korean when the browser's display language is Korean and English otherwise.

- **Chrome Web Store**: [Install linktive](https://chromewebstore.google.com/detail/linktive/opalenmkjhflejpemlkbliiadchgjhje)
- **Publishing**: [Chrome Web Store deployment guide (Korean)](docs/chrome-web-store-guide.md)
- **Setup**: Create an API key in **Settings → Account & API** on the web app. Enter the server URL and API key in the extension options, where you can also set a default workspace for the extension.
- **Related links** — Open the Chrome Web Store listing or GitHub from extension settings.
- **Quick save**: Click the toolbar icon or press `Alt+Shift+L` (macOS: `Cmd+Shift+L`).
- **View in linktive**: Open the bookmark you just saved in its workspace, even when the web app uses a different default workspace. Requires version 0.5.0 or later of both the server and the extension. To get this extension version, install it from source using the steps below.
- **Omnibox instant search**: Type `lk` in the address bar, press `Space`/`Tab`, and enter a query (`Enter`: current tab, `Alt+Enter` / macOS `Option+Enter`: new tab).

<details>
<summary>Install from source (Developer mode)</summary>

1. Build: `cd extension && npm ci && npm run build`
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
- **Storage & exports**: Check workspace usage under **Settings → Workspaces & Usage** and export bookmarks under **Import & Export**. Use **Admin Console** to clean up orphan assets and download backups.

For a restore check, extract a full backup into a new data directory, then start a separate linktive container with that directory. The ZIP has `linktive.db` and `assets/` at its root. If you use a custom DB path, place the extracted DB at that path. Check login, a saved page, and its images before restoring production. Keep a separate copy of important backups to protect against disk failure.
