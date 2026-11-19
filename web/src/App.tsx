import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark as BookmarkIcon,
  Check,
  CheckSquare,
  FolderPlus,
  Hash,
  Inbox,
  LayoutGrid,
  List,
  MoreHorizontal,
  PanelRightOpen,
  Pencil,
  Plus,
  SlidersHorizontal,
  Star,
  Trash2,
  User as UserIcon,
  Users,
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
import { BulkActionBar } from './components/BulkActionBar';
import { CollectionModal } from './components/CollectionModal';
import { CollectionShareModal } from './components/CollectionShareModal';
import { ConfirmModal } from './components/ConfirmModal';
import {
  CollectionTree,
  MIME_BOOKMARK_DRAG,
} from './components/CollectionTree';
import { FaviconBadge } from './components/FaviconBadge';
import { HighlightText } from './components/HighlightText';
import { CollectionIcon } from './components/IconPicker';
import { RenameTagModal } from './components/RenameTagModal';
import { SearchBar } from './components/SearchBar';
import { AdvancedSearchPage } from './pages/AdvancedSearchPage';
import { ApiDocsPage } from './pages/ApiDocsPage';
import { PublicCollectionPage } from './pages/PublicCollectionPage';
import { SettingsPage } from './pages/SettingsPage';
import { TagsPage } from './pages/TagsPage';
import {
  parseUserSettings,
  type Bookmark,
  type BulkBookmarkAction,
  type Collection,
  type SharedCollectionView,
  type SortOrder,
  type TagSummary,
  type User,
  type UserSettings,
  type VisibleFields,
  type Workspace,
  type WorkspaceStats,
} from './types/bookmark';

