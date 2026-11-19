package store

import (
	"context"
	"errors"
	"time"

	"github.com/linktive/linktive/internal/domain"
)

var (
	ErrNotFound             = errors.New("not found")
	ErrAlreadyExists        = errors.New("already exists")
	ErrDuplicateURL         = errors.New("duplicate bookmark url")
	ErrInvalidParent        = errors.New("invalid parent collection")
	ErrPermissionDenied     = errors.New("permission denied")
	ErrRegistrationDisabled = errors.New("registration is disabled")
	ErrInvalidInvite        = errors.New("invalid or expired invite token")
)

// DuplicateURLError provides the existing bookmark when a duplicate URL is detected.
type DuplicateURLError struct {
	Existing domain.Bookmark
}

func (e *DuplicateURLError) Error() string {
	return ErrDuplicateURL.Error()
}

func (e *DuplicateURLError) Unwrap() error {
	return ErrDuplicateURL
}

// SearchQuery represents parsed search terms and filter operators.
type SearchQuery struct {
	WorkspaceID  string
	CollectionID *string
	Raw          string
	Terms        []string
	IncludeTags  []string
	ExcludeTags  []string
	Domains      []string
	Collection   string
	DateExact    string
	DateAfter    string
	DateBefore   string
	OnlyFavorite *bool
	LinkStatus   *domain.LinkStatus
	Sort         string // newest, oldest, title
	Limit        int
	Offset       int
}

// SearchResult wraps matched bookmarks with total hit count.
type SearchResult struct {
	Items []domain.Bookmark `json:"items"`
	Total int               `json:"total"`
}

// CreateBookmarkInput contains fields required to store a bookmark.
type CreateBookmarkInput struct {
	WorkspaceID    string
	CollectionID   *string
	CreatedBy      string
	URL            string
	NormalizedURL  string
	Domain         string
	Title          string
	Description    string
	Note           string
	FaviconURL     string
	ThumbnailURL   string
	IsFavorite     bool
	Tags           []string
	AllowDuplicate bool
}

// UpdateBookmarkInput contains mutable fields for a bookmark.
type UpdateBookmarkInput struct {
	WorkspaceID       string
	BookmarkID        string
	TargetWorkspaceID *string
	CollectionID      *string
	ClearCollection   bool
	URL               *string
	NormalizedURL     *string
	Domain            *string
	Title             *string
	Description       *string
	Note              *string
	FaviconURL        *string
	ThumbnailURL      *string
	IsFavorite        *bool
	Tags              []string
	ReplaceTags       bool
}

// BulkBookmarkInput defines a batch operation on bookmarks within a workspace.
type BulkBookmarkInput struct {
	WorkspaceID  string
	BookmarkIDs  []string
	Action       string // favorite, unfavorite, move, delete, tags_add, tags_set, tags_remove
	CollectionID *string
	Tags         []string
}

// CreateCollectionShareInput defines sharing a collection with a user or workspace.
type CreateCollectionShareInput struct {
	WorkspaceID       string
	CollectionID      string
	TargetType        string // user, workspace
	TargetEmail       string
	TargetWorkspaceID string
	Role              domain.MemberRole
	CreatedBy         string
}

// CreateCollectionInput contains fields to create a collection.
type CreateCollectionInput struct {
	WorkspaceID string
	ParentID    *string
	Name        string
	Description string
	Icon        string
	Color       string
}

// UpdateCollectionInput contains mutable fields for a collection.
type UpdateCollectionInput struct {
	WorkspaceID string
	ID          string
	ParentID    *string
	SetParent   bool
	Name        *string
	Description *string
	Icon        *string
	Color       *string
}

