export interface User {
  id: string
  email: string
  name: string
  is_admin?: boolean
}

export interface Workspace {
  id: string
  name: string
  type: 'personal' | 'organization'
  role: 'owner' | 'editor' | 'viewer'
}

export interface Collection {
  id: string
  workspace_id: string
  parent_id?: string | null
  name: string
  bookmark_count: number
}

export interface TagSummary {
  name: string
  count: number
}

export interface Bookmark {
  id: string
  workspace_id: string
  collection_id?: string | null
  url: string
  domain: string
  title: string
  description: string
  note: string
  favicon_url?: string
  is_favorite: boolean
  tags: string[]
  created_at: string
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export class DuplicateBookmarkError extends ApiError {
  existing?: Bookmark
  constructor(message: string, existing?: Bookmark) {
    super(409, message)
    this.existing = existing
  }
}

async function requestJSON<T>(
  serverUrl: string,
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const base = serverUrl.replace(/\/+$/, '')
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${apiKey}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`${base}${path}`, { ...init, headers })
  const text = await res.text()
  let parsed: Record<string, unknown> | null = null
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>
    } catch {
      parsed = null
    }
  }

  if (!res.ok) {
    const errMsg =
      (parsed && typeof parsed.error === 'string' && parsed.error) ||
      `HTTP ${res.status}`
    if (res.status === 409) {
      throw new DuplicateBookmarkError(errMsg, parsed?.existing as Bookmark | undefined)
    }
    throw new ApiError(res.status, errMsg)
  }

  return (parsed ?? {}) as T
}

export function fetchMe(serverUrl: string, apiKey: string) {
  return requestJSON<{ user: User; workspaces: Workspace[] }>(
    serverUrl,
    apiKey,
    '/api/v1/auth/me',
  )
}

export function fetchCollections(serverUrl: string, apiKey: string, workspaceId: string) {
  return requestJSON<{ items: Collection[] }>(
    serverUrl,
    apiKey,
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/collections`,
  )
}

export function fetchTags(serverUrl: string, apiKey: string, workspaceId: string) {
  return requestJSON<{ items: TagSummary[] }>(
    serverUrl,
    apiKey,
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/tags`,
  )
}

export function searchBookmarks(
  serverUrl: string,
  apiKey: string,
  workspaceId: string,
  query: string,
  limit = 8,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (query.trim()) params.set('q', query.trim())
  return requestJSON<{ items: Bookmark[]; total: number }>(
    serverUrl,
    apiKey,
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/bookmarks?${params.toString()}`,
    { signal },
  )
}

export interface CreateBookmarkInput {
  url: string
  title?: string
  note?: string
  collection_id?: string | null
  tags?: string[]
  is_favorite?: boolean
  allow_duplicate?: boolean
}

export function createBookmark(
  serverUrl: string,
  apiKey: string,
  workspaceId: string,
  input: CreateBookmarkInput,
) {
  return requestJSON<Bookmark>(
    serverUrl,
    apiKey,
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/bookmarks`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
}
