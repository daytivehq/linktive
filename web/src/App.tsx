import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark as BookmarkIcon,
  FolderPlus,
  Hash,
  Inbox,
  LayoutGrid,
  List,
  PanelRightOpen,
  Plus,
  Settings2,
  SlidersHorizontal,
  Star,
  User as UserIcon,
} from 'lucide-react';
import {
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { api } from './api/client';
import { AddBookmarkModal } from './components/AddBookmarkModal';
import { AuthScreen } from './components/AuthScreen';
import { BookmarkDetailDrawer } from './components/BookmarkDetailDrawer';
import { CollectionModal } from './components/CollectionModal';
import {
  CollectionTree,
  MIME_BOOKMARK_DRAG,
} from './components/CollectionTree';
import { FaviconBadge } from './components/FaviconBadge';
import { HighlightText } from './components/HighlightText';
import { CollectionIcon } from './components/IconPicker';
import { SearchBar } from './components/SearchBar';
import { AdvancedSearchPage } from './pages/AdvancedSearchPage';
import { SettingsPage } from './pages/SettingsPage';
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
  type WorkspaceStats,
} from './types/bookmark';

export function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('');

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

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        불러오는 중...
      </div>
    );
  }

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];

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

  return (
    <AuthenticatedShell
      user={user}
      workspaces={workspaces}
      activeWorkspace={activeWorkspace}
      onSetUser={setUser}
      onSetWorkspaces={setWorkspaces}
      onSelectWorkspace={setActiveWorkspaceId}
    />
  );
}

interface AuthenticatedShellProps {
  user: User;
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  onSetUser: (u: User | null) => void;
  onSetWorkspaces: React.Dispatch<React.SetStateAction<Workspace[]>>;
  onSelectWorkspace: (wsId: string) => void;
}