export function App() {
  const location = useLocation();
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('');

  const isPublicRoute = location.pathname.startsWith('/share/');

  useEffect(() => {
    if (isPublicRoute) {
      setAuthLoading(false);
      return;
    }
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
  }, [isPublicRoute]);

  if (isPublicRoute) {
    return (
      <Routes>
        <Route path="/share/:slug" element={<PublicCollectionPage />} />
      </Routes>
    );
  }

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
  const [sharedCollections, setSharedCollections] = useState<SharedCollectionView[]>([]);
  const [activeSharedCollection, setActiveSharedCollection] =
    useState<SharedCollectionView | null>(null);
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

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [openTagMenu, setOpenTagMenu] = useState<string | null>(null);

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
  const [shareModalCollection, setShareModalCollection] = useState<Collection | null>(null);
  const [renameTagTarget, setRenameTagTarget] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [sidebarDropTarget, setSidebarDropTarget] = useState<'uncollected' | 'favorites' | null>(
    null,
  );

  const urlQuery = location.pathname === '/search' ? (searchParams.get('q') ?? '') : '';
  const [searchInput, setSearchInput] = useState(urlQuery);

  useEffect(() => {
    setSearchInput(urlQuery);
  }, [urlQuery]);

  // Global "/" shortcut to focus search bar.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Clear selection when changing views or workspace.
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [location.pathname, activeWorkspace.id]);

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
    if (!showFieldMenu && !openTagMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowFieldMenu(false);
        setOpenTagMenu(null);
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (showFieldMenu && fieldMenuRef.current && !fieldMenuRef.current.contains(e.target as Node)) {
        setShowFieldMenu(false);
      }
      if (openTagMenu) {
        setOpenTagMenu(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [showFieldMenu, openTagMenu]);

  const settings = useMemo(() => parseUserSettings(user.settings_json), [user.settings_json]);

  // Derive active route scope from URL path.
  const routeScope = useMemo(() => {
    const p = location.pathname;
    if (p === '/favorites') return { kind: 'favorites' as const };
    if (p === '/uncollected') return { kind: 'uncollected' as const };
    if (p === '/tags') return { kind: 'tags-index' as const };
    if (p.startsWith('/collections/')) {
      return { kind: 'collection' as const, collectionId: decodeURIComponent(p.slice(13)) };
    }
    if (p.startsWith('/shared-collections/')) {
      return {
        kind: 'shared-collection' as const,
        collectionId: decodeURIComponent(p.slice(20)),
      };
    }
    if (p.startsWith('/tags/')) {
      return { kind: 'tag' as const, tagName: decodeURIComponent(p.slice(6)) };
    }
    if (p === '/search') return { kind: 'search' as const, q: urlQuery };
    if (p === '/settings') return { kind: 'settings' as const };
    if (p === '/advanced-search') return { kind: 'advanced-search' as const };
    return { kind: 'all' as const };
  }, [location.pathname, urlQuery]);

  const isSharedCollectionView = routeScope.kind === 'shared-collection';
  const canEditWorkspace = activeWorkspace.role === 'owner' || activeWorkspace.role === 'editor';
  const canEditCurrentView = isSharedCollectionView
    ? activeSharedCollection?.role === 'editor' || activeSharedCollection?.role === 'owner'
    : canEditWorkspace;

  const activeCollection =
    routeScope.kind === 'collection'
      ? collections.find((c) => c.id === routeScope.collectionId)
      : undefined;

  const refreshSidebar = useCallback(async (wsId: string) => {
    const [colRes, tagRes, statsRes, sharedRes] = await Promise.all([
      api.listCollections(wsId),
      api.listTags(wsId),
      api.getStats(wsId),
      api.listSharedCollections(),
    ]);
    setCollections(colRes.items);
    setTags(tagRes.items);
    setStats(statsRes);
    setSharedCollections(sharedRes.items);
  }, []);

  const refreshBookmarks = useCallback(async () => {
    if (
      routeScope.kind === 'settings' ||
      routeScope.kind === 'advanced-search' ||
      routeScope.kind === 'tags-index'
    ) {
      return;
    }
    setLoadingBookmarks(true);
    try {
      if (routeScope.kind === 'shared-collection') {
        const res = await api.listSharedCollectionBookmarks(routeScope.collectionId, {
          sort: sortOrder,
        });
        setActiveSharedCollection(res.collection);
        setBookmarks(res.items);
        setTotalBookmarks(res.total);
        return;
      }

      setActiveSharedCollection(null);
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

  const toggleSelectItem = (bmId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(bmId)) next.delete(bmId);
      else next.add(bmId);
      return next;
    });
  };

  const handleBookmarkClick = (bm: Bookmark) => {
    if (selectMode) {
      toggleSelectItem(bm.id);
      return;
    }
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

  const handleBookmarkDragStart = (e: React.DragEvent<HTMLElement>, bm: Bookmark) => {
    if (!canEditWorkspace || selectMode || isSharedCollectionView) return;
    e.dataTransfer.setData(MIME_BOOKMARK_DRAG, bm.id);
    e.dataTransfer.effectAllowed = 'move';

    // Compact favicon-only drag ghost so sidebar collections stay unobstructed.
    const ghost = document.createElement('div');
    ghost.style.position = 'fixed';
    ghost.style.left = '-9999px';
    ghost.style.top = '-9999px';
    ghost.style.width = '42px';
    ghost.style.height = '42px';
    ghost.style.borderRadius = '10px';
    ghost.style.background = '#ffffff';
    ghost.style.border = '2px solid #0284c7';
    ghost.style.display = 'flex';
    ghost.style.alignItems = 'center';
    ghost.style.justifyContent = 'center';
    ghost.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.18)';

    const existingImg = e.currentTarget.querySelector('img');
    if (existingImg && existingImg.complete && existingImg.naturalWidth > 0) {
      const img = document.createElement('img');
      img.src = existingImg.src;
      img.style.width = '22px';
      img.style.height = '22px';
      img.style.objectFit = 'contain';
      ghost.appendChild(img);
    } else {
      ghost.textContent = bm.domain.slice(0, 2).toUpperCase();
      ghost.style.fontSize = '12px';
      ghost.style.fontWeight = '700';
      ghost.style.color = '#334155';
    }

    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 21, 21);
    window.setTimeout(() => ghost.remove(), 0);
  };

  const handleCreateBookmark = async (payload: {
    url: string;
    collection_id: string | null;
    allow_duplicate?: boolean;
  }) => {
    if (isSharedCollectionView && activeSharedCollection) {
      await api.createSharedCollectionBookmark(activeSharedCollection.id, {
        url: payload.url,
        allow_duplicate: payload.allow_duplicate,
      });
    } else {
      await api.createBookmark(activeWorkspace.id, payload);
    }
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
    const updated =
      isSharedCollectionView && activeSharedCollection
        ? await api.updateSharedCollectionBookmark(activeSharedCollection.id, payload.id, {
            url: payload.url,
            title: payload.title,
            description: payload.description,
            note: payload.note,
            tags: payload.tags,
            is_favorite: payload.is_favorite,
          })
        : await api.updateBookmark(activeWorkspace.id, payload.id, {
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

  const handleDeleteBookmark = (bm: Bookmark) => {
    setConfirmState({
      title: '북마크 삭제',
      message: `"${bm.title}" 북마크를 삭제할까요?`,
      onConfirm: async () => {
        if (isSharedCollectionView && activeSharedCollection) {
          await api.deleteSharedCollectionBookmark(activeSharedCollection.id, bm.id);
        } else {
          await api.deleteBookmark(activeWorkspace.id, bm.id);
        }
        if (detailDrawer?.bookmark.id === bm.id) setDetailDrawer(null);
        await Promise.all([refreshBookmarks(), refreshSidebar(activeWorkspace.id)]);
      },
    });
  };

  const handleToggleFavorite = async (bm: Bookmark) => {
    const updated =
      isSharedCollectionView && activeSharedCollection
        ? await api.updateSharedCollectionBookmark(activeSharedCollection.id, bm.id, {
            is_favorite: !bm.is_favorite,
          })
        : await api.updateBookmark(activeWorkspace.id, bm.id, {
            is_favorite: !bm.is_favorite,
          });
    if (detailDrawer?.bookmark.id === bm.id) {
      setDetailDrawer({ bookmark: updated, editing: detailDrawer.editing });
    }
    await Promise.all([refreshBookmarks(), refreshSidebar(activeWorkspace.id)]);
  };

  const handleBulkExecute = async (payload: {
    action: BulkBookmarkAction;
    collection_id?: string | null;
    tags?: string[];
  }) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await api.bulkBookmarks(activeWorkspace.id, {
      bookmark_ids: ids,
      ...payload,
    });
    setSelectedIds(new Set());
    if (payload.action === 'delete') setSelectMode(false);
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

  const handleDeleteCollection = (col: Collection) => {
    setConfirmState({
      title: '컬렉션 삭제',
      message: `"${col.name}" 컬렉션을 삭제할까요? (하위 북마크는 미분류로 남습니다)`,
      onConfirm: async () => {
        await api.deleteCollection(activeWorkspace.id, col.id);
        if (routeScope.kind === 'collection' && routeScope.collectionId === col.id) {
          navigate('/bookmarks');
        }
        await Promise.all([refreshSidebar(activeWorkspace.id), refreshBookmarks()]);
      },
    });
  };

  const handleRenameTag = async (oldName: string, newName: string) => {
    await api.renameTag(activeWorkspace.id, oldName, newName);
    if (routeScope.kind === 'tag' && routeScope.tagName === oldName) {
      navigate(`/tags/${encodeURIComponent(newName.trim().toLowerCase())}`, { replace: true });
    }
    await Promise.all([refreshSidebar(activeWorkspace.id), refreshBookmarks()]);
  };

  const handleDeleteTag = (tagName: string) => {
    setConfirmState({
      title: '태그 삭제',
      message: `"#${tagName}" 태그를 삭제할까요? (북마크는 삭제되지 않습니다)`,
      onConfirm: async () => {
        await api.deleteTag(activeWorkspace.id, tagName);
        if (routeScope.kind === 'tag' && routeScope.tagName === tagName) {
          navigate('/bookmarks');
        }
        await Promise.all([refreshSidebar(activeWorkspace.id), refreshBookmarks()]);
      },
    });
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

      {isSharedCollectionView && activeSharedCollection && (
        <div className="mb-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <CollectionIcon
              name={activeSharedCollection.icon}
              color={activeSharedCollection.color}
              className="h-5 w-5"
            />
            <h1 className="text-xl font-bold text-slate-900">{activeSharedCollection.name}</h1>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
              {activeSharedCollection.owner_name} 님 공유 ·{' '}
              {activeSharedCollection.role === 'editor' ? '편집 가능' : '열람만 가능'}
            </span>
          </div>
          {activeSharedCollection.description && (
            <p className="mt-1 text-sm text-slate-600">{activeSharedCollection.description}</p>
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

      {/* Toolbar (no settings gear button per user request) */}
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

          {canEditWorkspace && !isSharedCollectionView && (
            <button
              type="button"
              onClick={() => {
                setSelectMode((prev) => !prev);
                setSelectedIds(new Set());
              }}
              aria-label="다중 선택"
              title="여러 북마크 선택"
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm ${
                selectMode
                  ? 'border-sky-500 bg-sky-50 font-medium text-sky-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              <CheckSquare className="h-4 w-4" />
              <span>선택</span>
            </button>
          )}

          {showFieldMenu && (
            <div className="absolute right-0 top-10 z-20 w-44 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
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
        </div>
      </div>

      {selectMode && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          totalCount={bookmarks.length}
          collections={collections}
          onSelectAll={() => setSelectedIds(new Set(bookmarks.map((b) => b.id)))}
          onClearSelection={() => {
            setSelectedIds(new Set());
            setSelectMode(false);
          }}
          onRequestDelete={() =>
            setConfirmState({
              title: '선택한 북마크 삭제',
              message: `선택한 ${selectedIds.size}개의 북마크를 삭제할까요?`,
              onConfirm: () => handleBulkExecute({ action: 'delete' }),
            })
          }
          onExecute={handleBulkExecute}
        />
      )}

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
          {bookmarks.map((bm) => {
            const isSelected = selectedIds.has(bm.id);
            return (
              <article
                key={bm.id}
                draggable={canEditWorkspace && !selectMode && !isSharedCollectionView}
                onDragStart={(e) => handleBookmarkDragStart(e, bm)}
                onClick={() => handleBookmarkClick(bm)}
                className={`group flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition ${
                  isSelected
                    ? 'border-sky-500 bg-sky-50/40 ring-1 ring-sky-400'
                    : 'border-slate-200 bg-white hover:border-sky-300 hover:shadow-xs'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {selectMode && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectItem(bm.id);
                          }}
                          className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                            isSelected
                              ? 'border-sky-600 bg-sky-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="h-3.5 w-3.5" />}
                        </button>
                      )}
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
                        disabled={!canEditCurrentView}
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
                              if (!isSharedCollectionView) {
                                goScope(`/tags/${encodeURIComponent(tag)}`);
                              }
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
            );
          })}
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
          inputRef={searchInputRef}
          onChange={setSearchInput}
          onOpenAdvancedSearch={() => navigate('/advanced-search')}
        />

        <div className="flex items-center gap-2">
          {canEditCurrentView && (
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
                  if (canEditWorkspace && e.dataTransfer.types.includes(MIME_BOOKMARK_DRAG)) {
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
                  if (bmId && canEditWorkspace) void handleDropBookmarkToFavorite(bmId);
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
                  if (canEditWorkspace && e.dataTransfer.types.includes(MIME_BOOKMARK_DRAG)) {
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
                  if (bmId && canEditWorkspace) void handleDropBookmarkToCollection(bmId, null);
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

            {/* Collections */}
            <div>
              <div className="mb-1.5 flex items-center justify-between px-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  컬렉션
                </span>
                {canEditWorkspace && (
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
                canEdit={canEditWorkspace}
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
                onShare={(col) => setShareModalCollection(col)}
                onDelete={(col) => void handleDeleteCollection(col)}
                onMoveCollection={(colId, newParentId) =>
                  void handleMoveCollection(colId, newParentId)
                }
                onDropBookmark={(bmId, targetColId) =>
                  void handleDropBookmarkToCollection(bmId, targetColId)
                }
              />
            </div>

            {/* Shared Collections from other users/workspaces */}
            {sharedCollections.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 px-2.5">
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    공유받은 컬렉션
                  </span>
                </div>
                <div className="space-y-0.5">
                  {sharedCollections.map((sc) => {
                    const active =
                      routeScope.kind === 'shared-collection' && routeScope.collectionId === sc.id;
                    return (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => goScope(`/shared-collections/${encodeURIComponent(sc.id)}`)}
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left ${
                          active
                            ? 'bg-sky-50 font-medium text-sky-700'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <CollectionIcon name={sc.icon} color={sc.color} className="h-4 w-4 shrink-0" />
                          <span className="truncate">{sc.name}</span>
                        </span>
                        <span className="ml-1 shrink-0 text-[11px] text-slate-400">
                          {sc.role === 'editor' ? '편집' : '열람'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tags (1 per row + clickable title -> /tags + ... menu) */}
            <div>
              <div className="mb-1.5 flex items-center justify-between px-2.5">
                <button
                  type="button"
                  onClick={() => goScope('/tags')}
                  className={`text-xs font-semibold uppercase tracking-wider hover:text-sky-600 ${
                    routeScope.kind === 'tags-index' ? 'text-sky-600' : 'text-slate-400'
                  }`}
                >
                  태그
                </button>
              </div>
              {tags.length === 0 ? (
                <p className="px-2.5 text-xs text-slate-400">태그가 없습니다.</p>
              ) : (
                <div className="space-y-0.5">
                  {tags.map((t) => {
                    const isTagActive =
                      routeScope.kind === 'tag' && routeScope.tagName === t.name;
                    const isMenuOpen = openTagMenu === t.name;
                    return (
                      <div key={t.name} className="relative">
                        <div
                          className={`group flex items-center justify-between rounded-lg px-2.5 py-1 text-sm ${
                            isTagActive
                              ? 'bg-sky-50 font-medium text-sky-700'
                              : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              isTagActive
                                ? goScope('/bookmarks')
                                : goScope(`/tags/${encodeURIComponent(t.name)}`)
                            }
                            className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left"
                          >
                            <Hash className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="truncate">{t.name}</span>
                          </button>

                          <div className="flex items-center gap-1">
                            {canEditWorkspace && (
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenTagMenu((prev) => (prev === t.name ? null : t.name));
                                }}
                                aria-label="태그 메뉴"
                                className={`rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700 ${
                                  isMenuOpen ? 'block bg-white text-slate-700' : 'hidden group-hover:block'
                                }`}
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <span
                              className={`text-xs text-slate-400 ${
                                canEditWorkspace ? 'group-hover:hidden' : ''
                              } ${isMenuOpen ? 'hidden' : ''}`}
                            >
                              {t.count}
                            </span>
                          </div>
                        </div>

                        {isMenuOpen && canEditWorkspace && (
                          <div
                            onMouseDown={(e) => e.stopPropagation()}
                            className="absolute right-1 top-8 z-30 w-36 rounded-xl border border-slate-200 bg-white p-1.5 text-xs shadow-lg"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpenTagMenu(null);
                                setRenameTagTarget(t.name);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-100"
                            >
                              <Pencil className="h-3.5 w-3.5 text-slate-500" />
                              <span>이름 수정</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenTagMenu(null);
                                handleDeleteTag(t.name);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>삭제</span>
                            </button>
                          </div>
                        )}
                      </div>
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
              path="/tags"
              element={
                <TagsPage
                  tags={tags}
                  canEdit={canEditWorkspace}
                  onOpenTag={(tagName) => goScope(`/tags/${encodeURIComponent(tagName)}`)}
                  onRequestRename={(tagName) => setRenameTagTarget(tagName)}
                  onRequestDelete={(tagName) => handleDeleteTag(tagName)}
                />
              }
            />
            <Route
              path="/settings"
              element={
                <SettingsPage
                  user={user}
                  settings={settings}
                  workspaces={workspaces}
                  activeWorkspace={activeWorkspace}
                  onBack={() => navigate('/bookmarks')}
                  onOpenApiDocs={() => navigate('/api-docs')}
                  onUpdateSettings={updateSettings}
                  onWorkspaceCreated={(ws) => {
                    onSetWorkspaces((prev) => [...prev, ws]);
                    onSelectWorkspace(ws.id);
                  }}
                  onWorkspaceUpdated={(ws) => {
                    onSetWorkspaces((prev) => prev.map((item) => (item.id === ws.id ? ws : item)));
                  }}
                  onWorkspaceDeleted={(wsID) => {
                    onSetWorkspaces((prev) => {
                      const next = prev.filter((item) => item.id !== wsID);
                      if (activeWorkspace.id === wsID && next.length > 0) {
                        onSelectWorkspace(next[0].id);
                      }
                      return next;
                    });
                  }}
                  onSelectWorkspace={onSelectWorkspace}
                  onDataImported={async () => {
                    await Promise.all([refreshSidebar(activeWorkspace.id), refreshBookmarks()]);
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
              path="/api-docs"
              element={
                <ApiDocsPage
                  activeWorkspaceId={activeWorkspace.id}
                  onBack={() => navigate('/settings')}
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
          targetCollection={activeCollection ?? activeSharedCollection ?? undefined}
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

      {shareModalCollection && (
        <CollectionShareModal
          workspaceId={activeWorkspace.id}
          collection={shareModalCollection}
          workspaces={workspaces}
          onClose={() => setShareModalCollection(null)}
          onCollectionUpdated={(updated) => {
            setCollections((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            setShareModalCollection(updated);
          }}
        />
      )}

      {detailDrawer && (
        <BookmarkDetailDrawer
          bookmark={detailDrawer.bookmark}
          collections={collections}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspace.id}
          canEdit={canEditCurrentView}
          initialEditing={detailDrawer.editing}
          onClose={() => setDetailDrawer(null)}
          onUpdate={handleUpdateBookmark}
          onDelete={(bm) => handleDeleteBookmark(bm)}
          onToggleFavorite={(bm) => void handleToggleFavorite(bm)}
        />
      )}

      {renameTagTarget && (
        <RenameTagModal
          tagName={renameTagTarget}
          onClose={() => setRenameTagTarget(null)}
          onRename={handleRenameTag}
        />
      )}

      {confirmState && (
        <ConfirmModal
          title={confirmState.title}
          message={confirmState.message}
          onClose={() => setConfirmState(null)}
          onConfirm={confirmState.onConfirm}
        />
      )}
    </div>
  );
}
