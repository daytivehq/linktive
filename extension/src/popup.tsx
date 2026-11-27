import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Settings,
  Star,
  X,
} from 'lucide-react'
import './index.css'
import {
  ApiError,
  Collection,
  DuplicateBookmarkError,
  Workspace,
  Bookmark as BookmarkItem,
  createBookmark,
  fetchCollections,
  fetchMe,
  fetchTags,
  requestErrorMessage,
} from './lib/api'
import { localizePage, t } from './lib/i18n'
import { getSettings } from './lib/storage'

interface FlatCollection {
  id: string
  label: string
}

function flattenCollections(items: Collection[]): FlatCollection[] {
  const byParent = new Map<string, Collection[]>()
  for (const item of items) {
    const key = item.parent_id ?? ''
    const list = byParent.get(key) ?? []
    list.push(item)
    byParent.set(key, list)
  }
  const result: FlatCollection[] = []
  const walk = (parentId: string, depth: number) => {
    const children = (byParent.get(parentId) ?? []).slice().sort((a, b) =>
      a.name.localeCompare(b.name, 'ko'),
    )
    for (const col of children) {
      const prefix = depth > 0 ? `${'  '.repeat(depth)}└ ` : ''
      result.push({ id: col.id, label: `${prefix}${col.name}` })
      walk(col.id, depth + 1)
    }
  }
  walk('', 0)
  return result
}

