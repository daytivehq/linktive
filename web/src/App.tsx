import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bookmark as BookmarkIcon,
  FolderPlus,
  Hash,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Star,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { api } from './api/client';
import { AuthScreen } from './components/AuthScreen';
import { BookmarkDetailDrawer } from './components/BookmarkDetailDrawer';
import { BookmarkModal } from './components/BookmarkModal';
import { CollectionModal } from './components/CollectionModal';
import { CollectionTree } from './components/CollectionTree';
import { CollectionIcon } from './components/IconPicker';
import { SettingsModal } from './components/SettingsModal';
import {
  parseUserSettings,
  type Bookmark,
  type Collection,
  type SortOrder,
  type TagSummary,
  type User,
  type UserSettings,
  type VisibleFields,
  type Workspace,
} from './types/bookmark';

export function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('');

  const [collections, setCollections] = useState<Collection[]>([]);
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [totalBookmarks, setTotalBookmarks] = useState(0);
  const [loadingBookmarks, setLoadingBookmarks] = useState(false);

  const [selectedScope, setSelectedScope] = useState<'all' | 'favorites' | string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('relevance');

  const [showFieldMenu, setShowFieldMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [detailBookmark, setDetailBookmark] = useState<Bookmark | null>(null);

  const [bookmarkModal, setBookmarkModal] = useState<{
    open: boolean;
    editing: Bookmark | null;
  }>({ open: false, editing: null });

  const [collectionModal, setCollectionModal] = useState<{
    open: boolean;
    editing: Collection | null;
    initialParentId: string | null;
  }>({ open: false, editing: null, initialParentId: null });

  const settings = useMemo(() => parseUserSettings(user?.settings_json), [user?.settings_json]);
  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0],
    [workspaces, activeWorkspaceId],
  );
  const canEdit = activeWorkspace?.role === 'owner' || activeWorkspace?.role === 'editor';

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    api
      .me()
      .then((res) => {
        if (!active) return;
        setUser(res.user);
        setWorkspaces(res.workspaces);
        if (res.workspaces.length > 0) setActiveWorkspaceId(res.workspaces[0].id);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const refreshSidebar = useCallback(async (wsId: string) => {
    if (!wsId) return;
    const [colRes, tagRes] = await Promise.all([api.listCollections(wsId), api.listTags(wsId)]);
    setCollections(colRes.items);
    setTags(tagRes.items);
  }, []);

  const refreshBookmarks = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoadingBookmarks(true);
    try {
      const res = await api.listBookmarks(activeWorkspaceId, {
        q: debouncedSearch || undefined,
        collection_id:
          selectedScope !== 'all' && selectedScope !== 'favorites' ? selectedScope : undefined,
        favorite: selectedScope === 'favorites' ? true : undefined,
        tag: selectedTag || undefined,
        sort: sortOrder,
        limit: 100,
      });
      setBookmarks(res.items);
      setTotalBookmarks(res.total);
    } finally {
      setLoadingBookmarks(false);
    }
  }, [activeWorkspaceId, debouncedSearch, selectedScope, selectedTag, sortOrder]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    void refreshSidebar(activeWorkspaceId);
  }, [activeWorkspaceId, refreshSidebar]);

  useEffect(() => {
    void refreshBookmarks();
  }, [refreshBookmarks]);

  const updateSettings = async (next: UserSettings) => {
    const res = await api.updateSettings(next);
    setUser(res.user);
  };

  const toggleVisibleField = (field: keyof VisibleFields) => {
    const next: UserSettings = {
      ...settings,
      visible_fields: {
        ...settings.visible_fields,
        [field]: !settings.visible_fields[field],
      },
    };
    void updateSettings(next);
  };

  const handleBookmarkClick = (bm: Bookmark) => {
    if (settings.click_action === 'detail_panel') {
      setDetailBookmark(bm);
      return;
    }
    if (settings.click_action === 'current_tab') {
      window.location.href = bm.url;
      return;
    }
    window.open(bm.url, '_blank', 'noopener,noreferrer');
  };

  const handleSaveBookmark = async (payload: {
    id?: string;
    url: string;
    title: string;
    description: string;
    note: string;
    collection_id: string | null;
    tags: string[];
    is_favorite: boolean;
    allow_duplicate?: boolean;
    target_workspace_id?: string;
  }) => {
    if (!activeWorkspaceId) return;
    if (payload.id) {
      await api.updateBookmark(activeWorkspaceId, payload.id, {
        target_workspace_id: payload.target_workspace_id,
        collection_id: payload.collection_id,
        url: payload.url,
        title: payload.title,
        description: payload.description,
        note: payload.note,
        tags: payload.tags,
        is_favorite: payload.is_favorite,
      });
    } else {
      await api.createBookmark(activeWorkspaceId, payload);
    }
    await Promise.all([refreshBookmarks(), refreshSidebar(activeWorkspaceId)]);
    setDetailBookmark(null);
  };

  const handleDeleteBookmark = async (bm: Bookmark) => {
    if (!activeWorkspaceId || !window.confirm(`"${bm.title}" 북마크를 삭제할까요?`)) return;
    await api.deleteBookmark(activeWorkspaceId, bm.id);
    if (detailBookmark?.id === bm.id) setDetailBookmark(null);
    await Promise.all([refreshBookmarks(), refreshSidebar(activeWorkspaceId)]);
  };

  const handleToggleFavorite = async (bm: Bookmark) => {
    if (!activeWorkspaceId) return;
    const updated = await api.updateBookmark(activeWorkspaceId, bm.id, {
      is_favorite: !bm.is_favorite,
    });
    if (detailBookmark?.id === bm.id) setDetailBookmark(updated);
    await refreshBookmarks();
  };

  const handleSaveCollection = async (payload: {
    id?: string;
    name: string;
    description: string;
    parent_id: string | null;
    icon: string;
    color: string;
  }) => {
    if (!activeWorkspaceId) return;
    if (payload.id) {
      await api.updateCollection(activeWorkspaceId, payload.id, {
        name: payload.name,
        description: payload.description,
        parent_id: payload.parent_id,
        icon: payload.icon,
        color: payload.color,
      });
    } else {
      await api.createCollection(activeWorkspaceId, payload);
    }
    await refreshSidebar(activeWorkspaceId);
  };

  const handleMoveCollection = async (colId: string, newParentId: string | null) => {
    if (!activeWorkspaceId) return;
    await api.updateCollection(activeWorkspaceId, colId, { parent_id: newParentId });
    await refreshSidebar(activeWorkspaceId);
  };

  const handleDeleteCollection = async (col: Collection) => {
    if (!activeWorkspaceId || !window.confirm(`"${col.name}" 컬렉션을 삭제할까요? (하위 북마크는 미분류로 남습니다)`)) {
      return;
    }
    await api.deleteCollection(activeWorkspaceId, col.id);
    if (selectedScope === col.id) setSelectedScope('all');
    await Promise.all([refreshSidebar(activeWorkspaceId), refreshBookmarks()]);
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        불러오는 중...
      </div>
    );
  }

  if (!user || !activeWorkspace) {
    return (
      <AuthScreen
        onSuccess={(authedUser, userWorkspaces) => {
          setUser(authedUser);
          setWorkspaces(userWorkspaces);
          setActiveWorkspaceId(userWorkspaces[0]?.id ?? '');
        }}
      />
    );
  }

  const activeCollection = collections.find((c) => c.id === selectedScope);
  const collectionMap = new Map(collections.map((c) => [c.id, c]));

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-white">
            <BookmarkIcon className="h-4 w-4" />
          </div>
          <span className="text-base font-semibold tracking-tight">linktive</span>

          <select
            value={activeWorkspace.id}
            onChange={(e) => {
              setActiveWorkspaceId(e.target.value);
              setSelectedScope('all');
              setSelectedTag('');
            }}
            className="ml-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 outline-none"
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name} ({ws.type === 'personal' ? '개인' : '공유'})
              </option>
            ))}
          </select>
        </div>

        <div className="relative flex-1 max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="검색: 중간글자(래명세), 초성(ㄱㄹ), 연산자(tag:세금 -tag:임시 site:github.com)"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-sm outline-none transition focus:border-sky-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={() => setBookmarkModal({ open: true, editing: null })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
            >
              <Plus className="h-4 w-4" />
              <span>사이트 추가</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            aria-label="프로필 및 설정"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
          >
            <UserIcon className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1">
        {/* Left Sidebar */}
        <aside className="w-64 shrink-0 border-r border-slate-200 bg-white p-3">
          <nav className="space-y-5 text-sm">
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedScope('all');
                  setSelectedTag('');
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 font-medium ${
                  selectedScope === 'all' && !selectedTag
                    ? 'bg-sky-50 text-sky-700'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <BookmarkIcon className="h-4 w-4" />
                  모든 북마크
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedScope('favorites');
                  setSelectedTag('');
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 font-medium ${
                  selectedScope === 'favorites'
                    ? 'bg-sky-50 text-sky-700'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500" />
                  즐겨찾기
                </span>
              </button>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between px-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  컬렉션
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() =>
                      setCollectionModal({ open: true, editing: null, initialParentId: null })
                    }
                    title="새 컬렉션"
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <FolderPlus className="h-4 w-4" />
                  </button>
                )}
              </div>
              <CollectionTree
                collections={collections}
                selectedScope={selectedScope}
                canEdit={canEdit}
                onSelect={(id) => {
                  setSelectedScope(id);
                  setSelectedTag('');
                }}
                onCreateChild={(parentId) =>
                  setCollectionModal({ open: true, editing: null, initialParentId: parentId })
                }
                onEdit={(col) =>
                  setCollectionModal({ open: true, editing: col, initialParentId: col.parent_id ?? null })
                }
                onDelete={(col) => void handleDeleteCollection(col)}
                onMove={(colId, newParentId) => void handleMoveCollection(colId, newParentId)}
              />
            </div>

            <div>
              <div className="mb-1.5 px-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                태그
              </div>
              {tags.length === 0 ? (
                <p className="px-2.5 text-xs text-slate-400">태그가 없습니다.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 px-2">
                  {tags.map((t) => (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => setSelectedTag((prev) => (prev === t.name ? '' : t.name))}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
                        selectedTag === t.name
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <Hash className="h-3 w-3 opacity-70" />
                      <span>{t.name}</span>
                      <span className="opacity-60">{t.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </nav>
        </aside>

        {/* Right Main Area */}
        <main className="flex-1 p-5">
          {activeCollection && (
            <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2">
                <CollectionIcon
                  name={activeCollection.icon}
                  color={activeCollection.color}
                  className="h-5 w-5"
                />
                <h1 className="text-lg font-semibold">{activeCollection.name}</h1>
              </div>
              {activeCollection.description && (
                <p className="mt-1 text-sm text-slate-600">{activeCollection.description}</p>
              )}
            </div>
          )}

          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-500">
              검색 결과 <strong className="text-slate-800">{totalBookmarks}</strong>개
              {selectedTag && (
                <span className="ml-2 rounded bg-sky-50 px-2 py-0.5 text-xs text-sky-700">
                  #{selectedTag}
                </span>
              )}
            </div>

            <div className="relative flex items-center gap-2">
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none"
              >
                <option value="relevance">관련도/최신순</option>
                <option value="newest">최신순</option>
                <option value="oldest">오래된순</option>
                <option value="title">제목순</option>
              </select>

              <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => void updateSettings({ ...settings, view_mode: 'list' })}
                  aria-label="리스트형 보기"
                  className={`rounded-md p-1.5 ${
                    settings.view_mode === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-500'
                  }`}
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void updateSettings({ ...settings, view_mode: 'card' })}
                  aria-label="카드형 보기"
                  className={`rounded-md p-1.5 ${
                    settings.view_mode === 'card' ? 'bg-slate-100 text-slate-900' : 'text-slate-500'
                  }`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowFieldMenu((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span>표시 항목</span>
              </button>

              {showFieldMenu && (
                <div className="absolute right-10 top-10 z-10 w-44 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                  {(
                    [
                      ['thumbnail', '아이콘/도메인'],
                      ['title', '제목'],
                      ['description', '설명'],
                      ['note', '메모'],
                      ['tags', '태그'],
                      ['createdAt', '저장 날짜'],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={settings.visible_fields[key]}
                        onChange={() => toggleVisibleField(key)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowSettings(true)}
                aria-label="설정"
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {loadingBookmarks && bookmarks.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
              북마크를 불러오는 중...
            </div>
          ) : bookmarks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              저장된 북마크가 없습니다. 상단의 <strong>사이트 추가</strong> 버튼으로 첫 링크를 저장해 보세요.
            </div>
          ) : (
            <div
              className={
                settings.view_mode === 'card'
                  ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'
                  : 'space-y-2.5'
              }
            >
              {bookmarks.map((bm) => (
                <article
                  key={bm.id}
                  className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 transition hover:border-sky-300"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        {settings.visible_fields.thumbnail && (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold uppercase text-slate-500">
                            {bm.domain.slice(0, 2)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          {settings.visible_fields.title && (
                            <button
                              type="button"
                              onClick={() => handleBookmarkClick(bm)}
                              className="block w-full truncate text-left font-semibold text-slate-900 hover:text-sky-600"
                            >
                              {bm.title}
                            </button>
                          )}
                          <div className="truncate text-xs text-slate-400">{bm.domain}</div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleToggleFavorite(bm)}
                          disabled={!canEdit}
                          title="즐겨찾기"
                          className={`rounded p-1 ${
                            bm.is_favorite ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'
                          }`}
                        >
                          <Star className="h-4 w-4" fill={bm.is_favorite ? 'currentColor' : 'none'} />
                        </button>
                        {canEdit && (
                          <div className="hidden items-center gap-1 group-hover:flex">
                            <button
                              type="button"
                              onClick={() => setBookmarkModal({ open: true, editing: bm })}
                              title="수정"
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteBookmark(bm)}
                              title="삭제"
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {settings.visible_fields.description && bm.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{bm.description}</p>
                    )}

                    {settings.visible_fields.note && bm.note && (
                      <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1 text-xs text-amber-800">
                        메모: {bm.note}
                      </p>
                    )}
                  </div>

                  {(settings.visible_fields.tags || settings.visible_fields.createdAt) && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-slate-400">
                      {settings.visible_fields.tags ? (
                        <div className="flex flex-wrap gap-1">
                          {bm.tags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setSelectedTag(tag)}
                              className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 hover:bg-slate-200"
                            >
                              #{tag}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span />
                      )}
                      {settings.visible_fields.createdAt && (
                        <span>{bm.created_at.slice(0, 10)}</span>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </main>
      </div>

      {bookmarkModal.open && (
        <BookmarkModal
          collections={collections}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          editing={bookmarkModal.editing}
          defaultCollectionId={
            selectedScope !== 'all' && selectedScope !== 'favorites' ? selectedScope : null
          }
          onClose={() => setBookmarkModal({ open: false, editing: null })}
          onSave={handleSaveBookmark}
        />
      )}

      {collectionModal.open && (
        <CollectionModal
          collections={collections}
          editing={collectionModal.editing}
          initialParentId={collectionModal.initialParentId}
          onClose={() =>
            setCollectionModal({ open: false, editing: null, initialParentId: null })
          }
          onSave={handleSaveCollection}
        />
      )}

      {detailBookmark && (
        <BookmarkDetailDrawer
          bookmark={detailBookmark}
          collection={
            detailBookmark.collection_id ? collectionMap.get(detailBookmark.collection_id) : undefined
          }
          canEdit={canEdit}
          onClose={() => setDetailBookmark(null)}
          onEdit={(bm) => {
            setDetailBookmark(null);
            setBookmarkModal({ open: true, editing: bm });
          }}
          onDelete={(bm) => void handleDeleteBookmark(bm)}
          onToggleFavorite={(bm) => void handleToggleFavorite(bm)}
        />
      )}

      {showSettings && (
        <SettingsModal
          user={user}
          settings={settings}
          activeWorkspace={activeWorkspace}
          onClose={() => setShowSettings(false)}
          onUpdateSettings={updateSettings}
          onWorkspaceCreated={(ws) => {
            setWorkspaces((prev) => [...prev, ws]);
            setActiveWorkspaceId(ws.id);
          }}
          onLogout={async () => {
            await api.logout();
            setShowSettings(false);
            setUser(null);
            setWorkspaces([]);
          }}
        />
      )}
    </div>
  );
}
