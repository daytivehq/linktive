package domain

import "time"

// WorkspaceType distinguishes a user's personal space from a shared group space.
type WorkspaceType string

const (
	WorkspacePersonal WorkspaceType = "personal"
	WorkspaceShared   WorkspaceType = "shared"
)

// MemberRole defines permissions within a workspace.
type MemberRole string

const (
	RoleOwner  MemberRole = "owner"
	RoleEditor MemberRole = "editor"
	RoleViewer MemberRole = "viewer"
)

// RoleLevel returns a comparable permission rank for authorization checks.
func (r MemberRole) RoleLevel() int {
	switch r {
	case RoleOwner:
		return 3
	case RoleEditor:
		return 2
	case RoleViewer:
		return 1
	default:
		return 0
	}
}

// LinkStatus tracks the reachability state of a bookmark URL.
type LinkStatus string

const (
	LinkStatusUnknown LinkStatus = "unknown"
	LinkStatusOK      LinkStatus = "ok"
	LinkStatusBroken  LinkStatus = "broken"
	LinkStatusBlocked LinkStatus = "blocked"
)

// User represents an account in linktive.
type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	Name         string    `json:"name"`
	PasswordHash string    `json:"-"`
	SettingsJSON string    `json:"settings_json"`
	IsAdmin      bool      `json:"is_admin"`
	TOTPEnabled  bool      `json:"totp_enabled"`
	TOTPSecret   string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// AuthConfig exposes public registration and invite status.
type AuthConfig struct {
	RegistrationEnabled bool `json:"registration_enabled"`
	HasUsers            bool `json:"has_users"`
	InviteValid         bool `json:"invite_valid,omitempty"`
}