function PopupApp() {
  const [loading, setLoading] = useState(true)
  const [needsConfig, setNeedsConfig] = useState(false)
  const [serverUrl, setServerUrl] = useState('')
  const [apiKey, setApiKey] = useState('')

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [collections, setCollections] = useState<Collection[]>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])

  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [collectionId, setCollectionId] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [isFavorite, setIsFavorite] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [duplicate, setDuplicate] = useState<BookmarkItem | null>(null)
  const [savedBookmark, setSavedBookmark] = useState<BookmarkItem | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const [settings, tabs] = await Promise.all([
          getSettings(),
          chrome.tabs.query({ active: true, currentWindow: true }),
        ])
        const activeTab = tabs[0]
        if (activeTab?.url) setUrl(activeTab.url)
        if (activeTab?.title) setTitle(activeTab.title)

        if (!settings.serverUrl || !settings.apiKey) {
          setNeedsConfig(true)
          setLoading(false)
          return
        }
        setServerUrl(settings.serverUrl)
        setApiKey(settings.apiKey)

        const me = await fetchMe(settings.serverUrl, settings.apiKey)
        const writable = me.workspaces.filter((w) => w.role !== 'viewer')
        const list = writable.length > 0 ? writable : me.workspaces
        setWorkspaces(list)
        const chosen =
          list.find((w) => w.id === settings.defaultWorkspaceId)?.id ??
          list[0]?.id ??
          ''
        setWorkspaceId(chosen)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setNeedsConfig(true)
          setError(t('invalid_api_key'))
        } else {
          setError(requestErrorMessage(err, 'connection_error'))
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!serverUrl || !apiKey || !workspaceId) return
    setCollectionId('')
    void (async () => {
      try {
        const [colRes, tagRes] = await Promise.all([
          fetchCollections(serverUrl, apiKey, workspaceId),
          fetchTags(serverUrl, apiKey, workspaceId),
        ])
        setCollections(colRes.items ?? [])
        setAvailableTags((tagRes.items ?? []).map((t) => t.name))
      } catch {
        // Keep form usable even if collections/tags fail to load
      }
    })()
  }, [serverUrl, apiKey, workspaceId])

  const flatCollections = useMemo(() => flattenCollections(collections), [collections])

  const suggestedTags = useMemo(() => {
    const q = tagInput.trim().toLowerCase()
    return availableTags
      .filter((t) => !tags.includes(t) && (!q || t.toLowerCase().includes(q)))
      .slice(0, 6)
  }, [availableTags, tags, tagInput])

  function addTag(raw: string) {
    const clean = raw.trim().replace(/^#/, '')
    if (!clean || tags.includes(clean)) return
    setTags((prev) => [...prev, clean])
  }

  function commitTagInput() {
    const parts = tagInput
      .split(',')
      .map((s) => s.trim().replace(/^#/, ''))
      .filter(Boolean)
    if (parts.length === 0) return
    setTags((prev) => {
      const next = [...prev]
      for (const p of parts) {
        if (!next.includes(p)) next.push(p)
      }
      return next
    })
    setTagInput('')
  }

  async function handleSave(allowDuplicate = false) {
    if (!workspaceId || !url.trim()) return
    const pendingParts = tagInput
      .split(',')
      .map((s) => s.trim().replace(/^#/, ''))
      .filter(Boolean)
    const finalTags = Array.from(new Set([...tags, ...pendingParts]))
    if (pendingParts.length > 0) {
      setTags(finalTags)
      setTagInput('')
    }

    setSaving(true)
    setError('')
    setDuplicate(null)
    try {
      const created = await createBookmark(serverUrl, apiKey, workspaceId, {
        url: url.trim(),
        title: title.trim() || undefined,
        note: note.trim() || undefined,
        collection_id: collectionId || null,
        tags: finalTags,
        is_favorite: isFavorite,
        allow_duplicate: allowDuplicate,
      })
      setSavedBookmark(created)
    } catch (err) {
      if (err instanceof DuplicateBookmarkError) {
        setDuplicate(err.existing ?? null)
        if (!err.existing) {
          setError(t('duplicate_bookmark'))
        }
      } else {
        setError(requestErrorMessage(err, 'save_error'))
      }
    } finally {
      setSaving(false)
    }
  }

  function openWebApp(path = '/') {
    if (!serverUrl) return
    void chrome.tabs.create({ url: `${serverUrl}${path}` })
  }

  return (
    <div className="w-[370px] bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-600 text-white">
            <Bookmark className="h-4 w-4" />
          </span>
          <span className="text-sm font-bold tracking-tight">linktive</span>
        </div>
        <div className="flex items-center gap-1.5">
          {workspaces.length > 1 && (
            <select
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              className="max-w-[130px] truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700"
              aria-label={t('select_workspace')}
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
          {serverUrl && (
            <button
              type="button"
              onClick={() => openWebApp('/')}
              title={t('open_web_app')}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => void chrome.runtime.openOptionsPage()}
            title={t('open_extension_settings')}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('loading')}
          </div>
        ) : needsConfig ? (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-center">
            <p className="text-sm font-semibold text-slate-800">{t('setup_required')}</p>
            <p className="text-xs leading-relaxed text-slate-500">
              {t('setup_instructions')}
            </p>
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <button
              type="button"
              onClick={() => void chrome.runtime.openOptionsPage()}
              className="w-full rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700"
            >
              {t('open_settings')}
            </button>
          </div>
        ) : savedBookmark ? (
          <div className="space-y-3 rounded-xl border border-emerald-200 bg-white p-4 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
            <div>
              <p className="text-sm font-semibold text-slate-900">{t('bookmark_saved')}</p>
              <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                {savedBookmark.title || savedBookmark.url}
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const params = new URLSearchParams({
                    workspace: savedBookmark.workspace_id,
                    bookmark: savedBookmark.id,
                  })
                  openWebApp(`/bookmarks?${params}`)
                }}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {t('view_on_web')}
              </button>
              <button
                type="button"
                onClick={() => window.close()}
                className="flex-1 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700"
              >
                {t('close')}
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleSave(false)
            }}
            className="space-y-3"
          >
            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </div>
            )}

            {duplicate && (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{t('duplicate_bookmark')}</p>
                    <p className="mt-0.5 truncate text-amber-700">
                      {duplicate.title || duplicate.url}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      openWebApp(`/search?q=${encodeURIComponent(duplicate.url)}`)
                    }
                    className="flex-1 rounded-md border border-amber-300 bg-white px-2.5 py-1.5 font-medium text-amber-900 hover:bg-amber-100"
                  >
                    {t('view_existing')}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSave(true)}
                    className="flex-1 rounded-md bg-amber-600 px-2.5 py-1.5 font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {t('save_anyway')}
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">URL</label>
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t('bookmark_title')}</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('bookmark_title_placeholder')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{t('collection')}</label>
                <select
                  value={collectionId}
                  onChange={(e) => setCollectionId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                >
                  <option value="">{t('uncategorized')}</option>
                  {flatCollections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => setIsFavorite((v) => !v)}
                className={`flex h-[34px] items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition ${
                  isFavorite
                    ? 'border-amber-300 bg-amber-50 text-amber-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
                aria-pressed={isFavorite}
              >
                <Star className={`h-3.5 w-3.5 ${isFavorite ? 'fill-amber-400 text-amber-500' : ''}`} />
                {t('favorite')}
              </button>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t('tags')}</label>
              {tags.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700"
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                        aria-label={t('remove_tag', tag)}
                        className="text-sky-500 hover:text-sky-800"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    commitTagInput()
                  }
                }}
                onBlur={commitTagInput}
                placeholder={t('tags_placeholder')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              />
              {suggestedTags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {suggestedTags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        addTag(t)
                        setTagInput('')
                      }}
                      className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:border-sky-300 hover:text-sky-700"
                    >
                      + #{t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t('note')}</label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('note_placeholder')}
                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={saving || !workspaceId}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t(saving ? 'saving' : 'save_bookmark')}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}

localizePage('popup_title')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
)