// Store defines persistence operations decoupled from SQLite so PostgreSQL can be added later.
type Store interface {
	Ping(ctx context.Context) error
	Close() error

	// Auth & Users
	GetAuthConfig(ctx context.Context, inviteToken string) (domain.AuthConfig, error)
	RegisterUser(ctx context.Context, email, name, passwordHash, inviteToken string) (domain.User, domain.Workspace, error)
	CreateUserWithPersonalWorkspace(ctx context.Context, email, name, passwordHash string) (domain.User, domain.Workspace, error)
	GetUserByEmail(ctx context.Context, email string) (domain.User, error)
	GetUserByID(ctx context.Context, id string) (domain.User, error)
	UpdateUserProfile(ctx context.Context, userID, email, name string) (domain.User, error)
	UpdateUserPassword(ctx context.Context, userID, passwordHash string) error
	SetUserTOTPSecret(ctx context.Context, userID, secret string) error
	EnableUserTOTP(ctx context.Context, userID string) (domain.User, error)
	DisableUserTOTP(ctx context.Context, userID string) (domain.User, error)
	UpdateUserSettings(ctx context.Context, userID, settingsJSON string) (domain.User, error)
	CreateSession(ctx context.Context, userID, tokenHash string, expiresAt time.Time) (domain.Session, error)
	GetUserBySessionHash(ctx context.Context, tokenHash string) (domain.User, error)
	DeleteSessionByHash(ctx context.Context, tokenHash string) error
	CreateAPIKey(ctx context.Context, userID, name, keyHash string) (domain.APIKey, error)
	ListAPIKeys(ctx context.Context, userID string) ([]domain.APIKey, error)
	DeleteAPIKey(ctx context.Context, userID, keyID string) error
	GetUserByAPIKeyHash(ctx context.Context, keyHash string) (domain.User, error)

	// Admin
	SetRegistrationEnabled(ctx context.Context, enabled bool) error
	ListUsers(ctx context.Context) ([]domain.User, error)
	UpdateUserAdmin(ctx context.Context, userID string, isAdmin bool) (domain.User, error)
	DeleteUser(ctx context.Context, userID string) error
	CreateUserInvite(ctx context.Context, createdBy string, expiresAt time.Time) (domain.UserInvite, error)
	ListUserInvites(ctx context.Context) ([]domain.UserInvite, error)
	DeleteUserInvite(ctx context.Context, inviteID string) error

	// Workspaces & Members
	ListWorkspacesForUser(ctx context.Context, userID string) ([]domain.Workspace, error)
	GetWorkspaceRole(ctx context.Context, workspaceID, userID string) (domain.MemberRole, error)
	CreateSharedWorkspace(ctx context.Context, ownerID, name string) (domain.Workspace, error)
	UpdateWorkspace(ctx context.Context, workspaceID, name string) (domain.Workspace, error)
	DeleteWorkspace(ctx context.Context, workspaceID string) error
	ListWorkspaceMembers(ctx context.Context, workspaceID string) ([]domain.WorkspaceMember, error)
	AddWorkspaceMemberByEmail(ctx context.Context, workspaceID, email string, role domain.MemberRole) (domain.WorkspaceMember, error)
	RemoveWorkspaceMember(ctx context.Context, workspaceID, userID string) error

	// Collections & Sharing
	ListCollections(ctx context.Context, workspaceID string) ([]domain.Collection, error)
	CreateCollection(ctx context.Context, input CreateCollectionInput) (domain.Collection, error)
	UpdateCollection(ctx context.Context, input UpdateCollectionInput) (domain.Collection, error)
	DeleteCollection(ctx context.Context, workspaceID, collectionID string) error
	SetCollectionPublic(ctx context.Context, workspaceID, collectionID string, enabled bool) (domain.Collection, error)
	GetPublicCollectionBySlug(ctx context.Context, slug string) (domain.PublicCollectionView, error)
	ListCollectionShares(ctx context.Context, workspaceID, collectionID string) ([]domain.CollectionShare, error)
	UpsertCollectionShare(ctx context.Context, input CreateCollectionShareInput) (domain.CollectionShare, error)
	DeleteCollectionShare(ctx context.Context, workspaceID, collectionID, shareID string) error
	ListSharedCollectionsForUser(ctx context.Context, userID string) ([]domain.SharedCollectionView, error)
	GetSharedCollectionAccess(ctx context.Context, userID, collectionID string) (domain.SharedCollectionView, error)

	// Bookmarks & Tags
	CreateBookmark(ctx context.Context, input CreateBookmarkInput) (domain.Bookmark, error)
	GetBookmark(ctx context.Context, workspaceID, bookmarkID string) (domain.Bookmark, error)
	UpdateBookmark(ctx context.Context, input UpdateBookmarkInput) (domain.Bookmark, error)
	DeleteBookmark(ctx context.Context, workspaceID, bookmarkID string) error
	BulkBookmarks(ctx context.Context, input BulkBookmarkInput) (int, error)
	ListTags(ctx context.Context, workspaceID string) ([]domain.TagSummary, error)
	RenameTag(ctx context.Context, workspaceID, oldName, newName string) error
	DeleteTag(ctx context.Context, workspaceID, tagName string) error
	GetWorkspaceStats(ctx context.Context, workspaceID string) (domain.WorkspaceStats, error)
	SearchBookmarks(ctx context.Context, query SearchQuery) (SearchResult, error)
}

// SearchProvider abstracts bookmark full-text and Korean substring search.
type SearchProvider interface {
	SearchBookmarks(ctx context.Context, query SearchQuery) (SearchResult, error)
}