// UserInvite represents an admin-issued single-use registration invite link.
type UserInvite struct {
	ID          string     `json:"id"`
	Token       string     `json:"token"`
	CreatedBy   string     `json:"created_by"`
	UsedBy      *string    `json:"used_by,omitempty"`
	UsedByEmail string     `json:"used_by_email,omitempty"`
	ExpiresAt   time.Time  `json:"expires_at"`
	UsedAt      *time.Time `json:"used_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

// Session represents an authenticated browser session.
type Session struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	TokenHash string    `json:"-"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

// APIKey represents a personal API token for external integrations and browser extensions.
type APIKey struct {
	ID         string     `json:"id"`
	UserID     string     `json:"user_id"`
	Name       string     `json:"name"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

// Workspace scopes bookmarks, collections, and tags for SaaS-ready isolation and group sharing.
type Workspace struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	Type      WorkspaceType `json:"type"`
	OwnerID   string        `json:"owner_id"`
	Role      MemberRole    `json:"role,omitempty"`
	CreatedAt time.Time     `json:"created_at"`
	UpdatedAt time.Time     `json:"updated_at"`
}

// WorkspaceMember represents a user's membership and role inside a workspace.
type WorkspaceMember struct {
	WorkspaceID string     `json:"workspace_id"`
	UserID      string     `json:"user_id"`
	Email       string     `json:"email"`
	Name        string     `json:"name"`
	Role        MemberRole `json:"role"`
	CreatedAt   time.Time  `json:"created_at"`
}

// Collection represents a hierarchical bookmark folder with icon, color, and description.
type Collection struct {
	ID            string    `json:"id"`
	WorkspaceID   string    `json:"workspace_id"`
	ParentID      *string   `json:"parent_id,omitempty"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	Icon          string    `json:"icon"`
	Color         string    `json:"color"`
	IsPublic      bool      `json:"is_public"`
	PublicSlug    *string   `json:"public_slug,omitempty"`
	BookmarkCount int       `json:"bookmark_count"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// CollectionShare represents sharing a collection with a user or another workspace.
type CollectionShare struct {
	ID           string     `json:"id"`
	CollectionID string     `json:"collection_id"`
	TargetType   string     `json:"target_type"` // user, workspace
	TargetID     string     `json:"target_id"`
	TargetLabel  string     `json:"target_label"`
	Role         MemberRole `json:"role"` // viewer, editor
	CreatedAt    time.Time  `json:"created_at"`
}

// SharedCollectionView represents a collection shared with the current user.
type SharedCollectionView struct {
	Collection
	Role                MemberRole `json:"role"`
	OwnerName           string     `json:"owner_name"`
	SourceWorkspaceName string     `json:"source_workspace_name"`
}

// PublicBookmark is a privacy-filtered bookmark projection for public collection links.
type PublicBookmark struct {
	ID         string    `json:"id"`
	URL        string    `json:"url"`
	Domain     string    `json:"domain"`
	Title      string    `json:"title"`
	Description string   `json:"description"`
	FaviconURL string    `json:"favicon_url"`
	Tags       []string  `json:"tags"`
	CreatedAt  time.Time `json:"created_at"`
}

// PublicCollectionView is returned for unauthenticated public collection links.
type PublicCollectionView struct {
	Collection Collection       `json:"collection"`
	Bookmarks  []PublicBookmark `json:"bookmarks"`
}

// Bookmark represents a saved URL with extracted metadata, user note, and tags.
type Bookmark struct {
	ID            string     `json:"id"`
	WorkspaceID   string     `json:"workspace_id"`
	CollectionID  *string    `json:"collection_id,omitempty"`
	CreatedBy     string     `json:"created_by"`
	URL           string     `json:"url"`
	NormalizedURL string     `json:"normalized_url"`
	Domain        string     `json:"domain"`
	Title         string     `json:"title"`
	Description   string     `json:"description"`
	Note          string     `json:"note"`
	FaviconURL    string     `json:"favicon_url"`
	ThumbnailURL  string     `json:"thumbnail_url"`
	IsFavorite    bool       `json:"is_favorite"`
	LinkStatus    LinkStatus `json:"link_status"`
	LastCheckedAt *time.Time `json:"last_checked_at,omitempty"`
	ArchiveStatus string     `json:"archive_status,omitempty"`
	ArchiveBytes  int64      `json:"archive_bytes,omitempty"`
	Tags          []string   `json:"tags"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// TagSummary represents a tag and its bookmark usage count within a workspace.
type TagSummary struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// WorkspaceStats holds sidebar bookmark counters for a workspace.
type WorkspaceStats struct {
	AllCount         int `json:"all_count"`
	FavoriteCount    int `json:"favorite_count"`
	UncollectedCount int `json:"uncollected_count"`
	BrokenCount      int `json:"broken_count"`
	BlockedCount     int `json:"blocked_count"`
	DuplicateCount   int `json:"duplicate_count"`
}

// DuplicateBookmarkGroup represents multiple bookmarks sharing the same normalized URL.
type DuplicateBookmarkGroup struct {
	NormalizedURL string     `json:"normalized_url"`
	Count         int        `json:"count"`
	Bookmarks     []Bookmark `json:"bookmarks"`
}

// DuplicateLinksResult summarizes duplicate URLs detected within a workspace.
type DuplicateLinksResult struct {
	Groups      []DuplicateBookmarkGroup `json:"groups"`
	TotalGroups int                      `json:"total_groups"`
	TotalExcess int                      `json:"total_excess"`
}

// SavedFilter stores a reusable search/filter expression in the sidebar.
type SavedFilter struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	Name        string    `json:"name"`
	Query       string    `json:"query"`
	Icon        string    `json:"icon"`
	Color       string    `json:"color"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// AutoBackupSettings configures scheduled SQLite snapshots on the server.
type AutoBackupSettings struct {
	Enabled       bool       `json:"enabled"`
	IntervalHours int        `json:"interval_hours"`
	KeepCount     int        `json:"keep_count"`
	LastRunAt     *time.Time `json:"last_run_at,omitempty"`
}

// BackupFileInfo describes a single stored database backup artifact.
type BackupFileInfo struct {
	Filename  string    `json:"filename"`
	SizeBytes int64     `json:"size_bytes"`
	CreatedAt time.Time `json:"created_at"`
}

// LinkCheckSummary reports results of a workspace-wide link health check.
type LinkCheckSummary struct {
	Checked      int        `json:"checked"`
	OKCount      int        `json:"ok_count"`
	BrokenCount  int        `json:"broken_count"`
	BlockedCount int        `json:"blocked_count"`
	Items        []Bookmark `json:"items"`
}

// BookmarkArchive stores a locally archived copy (readable view and/or original HTML layout) of a bookmarked web page.
type BookmarkArchive struct {
	BookmarkID   string    `json:"bookmark_id"`
	WorkspaceID  string    `json:"workspace_id"`
	CreatedBy    string    `json:"created_by"`
	Source       string    `json:"source"`
	ArchiveMode  string    `json:"archive_mode"` // readable, html, both
	Status       string    `json:"status"`       // pending, ready, failed
	ErrorMessage string    `json:"error_message,omitempty"`
	Title        string    `json:"title"`
	Byline       string    `json:"byline,omitempty"`
	SiteName     string    `json:"site_name,omitempty"`
	ContentHTML  string    `json:"content_html"`
	SnapshotHTML string    `json:"snapshot_html"`
	ContentText  string    `json:"content_text"`
	AssetCount   int       `json:"asset_count"`
	TotalBytes   int64     `json:"total_bytes"`
	ArchivedAt   time.Time `json:"archived_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// ArchivePolicy defines server-wide safety limits for archived pages and image assets.
type ArchivePolicy struct {
	LimitEnabled  bool `json:"limit_enabled"`
	MaxAssetMB    int  `json:"max_asset_mb"`
	MaxBookmarkMB int  `json:"max_bookmark_mb"`
}

// WorkspaceUsage summarizes counts and storage usage inside a workspace.
type WorkspaceUsage struct {
	WorkspaceID      string `json:"workspace_id"`
	BookmarkCount    int    `json:"bookmark_count"`
	TagCount         int    `json:"tag_count"`
	CollectionCount  int    `json:"collection_count"`
	ArchivedCount    int    `json:"archived_count"`
	ArchiveAssetCount int   `json:"archive_asset_count"`
	ArchiveBytes     int64  `json:"archive_bytes"`
}

// AdminUsage summarizes server-wide counts and storage usage for administrators.
type AdminUsage struct {
	TotalUsers        int           `json:"total_users"`
	TotalWorkspaces   int           `json:"total_workspaces"`
	TotalBookmarks    int           `json:"total_bookmarks"`
	TotalTags         int           `json:"total_tags"`
	TotalArchived     int           `json:"total_archived"`
	DBSizeBytes       int64         `json:"db_size_bytes"`
	AssetsSizeBytes   int64         `json:"assets_size_bytes"`
	AssetsFileCount   int           `json:"assets_file_count"`
	BackupsSizeBytes  int64         `json:"backups_size_bytes"`
	BackupsFileCount  int           `json:"backups_file_count"`
	ArchivePolicy     ArchivePolicy `json:"archive_policy"`
}
