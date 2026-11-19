import type {
  APIKeyItem,
  Bookmark,
  BulkBookmarkAction,
  Collection,
  CollectionShare,
  MemberRole,
  PublicCollectionView,
  SharedCollectionView,
  SortOrder,
  TagSummary,
  User,
  UserSettings,
  Workspace,
  WorkspaceMember,
  WorkspaceStats,
} from '../types/bookmark';

export class ApiError extends Error {
  status: number;
  existing?: Bookmark;

  constructor(message: string, status: number, existing?: Bookmark) {
    super(message);
    this.status = status;
    this.existing = existing;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      typeof data.error === 'string' ? data.error : `HTTP ${res.status}`,
      res.status,
      data.existing as Bookmark | undefined,
    );
  }
  return data as T;
}

export const api = {
  health: () => request<{ status: string }>('/api/v1/health'),

  me: () => request<{ user: User; workspaces: Workspace[] }>('/api/v1/auth/me'),

  register: (payload: { email: string; name: string; password: string }) =>
    request<{ user: User; workspaces: Workspace[] }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { email: string; password: string }) =>
    request<{ user: User; workspaces: Workspace[] }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () => request<{ status: string }>('/api/v1/auth/logout', { method: 'POST' }),

  updateSettings: (settings: UserSettings) =>
    request<{ user: User }>('/api/v1/auth/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    }),

  listAPIKeys: () => request<{ items: APIKeyItem[] }>('/api/v1/api-keys'),

  createAPIKey: (name: string) =>
    request<{ api_key: APIKeyItem; token: string }>('/api/v1/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  deleteAPIKey: (id: string) =>
    request<{ status: string }>(`/api/v1/api-keys/${id}`, { method: 'DELETE' }),

  listWorkspaces: () => request<{ items: Workspace[] }>('/api/v1/workspaces'),

  createWorkspace: (name: string) =>
    request<Workspace>('/api/v1/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  updateWorkspace: (wsID: string, name: string) =>
    request<Workspace>(`/api/v1/workspaces/${wsID}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  deleteWorkspace: (wsID: string) =>
    request<{ status: string }>(`/api/v1/workspaces/${wsID}`, {
      method: 'DELETE',
    }),

  listMembers: (wsID: string) =>
    request<{ items: WorkspaceMember[] }>(`/api/v1/workspaces/${wsID}/members`),

  addMember: (wsID: string, email: string, role: MemberRole) =>
    request<WorkspaceMember>(`/api/v1/workspaces/${wsID}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }),

  removeMember: (wsID: string, userID: string) =>
    request<{ status: string }>(`/api/v1/workspaces/${wsID}/members/${userID}`, {
      method: 'DELETE',
    }),

  listCollections: (wsID: string) =>
    request<{ items: Collection[] }>(`/api/v1/workspaces/${wsID}/collections`),

  createCollection: (
    wsID: string,
    payload: {
      parent_id?: string | null;
      name: string;
      description?: string;
      icon?: string;
      color?: string;
    },
  ) =>
    request<Collection>(`/api/v1/workspaces/${wsID}/collections`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateCollection: (
    wsID: string,
    colID: string,
    payload: {
      parent_id?: string | null;
      name?: string;
      description?: string;
      icon?: string;
      color?: string;
    },
  ) =>
    request<Collection>(`/api/v1/workspaces/${wsID}/collections/${colID}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteCollection: (wsID: string, colID: string) =>
    request<{ status: string }>(`/api/v1/workspaces/${wsID}/collections/${colID}`, {
      method: 'DELETE',
    }),

  listBookmarks: (
    wsID: string,
    params: {
      q?: string;
      collection_id?: string;
      favorite?: boolean;
      tag?: string;
      sort?: SortOrder;
      limit?: number;
      offset?: number;
    },
  ) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.collection_id) qs.set('collection_id', params.collection_id);
    if (params.favorite) qs.set('favorite', 'true');
    if (params.tag) qs.set('tag', params.tag);
    if (params.sort) qs.set('sort', params.sort);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    const query = qs.toString();
    return request<{ items: Bookmark[]; total: number }>(
      `/api/v1/workspaces/${wsID}/bookmarks${query ? `?${query}` : ''}`,
    );
  },

  createBookmark: (
    wsID: string,
    payload: {
      url: string;
      title?: string;
      description?: string;
      note?: string;
      collection_id?: string | null;
      tags?: string[];
      is_favorite?: boolean;
      allow_duplicate?: boolean;
    },
  ) =>
    request<Bookmark>(`/api/v1/workspaces/${wsID}/bookmarks`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateBookmark: (
    wsID: string,
    bmID: string,
    payload: {
      target_workspace_id?: string;
      collection_id?: string | null;
      url?: string;
      title?: string;
      description?: string;
      note?: string;
      tags?: string[];
      is_favorite?: boolean;
    },
  ) =>
    request<Bookmark>(`/api/v1/workspaces/${wsID}/bookmarks/${bmID}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteBookmark: (wsID: string, bmID: string) =>
    request<{ status: string }>(`/api/v1/workspaces/${wsID}/bookmarks/${bmID}`, {
      method: 'DELETE',
    }),

  bulkBookmarks: (
    wsID: string,
    payload: {
      bookmark_ids: string[];
      action: BulkBookmarkAction;
      collection_id?: string | null;
      tags?: string[];
    },
  ) =>
    request<{ affected: number }>(`/api/v1/workspaces/${wsID}/bookmarks/bulk`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listTags: (wsID: string) =>
    request<{ items: TagSummary[] }>(`/api/v1/workspaces/${wsID}/tags`),

  renameTag: (wsID: string, oldName: string, newName: string) =>
    request<{ status: string }>(`/api/v1/workspaces/${wsID}/tags/${encodeURIComponent(oldName)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: newName }),
    }),

  deleteTag: (wsID: string, tagName: string) =>
    request<{ status: string }>(`/api/v1/workspaces/${wsID}/tags/${encodeURIComponent(tagName)}`, {
      method: 'DELETE',
    }),

  getStats: (wsID: string) =>
    request<WorkspaceStats>(`/api/v1/workspaces/${wsID}/stats`),

  setCollectionPublic: (wsID: string, colID: string, enabled: boolean) =>
    request<Collection>(`/api/v1/workspaces/${wsID}/collections/${colID}/public`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),

  getPublicCollection: (slug: string) =>
    request<PublicCollectionView>(`/api/v1/public/collections/${encodeURIComponent(slug)}`),

  listCollectionShares: (wsID: string, colID: string) =>
    request<{ items: CollectionShare[] }>(`/api/v1/workspaces/${wsID}/collections/${colID}/shares`),

  addCollectionShare: (
    wsID: string,
    colID: string,
    payload: {
      target_type: 'user' | 'workspace';
      target_email?: string;
      target_workspace_id?: string;
      role: 'viewer' | 'editor';
    },
  ) =>
    request<CollectionShare>(`/api/v1/workspaces/${wsID}/collections/${colID}/shares`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  removeCollectionShare: (wsID: string, colID: string, shareID: string) =>
    request<{ status: string }>(
      `/api/v1/workspaces/${wsID}/collections/${colID}/shares/${shareID}`,
      { method: 'DELETE' },
    ),

  listSharedCollections: () =>
    request<{ items: SharedCollectionView[] }>('/api/v1/shared-collections'),

  listSharedCollectionBookmarks: (colID: string, params?: { q?: string; sort?: SortOrder }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.sort) qs.set('sort', params.sort);
    const query = qs.toString();
    return request<{ collection: SharedCollectionView; items: Bookmark[]; total: number }>(
      `/api/v1/shared-collections/${colID}/bookmarks${query ? `?${query}` : ''}`,
    );
  },

  createSharedCollectionBookmark: (
    colID: string,
    payload: { url: string; allow_duplicate?: boolean },
  ) =>
    request<Bookmark>(`/api/v1/shared-collections/${colID}/bookmarks`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSharedCollectionBookmark: (
    colID: string,
    bmID: string,
    payload: {
      url?: string;
      title?: string;
      description?: string;
      note?: string;
      tags?: string[];
      is_favorite?: boolean;
    },
  ) =>
    request<Bookmark>(`/api/v1/shared-collections/${colID}/bookmarks/${bmID}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteSharedCollectionBookmark: (colID: string, bmID: string) =>
    request<{ status: string }>(`/api/v1/shared-collections/${colID}/bookmarks/${bmID}`, {
      method: 'DELETE',
    }),

  exportWorkspaceUrl: (wsID: string, format: 'json' | 'html' | 'csv') =>
    `/api/v1/workspaces/${wsID}/export?format=${format}`,

  importWorkspace: async (
    wsID: string,
    file: File,
    format: string,
    skipDuplicates: boolean,
  ): Promise<{
    format: string;
    imported: number;
    skipped: number;
    failed: number;
    created_collections: number;
  }> => {
    const form = new FormData();
    form.append('file', file);
    form.append('format', format);
    form.append('skip_duplicates', String(skipDuplicates));

    const res = await fetch(`/api/v1/workspaces/${wsID}/import`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(
        typeof data.error === 'string' ? data.error : `HTTP ${res.status}`,
        res.status,
      );
    }
    return data;
  },
};