function AuthenticatedShell({
  user,
  workspaces,
  activeWorkspace,
  onSetUser,
  onSetWorkspaces,
  onSelectWorkspace,
}: AuthenticatedShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [collections, setCollections] = useState<Collection[]>([]);
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [stats, setStats] = useState<WorkspaceStats>({
    all_count: 0,
    favorite_count: 0,
    uncollected_count: 0,
  });
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [totalBookmarks, setTotalBookmarks] = useState(0);
  const [loadingBookmarks, setLoadingBookmarks] = useState(false);

  const [sortOrder, setSortOrder] = useState<SortOrder>('relevance');
  const [showFieldMenu, setShowFieldMenu] = useState(false);
  const fieldMenuRef = useRef<HTMLDivElement>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [detailDrawer, setDetailDrawer] = useState<{
    bookmark: Bookmark;
    editing: boolean;
  } | null>(null);
  const [collectionModal, setCollectionModal] = useState<{
    open: boolean;
    editing: Collection | null;
    initialParentId: string | null;
  }>({ open: false, editing: null, initialParentId: null });

  const [sidebarDropTarget, setSidebarDropTarget] = useState<'uncollected' | 'favorites' | null>(
    null,
  );

  const urlQuery = location.pathname === '/search' ? (searchParams.get('q') ?? '') : '';
  const [searchInput, setSearchInput] = useState(urlQuery);

  useEffect(() => {
    setSearchInput(urlQuery);
  }, [urlQuery]);

  // Debounce search input -> navigate to /search?q=...
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === urlQuery.trim()) return;
    const timer = window.setTimeout(() => {
      if (trimmed) {
        navigate(`/search?q=${encodeURIComponent(trimmed)}`, {
          replace: location.pathname === '/search',
        });
      } else if (location.pathname === '/search') {
        navigate('/bookmarks', { replace: true });
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [searchInput, urlQuery, location.pathname, navigate]);

  useEffect(() => {
    if (!showFieldMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowFieldMenu(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (fieldMenuRef.current && !fieldMenuRef.current.contains(e.target as Node)) {
        setShowFieldMenu(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [showFieldMenu]);

  const settings = useMemo(() => parseUserSettings(user.settings_json), [user.settings_json]);
  const canEdit = activeWorkspace.role === 'owner' || activeWorkspace.role === 'editor';

  // Derive active route scope from URL path.
  const routeScope = useMemo(() => {
    const p = location.pathname;
    if (p === '/favorites') return { kind: 'favorites' as const };
    if (p === '/uncollected') return { kind: 'uncollected' as const };
    if (p.startsWith('/collections/')) {
      return { kind: 'collection' as const, collectionId: decodeURIComponent(p.slice(13)) };
    }
    if (p.startsWith('/tags/')) {
      return { kind: 'tag' as const, tagName: decodeURIComponent(p.slice(6)) };
    }
    if (p === '/search') return { kind: 'search' as const, q: urlQuery };
    if (p === '/settings') return { kind: 'settings' as const };
    if (p === '/advanced-search') return { kind: 'advanced-search' as const };
    return { kind: 'all' as const };
  }, [location.pathname, urlQuery]);

  const activeCollection =
    routeScope.kind === 'collection'
      ? collections.find((c) => c.id === routeScope.collectionId)
      : undefined;

  const refreshSidebar = useCallback(async (wsId: string) => {
    const [colRes, tagRes, statsRes] = await Promise.all([
      api.listCollections(wsId),
      api.listTags(wsId),
      api.getStats(wsId),
    ]);
    setCollections(colRes.items);
    setTags(tagRes.items);
    setStats(statsRes);
  }, []);

  const refreshBookmarks = useCallback(async () => {
    if (routeScope.kind === 'settings' || routeScope.kind === 'advanced-search') return;
    setLoadingBookmarks(true);
    try {
      const res = await api.listBookmarks(activeWorkspace.id, {
        q: routeScope.kind === 'search' ? routeScope.q : undefined,
        collection_id:
          routeScope.kind === 'collection'
            ? routeScope.collectionId
            : routeScope.kind === 'uncollected'
              ? 'uncollected'
              : undefined,
        favorite: routeScope.kind === 'favorites' ? true : undefined,
        tag: routeScope.kind === 'tag' ? routeScope.tagName : undefined,
        sort: sortOrder,
        limit: 100,
      });
      setBookmarks(res.items);
      setTotalBookmarks(res.total);
    } finally {
      setLoadingBookmarks(false);
    }
  }, [activeWorkspace.id, routeScope, sortOrder]);

  useEffect(() => {
    void refreshSidebar(activeWorkspace.id);
  }, [activeWorkspace.id, refreshSidebar]);

  useEffect(() => {
    void refreshBookmarks();
  }, [refreshBookmarks]);

  const updateSettings = async (next: UserSettings) => {
    const res = await api.updateSettings(next);
    onSetUser(res.user);
  };

  const toggleVisibleField = (field: keyof VisibleFields) => {
    void updateSettings({
      ...settings,
      visible_fields: {
        ...settings.visible_fields,
        [field]: !settings.visible_fields[field],
      },
    });
  };

  const handleBookmarkClick = (bm: Bookmark) => {
    if (settings.click_action === 'detail_panel') {
      setDetailDrawer({ bookmark: bm, editing: false });
      return;
    }
    if (settings.click_action === 'current_tab') {
      window.location.href = bm.url;
      return;
    }
    window.open(bm.url, '_blank', 'noopener,noreferrer');
  };

  const handleCreateBookmark = async (payload: {
    url: string;
    collection_id: string | null;
    allow_duplicate?: boolean;
  }) => {
    await api.createBookmark(activeWorkspace.id, payload);
    await Promise.all([refreshBookmarks(), refreshSidebar(activeWorkspace.id)]);
  };

  const handleUpdateBookmark = async (payload: {
    id: string;
    url: string;
    title: string;
    description: string;
    note: string;
    collection_id: string | null;
    tags: string[];
    is_favorite: boolean;
    target_workspace_id?: string;
  }) => {
    const updated = await api.updateBookmark(activeWorkspace.id, payload.id, {
      target_workspace_id: payload.target_workspace_id,
      collection_id: payload.collection_id,
      url: payload.url,
      title: payload.title,
      description: payload.description,
      note: payload.note,
      tags: payload.tags,
      is_favorite: payload.is_favorite,
    });
    if (payload.target_workspace_id) {
      setDetailDrawer(null);
    } else {
      setDetailDrawer({ bookmark: updated, editing: false });
    }
    await Promise.all([refreshBookmarks(), refreshSidebar(activeWorkspace.id)]);
  };

  const handleDeleteBookmark = async (bm: Bookmark) => {
    if (!window.confirm(`"${bm.title}" 북마크를 삭제할까요?`)) return;
    await api.deleteBookmark(activeWorkspace.id, bm.id);
    if (detailDrawer?.bookmark.id === bm.id) setDetailDrawer(null);
    await Promise.all([refreshBookmarks(), refreshSidebar(activeWorkspace.id)]);
  };

  const handleToggleFavorite = async (bm: Bookmark) => {
    const updated = await api.updateBookmark(activeWorkspace.id, bm.id, {
      is_favorite: !bm.is_favorite,
    });
    if (detailDrawer?.bookmark.id === bm.id) {
      setDetailDrawer({ bookmark: updated, editing: detailDrawer.editing });
    }
    await Promise.all([refreshBookmarks(), refreshSidebar(activeWorkspace.id)]);
  };

  const handleDropBookmarkToCollection = async (bookmarkId: string, collectionId: string | null) => {
    await api.updateBookmark(activeWorkspace.id, bookmarkId, { collection_id: collectionId });
    await Promise.all([refreshBookmarks(), refreshSidebar(activeWorkspace.id)]);
  };

  const handleDropBookmarkToFavorite = async (bookmarkId: string) => {
    await api.updateBookmark(activeWorkspace.id, bookmarkId, { is_favorite: true });
    await Promise.all([refreshBookmarks(), refreshSidebar(activeWorkspace.id)]);
  };

  const handleSaveCollection = async (payload: {
    id?: string;
    name: string;
    description: string;
    parent_id: string | null;
    icon: string;
    color: string;
  }) => {
    if (payload.id) {
      await api.updateCollection(activeWorkspace.id, payload.id, {
        name: payload.name,
        description: payload.description,
        parent_id: payload.parent_id,
        icon: payload.icon,
        color: payload.color,
      });
    } else {
      await api.createCollection(activeWorkspace.id, payload);
    }
    await refreshSidebar(activeWorkspace.id);
  };

  const handleMoveCollection = async (colId: string, newParentId: string | null) => {
    await api.updateCollection(activeWorkspace.id, colId, { parent_id: newParentId });
    await refreshSidebar(activeWorkspace.id);
  };

  const handleDeleteCollection = async (col: Collection) => {
    if (
      !window.confirm(`"${col.name}" 컬렉션을 삭제할까요? (하위 북마크는 미분류로 남습니다)`)
    ) {
      return;
    }
    await api.deleteCollection(activeWorkspace.id, col.id);
    if (routeScope.kind === 'collection' && routeScope.collectionId === col.id) {
      navigate('/bookmarks');
    }
    await Promise.all([refreshSidebar(activeWorkspace.id), refreshBookmarks()]);
  };

  const goScope = (path: string) => {
    setSearchInput('');
    navigate(path);
  };

  const renderBookmarkFeed = () => (
    <>
      {activeCollection && (
        <div className="mb-5">
          <div className="flex items-center gap-2.5">
            <CollectionIcon
              name={activeCollection.icon}
              color={activeCollection.color}
              className="h-5 w-5"
            />
            <h1 className="text-xl font-bold text-slate-900">{activeCollection.name}</h1>
          </div>
          {activeCollection.description && (
            <p className="mt-1 text-sm text-slate-600">{activeCollection.description}</p>
          )}
        </div>
      )}

      {routeScope.kind === 'tag' && (
        <div className="mb-5 flex items-center gap-2">
          <Hash className="h-5 w-5 text-sky-600" />
          <h1 className="text-xl font-bold text-slate-900">{routeScope.tagName}</h1>
        </div>
      )}

      {routeScope.kind === 'uncollected' && (
        <div className="mb-5 flex items-center gap-2">
          <Inbox className="h-5 w-5 text-slate-500" />
          <h1 className="text-xl font-bold text-slate-900">미분류</h1>
        </div>
      )}

      {routeScope.kind === 'favorites' && (
        <div className="mb-5 flex items-center gap-2">
          <Star className="h-5 w-5 text-amber-500" />
          <h1 className="text-xl font-bold text-slate-900">즐겨찾기</h1>
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          {routeScope.kind === 'search' ? (
            <>
              &ldquo;<strong className="text-slate-800">{routeScope.q}</strong>&rdquo; 검색 결과{' '}
              <strong className="text-slate-800">{totalBookmarks}</strong>개
            </>
          ) : (
            <>
              북마크 <strong className="text-slate-800">{totalBookmarks}</strong>개
            </>
          )}
        </div>

        <div ref={fieldMenuRef} className="relative flex items-center gap-2">
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
            <div className="absolute right-10 top-10 z-20 w-44 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
              {(
                [
                  ['thumbnail', '파비콘/도메인'],
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
            onClick={() => navigate('/settings')}
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
          표시할 북마크가 없습니다. 상단의 <strong>사이트 추가</strong> 버튼으로 링크를 저장해
          보세요.
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
              draggable={canEdit}
              onDragStart={(e) => {
                if (!canEdit) return;
                e.dataTransfer.setData(MIME_BOOKMARK_DRAG, bm.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onClick={() => handleBookmarkClick(bm)}
              className="group flex cursor-pointer flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 transition hover:border-sky-300 hover:shadow-xs"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {settings.visible_fields.thumbnail && (
                      <FaviconBadge faviconUrl={bm.favicon_url} domain={bm.domain} />
                    )}
                    <div className="min-w-0 flex-1">
                      {settings.visible_fields.title && (
                        <div className="truncate font-semibold text-slate-900 group-hover:text-sky-600">
                          <HighlightText text={bm.title} query={urlQuery} />
                        </div>
                      )}
                      <div className="truncate text-xs text-slate-400">
                        <HighlightText text={bm.domain} query={urlQuery} />
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleToggleFavorite(bm);
                      }}
                      disabled={!canEdit}
                      title="즐겨찾기"
                      className={`rounded p-1 ${
                        bm.is_favorite ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'
                      }`}
                    >
                      <Star className="h-4 w-4" fill={bm.is_favorite ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailDrawer({ bookmark: bm, editing: false });
                      }}
                      title="세부정보 / 수정"
                      className="hidden rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 group-hover:block"
                    >
                      <PanelRightOpen className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {settings.visible_fields.description && bm.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                    <HighlightText text={bm.description} query={urlQuery} />
                  </p>
                )}

                {settings.visible_fields.note && bm.note && (
                  <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1 text-xs text-amber-800">
                    메모: <HighlightText text={bm.note} query={urlQuery} />
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
                          onClick={(e) => {
                            e.stopPropagation();
                            goScope(`/tags/${encodeURIComponent(tag)}`);
                          }}
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 hover:bg-slate-200"
                        >
                          #<HighlightText text={tag} query={urlQuery} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span />
                  )}
                  {settings.visible_fields.createdAt && <span>{bm.created_at.slice(0, 10)}</span>}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => goScope('/bookmarks')}
            className="flex items-center gap-2"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-white">
              <BookmarkIcon className="h-4 w-4" />
            </div>
            <span className="text-base font-semibold tracking-tight">linktive</span>
          </button>

          <select
            value={activeWorkspace.id}
            onChange={(e) => {
              onSelectWorkspace(e.target.value);
              goScope('/bookmarks');
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

        <SearchBar
          value={searchInput}
          onChange={setSearchInput}
          onOpenAdvancedSearch={() => navigate('/advanced-search')}
        />

        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={() => setAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
            >
              <Plus className="h-4 w-4" />
              <span>사이트 추가</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/settings')}
            aria-label="프로필 및 설정"
            className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
              routeScope.kind === 'settings'
                ? 'border-sky-500 bg-sky-50 text-sky-600'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
            }`}
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
                onClick={() => goScope('/bookmarks')}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 font-medium ${
                  routeScope.kind === 'all'
                    ? 'bg-sky-50 text-sky-700'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <BookmarkIcon className="h-4 w-4" />
                  모든 북마크
                </span>
                <span className="text-xs text-slate-400">{stats.all_count}</span>
              </button>

              <button
                type="button"
                onClick={() => goScope('/favorites')}
                onDragOver={(e) => {
                  if (canEdit && e.dataTransfer.types.includes(MIME_BOOKMARK_DRAG)) {
                    e.preventDefault();
                    setSidebarDropTarget('favorites');
                  }
                }}
                onDragLeave={() => {
                  if (sidebarDropTarget === 'favorites') setSidebarDropTarget(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setSidebarDropTarget(null);
                  const bmId = e.dataTransfer.getData(MIME_BOOKMARK_DRAG);
                  if (bmId && canEdit) void handleDropBookmarkToFavorite(bmId);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 font-medium ${
                  sidebarDropTarget === 'favorites'
                    ? 'bg-amber-50 ring-1 ring-amber-400'
                    : routeScope.kind === 'favorites'
                      ? 'bg-sky-50 text-sky-700'
                      : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500" />
                  즐겨찾기
                </span>
                <span className="text-xs text-slate-400">{stats.favorite_count}</span>
              </button>

              <button
                type="button"
                onClick={() => goScope('/uncollected')}
                onDragOver={(e) => {
                  if (canEdit && e.dataTransfer.types.includes(MIME_BOOKMARK_DRAG)) {
                    e.preventDefault();
                    setSidebarDropTarget('uncollected');
                  }
                }}
                onDragLeave={() => {
                  if (sidebarDropTarget === 'uncollected') setSidebarDropTarget(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setSidebarDropTarget(null);
                  const bmId = e.dataTransfer.getData(MIME_BOOKMARK_DRAG);
                  if (bmId && canEdit) void handleDropBookmarkToCollection(bmId, null);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 font-medium ${
                  sidebarDropTarget === 'uncollected'
                    ? 'bg-sky-100 ring-1 ring-sky-400'
                    : routeScope.kind === 'uncollected'
                      ? 'bg-sky-50 text-sky-700'
                      : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Inbox className="h-4 w-4 text-slate-500" />
                  미분류
                </span>
                <span className="text-xs text-slate-400">{stats.uncollected_count}</span>
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
                activeCollectionId={
                  routeScope.kind === 'collection' ? routeScope.collectionId : undefined
                }
                canEdit={canEdit}
                onSelect={(id) => goScope(`/collections/${encodeURIComponent(id)}`)}
                onCreateChild={(parentId) =>
                  setCollectionModal({ open: true, editing: null, initialParentId: parentId })
                }
                onEdit={(col) =>
                  setCollectionModal({
                    open: true,
                    editing: col,
                    initialParentId: col.parent_id ?? null,
                  })
                }
                onDelete={(col) => void handleDeleteCollection(col)}
                onMoveCollection={(colId, newParentId) =>
                  void handleMoveCollection(colId, newParentId)
                }
                onDropBookmark={(bmId, targetColId) =>
                  void handleDropBookmarkToCollection(bmId, targetColId)
                }
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
                  {tags.map((t) => {
                    const isTagActive =
                      routeScope.kind === 'tag' && routeScope.tagName === t.name;
                    return (
                      <button
                        key={t.name}
                        type="button"
                        onClick={() =>
                          isTagActive
                            ? goScope('/bookmarks')
                            : goScope(`/tags/${encodeURIComponent(t.name)}`)
                        }
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
                          isTagActive
                            ? 'bg-sky-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        <Hash className="h-3 w-3 opacity-70" />
                        <span>{t.name}</span>
                        <span className="opacity-60">{t.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>
        </aside>

        {/* Right Main Area */}
        <main className="flex-1 p-6">
          <Routes>
            <Route
              path="/settings"
              element={
                <SettingsPage
                  user={user}
                  settings={settings}
                  activeWorkspace={activeWorkspace}
                  onBack={() => navigate('/bookmarks')}
                  onUpdateSettings={updateSettings}
                  onWorkspaceCreated={(ws) => {
                    onSetWorkspaces((prev) => [...prev, ws]);
                    onSelectWorkspace(ws.id);
                  }}
                  onLogout={async () => {
                    await api.logout();
                    onSetUser(null);
                    onSetWorkspaces([]);
                  }}
                />
              }
            />
            <Route
              path="/advanced-search"
              element={
                <AdvancedSearchPage
                  onBack={() => navigate('/bookmarks')}
                  onTryQuery={(q) => {
                    setSearchInput(q);
                    navigate(`/search?q=${encodeURIComponent(q)}`);
                  }}
                />
              }
            />
            <Route path="*" element={renderBookmarkFeed()} />
          </Routes>
        </main>
      </div>

      {addModalOpen && (
        <AddBookmarkModal
          targetCollection={activeCollection}
          onClose={() => setAddModalOpen(false)}
          onCreate={handleCreateBookmark}
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

      {detailDrawer && (
        <BookmarkDetailDrawer
          bookmark={detailDrawer.bookmark}
          collections={collections}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspace.id}
          canEdit={canEdit}
          initialEditing={detailDrawer.editing}
          onClose={() => setDetailDrawer(null)}
          onUpdate={handleUpdateBookmark}
          onDelete={(bm) => void handleDeleteBookmark(bm)}
          onToggleFavorite={(bm) => void handleToggleFavorite(bm)}
        />
      )}
    </div>
  );
}
