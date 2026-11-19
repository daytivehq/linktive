export type ViewMode = 'list' | 'card';

export type SortOrder = 'relevance' | 'newest' | 'oldest' | 'title';

export type ClickAction = 'current_tab' | 'new_tab' | 'detail_panel';

export interface VisibleFields {
  thumbnail: boolean;
  title: boolean;
  description: boolean;
  note: boolean;
  tags: boolean;
  createdAt: boolean;
}

export interface UserSettings {
  click_action: ClickAction;
  view_mode: ViewMode;
  include_subcollections: boolean;
  visible_fields: VisibleFields;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  click_action: 'new_tab',
  view_mode: 'list',
  include_subcollections: false,
  visible_fields: {
    thumbnail: true,
    title: true,
    description: true,
    note: true,
    tags: true,
    createdAt: true,
  },
};

export interface User {
  id: string;
  email: string;
  name: string;
  settings_json: string;
  is_admin: boolean;
  totp_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthConfig {
  registration_enabled: boolean;
  has_users: boolean;
  invite_valid?: boolean;
}

export interface UserInvite {
  id: string;
  token: string;
  created_by: string;
  used_by?: string | null;
  used_by_email?: string;
  expires_at: string;
  used_at?: string | null;
  created_at: string;
}

export type WorkspaceType = 'personal' | 'shared';
export type MemberRole = 'owner' | 'editor' | 'viewer';

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  owner_id: string;
  role: MemberRole;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  email: string;
  name: string;
  role: MemberRole;
  created_at: string;
}

export interface Collection {
  id: string;
  workspace_id: string;
  parent_id?: string | null;
  name: string;
  description: string;
  icon: string;
  color: string;
  is_public: boolean;
  public_slug?: string | null;
  bookmark_count: number;
  created_at: string;
  updated_at: string;
}

export interface CollectionShare {
  id: string;
  collection_id: string;
  target_type: 'user' | 'workspace';
  target_id: string;
  target_label: string;
  role: 'viewer' | 'editor';
  created_at: string;
}

export interface SharedCollectionView extends Collection {
  role: MemberRole;
  owner_name: string;
  source_workspace_name: string;
}

export interface PublicBookmark {
  id: string;
  url: string;
  domain: string;
  title: string;
  description: string;
  favicon_url: string;
  tags: string[];
  created_at: string;
}

export interface PublicCollectionView {
  collection: Collection;
  bookmarks: PublicBookmark[];
}

export type BulkBookmarkAction =
  | 'favorite'
  | 'unfavorite'
  | 'move'
  | 'delete'
  | 'tags_add'
  | 'tags_set'
  | 'tags_remove';

export type LinkStatus = 'unknown' | 'ok' | 'broken' | 'blocked';

export interface Bookmark {
  id: string;
  workspace_id: string;
  collection_id?: string | null;
  created_by: string;
  url: string;
  normalized_url: string;
  domain: string;
  title: string;
  description: string;
  note: string;
  favicon_url: string;
  thumbnail_url: string;
  is_favorite: boolean;
  link_status: LinkStatus;
  last_checked_at?: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface TagSummary {
  name: string;
  count: number;
}

export interface WorkspaceStats {
  all_count: number;
  favorite_count: number;
  uncollected_count: number;
  broken_count: number;
  blocked_count: number;
  duplicate_count: number;
}

export interface DuplicateBookmarkGroup {
  normalized_url: string;
  count: number;
  bookmarks: Bookmark[];
}

export interface DuplicateLinksResult {
  groups: DuplicateBookmarkGroup[];
  total_groups: number;
  total_excess: number;
}

export interface SavedFilter {
  id: string;
  workspace_id: string;
  name: string;
  query: string;
  icon: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface LinkCheckSummary {
  checked: number;
  ok_count: number;
  broken_count: number;
  blocked_count: number;
  items: Bookmark[];
}

export interface AutoBackupSettings {
  enabled: boolean;
  interval_hours: number;
  keep_count: number;
  last_run_at?: string | null;
}

export interface BackupFileInfo {
  filename: string;
  size_bytes: number;
  created_at: string;
}

export interface APIKeyItem {
  id: string;
  user_id: string;
  name: string;
  last_used_at?: string | null;
  created_at: string;
}

export function parseUserSettings(raw?: string): UserSettings {
  if (!raw) return DEFAULT_USER_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return {
      click_action: parsed.click_action ?? DEFAULT_USER_SETTINGS.click_action,
      view_mode: parsed.view_mode ?? DEFAULT_USER_SETTINGS.view_mode,
      include_subcollections:
        parsed.include_subcollections ?? DEFAULT_USER_SETTINGS.include_subcollections,
      visible_fields: {
        ...DEFAULT_USER_SETTINGS.visible_fields,
        ...(parsed.visible_fields ?? {}),
      },
    };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}
