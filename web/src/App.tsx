import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bookmark as BookmarkIcon,
  BookmarkPlus,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Filter,
  FolderOpen,
  FolderPlus,
  Hash,
  Inbox,
  Layers,
  LayoutGrid,
  Link2Off,
  List,
  LogOut,
  Menu,
  MoreHorizontal,
  PanelRightOpen,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Share2,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  Star,
  StickyNote,
  Trash2,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import {
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { api } from './api/client';
import { useEscapeKey } from './hooks/useEscapeKey';
import { useScrollLock } from './hooks/useScrollLock';
import { AddBookmarkModal } from './components/AddBookmarkModal';
import { AuthScreen } from './components/AuthScreen';
import { BookmarkDetailDrawer } from './components/BookmarkDetailDrawer';
import { BulkActionBar } from './components/BulkActionBar';
import { CollectionModal } from './components/CollectionModal';
import { CollectionShareModal } from './components/CollectionShareModal';
import { ConfirmModal } from './components/ConfirmModal';
import { ContextMenu, type ContextMenuItem } from './components/ContextMenu';
import {
  CollectionTree,
  MIME_BOOKMARK_DRAG,
} from './components/CollectionTree';
import { FaviconBadge } from './components/FaviconBadge';
import { HighlightText } from './components/HighlightText';
import { CollectionIcon } from './components/IconPicker';
import { RenameTagModal } from './components/RenameTagModal';
import { SavedFilterModal } from './components/SavedFilterModal';
import { SearchBar } from './components/SearchBar';
import { AdminPage } from './pages/AdminPage';
import { AdvancedSearchPage } from './pages/AdvancedSearchPage';
import { ApiDocsPage } from './pages/ApiDocsPage';
import { PublicCollectionPage } from './pages/PublicCollectionPage';
import { SettingsPage } from './pages/SettingsPage';
import { TagsPage } from './pages/TagsPage';
import { copyToClipboard } from './utils/clipboard';
import {
  parseUserSettings,
  type Bookmark,
  type BulkBookmarkAction,
  type Collection,
  type LinkStatus,
  type SavedFilter,
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
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [activeSharedCollection, setActiveSharedCollection] =
    useState<SharedCollectionView | null>(null);
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [stats, setStats] = useState<WorkspaceStats>({
    all_count: 0,
    favorite_count: 0,
    uncollected_count: 0,
    broken_count: 0,
  });
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [totalBookmarks, setTotalBookmarks] = useState(0);
  const [loadingBookmarks, setLoadingBookmarks] = useState(false);
  const [brokenStatusTab, setBrokenStatusTab] = useState<'broken' | 'blocked'>('broken');
  const [checkingLinks, setCheckingLinks] = useState(false);
  const [linkCheckNotice, setLinkCheckNotice] = useState('');

  const [sortOrder, setSortOrder] = useState<SortOrder>('relevance');
  const [showFieldMenu, setShowFieldMenu] = useState(false);
  const fieldMenuRef = useRef<HTMLDivElement>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [openTagMenu, setOpenTagMenu] = useState<string | null>(null);
  const [openFilterMenu, setOpenFilterMenu] = useState<string | null>(null);

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
  const [savedFilterModal, setSavedFilterModal] = useState<{
    open: boolean;
    editing: SavedFilter | null;
    initialQuery: string;
  }>({ open: false, editing: null, initialQuery: '' });
  const [shareModalCollection, setShareModalCollection] = useState<Collection | null>(null);
  const [renameTagTarget, setRenameTagTarget] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);
  const [collectionsOpen, setCollectionsOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('linktive_sidebar_collections') !== 'false';
    } catch {
      return true;
    }
  });
  const [filtersOpen, setFiltersOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('linktive_sidebar_filters') !== 'false';
    } catch {
      return true;
    }
  });
  const [tagsOpen, setTagsOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('linktive_sidebar_tags') !== 'false';
    } catch {
      return true;
    }
  });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollTimersRef = useRef<WeakMap<HTMLElement, number>>(new WeakMap());

  const handlePaneScroll = useCallback((el: HTMLElement) => {
    el.classList.add('is-scrolling');
    const prev = scrollTimersRef.current.get(el);
    if (prev) window.clearTimeout(prev);
    const timer = window.setTimeout(() => {
      el.classList.remove('is-scrolling');
    }, 900);
    scrollTimersRef.current.set(el, timer);
  }, []);

  const [sidebarDropTarget, setSidebarDropTarget] = useState<'uncollected' | 'favorites' | null>(
    null,
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useScrollLock(mobileSidebarOpen);
  useEscapeKey(() => setMobileSidebarOpen(false), mobileSidebarOpen);

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

  // Clear selection and close mobile drawer/menus when changing views or workspace.
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectMode(false);
    setMobileSidebarOpen(false);
    setUserMenuOpen(false);
    setWorkspacePickerOpen(false);
    setOpenFilterMenu(null);
    setLinkCheckNotice('');
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
    if (!showFieldMenu && !openTagMenu && !openFilterMenu && !userMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowFieldMenu(false);
        setOpenTagMenu(null);
        setOpenFilterMenu(null);
        setUserMenuOpen(false);
        setWorkspacePickerOpen(false);
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (showFieldMenu && fieldMenuRef.current && !fieldMenuRef.current.contains(e.target as Node)) {
        setShowFieldMenu(false);
      }
      if (openTagMenu) {
        setOpenTagMenu(null);
      }
      if (openFilterMenu) {
        setOpenFilterMenu(null);
      }
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
        setWorkspacePickerOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [showFieldMenu, openTagMenu, openFilterMenu, userMenuOpen]);

  const settings = useMemo(() => parseUserSettings(user.settings_json), [user.settings_json]);

  // Derive active route scope from URL path.
  const routeScope = useMemo(() => {
    const p = location.pathname;
    if (p === '/favorites') return { kind: 'favorites' as const };
    if (p === '/uncollected') return { kind: 'uncollected' as const };
    if (p === '/broken-links') return { kind: 'broken-links' as const };
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
    if (p.startsWith('/filters/')) {
      return { kind: 'filter' as const, filterId: decodeURIComponent(p.slice(9)) };
    }
    if (p.startsWith('/tags/')) {
      return { kind: 'tag' as const, tagName: decodeURIComponent(p.slice(6)) };
    }
    if (p === '/search') return { kind: 'search' as const, q: urlQuery };
    if (p === '/settings') return { kind: 'settings' as const };
    if (p === '/admin') return { kind: 'admin' as const };
    if (p === '/api-docs') return { kind: 'api-docs' as const };
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

  const activeSavedFilter =
    routeScope.kind === 'filter'
      ? savedFilters.find((f) => f.id === routeScope.filterId)
      : undefined;

  const refreshSidebar = useCallback(async (wsId: string) => {
    const [colRes, tagRes, statsRes, sharedRes, filterRes] = await Promise.all([
      api.listCollections(wsId),
      api.listTags(wsId),
      api.getStats(wsId),
      api.listSharedCollections(),
      api.listSavedFilters(wsId),
    ]);
    setCollections(colRes.items);
    setTags(tagRes.items);
    setStats(statsRes);
    setSharedCollections(sharedRes.items);
    setSavedFilters(filterRes.items);
  }, []);

  const refreshBookmarks = useCallback(async () => {
    if (
      routeScope.kind === 'settings' ||
      routeScope.kind === 'admin' ||
      routeScope.kind === 'api-docs' ||
      routeScope.kind === 'advanced-search' ||
      routeScope.kind === 'tags-index'
    ) {
      return;
    }
    if (routeScope.kind === 'filter' && !activeSavedFilter) {
      setBookmarks([]);
      setTotalBookmarks(0);
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
        q:
          routeScope.kind === 'search'
            ? routeScope.q
            : routeScope.kind === 'filter'
              ? activeSavedFilter?.query
              : undefined,
        collection_id:
          routeScope.kind === 'collection'
            ? routeScope.collectionId
            : routeScope.kind === 'uncollected'
              ? 'uncollected'
              : undefined,
        include_children:
          routeScope.kind === 'collection' ? settings.include_subcollections : undefined,
        favorite: routeScope.kind === 'favorites' ? true : undefined,
        tag: routeScope.kind === 'tag' ? routeScope.tagName : undefined,
        link_status:
          routeScope.kind === 'broken-links' ? (brokenStatusTab as LinkStatus) : undefined,
        sort: sortOrder,
        limit: 100,
      });
      setBookmarks(res.items);
      setTotalBookmarks(res.total);
    } finally {
      setLoadingBookmarks(false);
    }
  }, [
    activeWorkspace.id,
    routeScope,
    activeSavedFilter,
    brokenStatusTab,
    sortOrder,
    settings.include_subcollections,
  ]);

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
      setDetailDrawer({ ...detailDrawer, bookmark: updated });
    }
    await Promise.all([refreshBookmarks(), refreshSidebar(activeWorkspace.id)]);
  };

  const handleCheckBookmarkLink = async (bm: Bookmark) => {
    const updated = await api.checkBookmarkLink(activeWorkspace.id, bm.id);
    if (detailDrawer?.bookmark.id === bm.id) {
      setDetailDrawer((prev) => (prev ? { ...prev, bookmark: updated } : null));
    }
    await Promise.all([refreshBookmarks(), refreshSidebar(activeWorkspace.id)]);
  };

  const handleCheckWorkspaceLinks = async (onlyUnchecked = false) => {
    if (checkingLinks) return;
    setCheckingLinks(true);
    setLinkCheckNotice('');
    try {
      const res = await api.checkWorkspaceLinks(activeWorkspace.id, onlyUnchecked);
      setLinkCheckNotice(
        `총 ${res.checked}개 확인 완료 — 정상 ${res.ok_count}개, 손상 ${res.broken_count}개, 접근 제한 ${res.blocked_count}개`,
      );
      await Promise.all([refreshBookmarks(), refreshSidebar(activeWorkspace.id)]);
    } finally {
      setCheckingLinks(false);
    }
  };

  const handleSaveSavedFilter = async (payload: {
    id?: string;
    name: string;
    query: string;
    icon: string;
    color: string;
  }) => {
    if (payload.id) {
      await api.updateSavedFilter(activeWorkspace.id, payload.id, payload);
    } else {
      const created = await api.createSavedFilter(activeWorkspace.id, payload);
      navigate(`/filters/${encodeURIComponent(created.id)}`);
    }
    await refreshSidebar(activeWorkspace.id);
  };

  const handleDeleteSavedFilter = (f: SavedFilter) => {
    setConfirmState({
      title: '저장된 필터 삭제',
      message: `"${f.name}" 필터를 삭제할까요?`,
      onConfirm: async () => {
        await api.deleteSavedFilter(activeWorkspace.id, f.id);
        if (routeScope.kind === 'filter' && routeScope.filterId === f.id) {
          navigate('/bookmarks');
        }
        await refreshSidebar(activeWorkspace.id);
      },
    });
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
    setMobileSidebarOpen(false);
    setUserMenuOpen(false);
    setWorkspacePickerOpen(false);
    navigate(path);
  };

  const handleLogout = async () => {
    setUserMenuOpen(false);
    await api.logout();
    onSetUser(null);
    onSetWorkspaces([]);
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

      {routeScope.kind === 'filter' && activeSavedFilter && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: activeSavedFilter.color || '#0284c7' }}
            >
              <Filter className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-bold text-slate-900">{activeSavedFilter.name}</h1>
            <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
              {activeSavedFilter.query}
            </code>
          </div>
          {canEditWorkspace && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setSavedFilterModal({
                    open: true,
                    editing: activeSavedFilter,
                    initialQuery: activeSavedFilter.query,
                  })
                }
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>수정</span>
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSavedFilter(activeSavedFilter)}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>삭제</span>
              </button>
            </div>
          )}
        </div>
      )}

      {routeScope.kind === 'broken-links' && (
        <div className="mb-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Link2Off className="h-5 w-5 text-rose-500" />
              <h1 className="text-xl font-bold text-slate-900">손상된 링크</h1>
            </div>
            {canEditWorkspace && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={checkingLinks}
                  onClick={() => void handleCheckWorkspaceLinks(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${checkingLinks ? 'animate-spin' : ''}`} />
                  <span>미검사만 확인</span>
                </button>
                <button
                  type="button"
                  disabled={checkingLinks}
                  onClick={() => void handleCheckWorkspaceLinks(false)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${checkingLinks ? 'animate-spin' : ''}`} />
                  <span>{checkingLinks ? '검사 중...' : '전체 링크 검사'}</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setBrokenStatusTab('broken')}
              className={`rounded-full px-3 py-1 font-medium ${
                brokenStatusTab === 'broken'
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              손상됨 (404/연결 오류)
            </button>
            <button
              type="button"
              onClick={() => setBrokenStatusTab('blocked')}
              className={`rounded-full px-3 py-1 font-medium ${
                brokenStatusTab === 'blocked'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              접근 제한 (401/403/429)
            </button>
          </div>

          {linkCheckNotice && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-800">
              {linkCheckNotice}
            </p>
          )}
        </div>
      )}

      {/* Toolbar (no settings gear button per user request) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          {routeScope.kind === 'search' ? (
            <>
              <span>
                &ldquo;<strong className="text-slate-800">{routeScope.q}</strong>&rdquo; 검색 결과{' '}
                <strong className="text-slate-800">{totalBookmarks}</strong>개
              </span>
              {canEditWorkspace && routeScope.q.trim() && (
                <button
                  type="button"
                  onClick={() =>
                    setSavedFilterModal({
                      open: true,
                      editing: null,
                      initialQuery: routeScope.q.trim(),
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100"
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  <span>필터로 저장</span>
                </button>
              )}
            </>
          ) : (
            <>
              북마크 <strong className="text-slate-800">{totalBookmarks}</strong>개
            </>
          )}
        </div>

        <div ref={fieldMenuRef} className="relative flex flex-wrap items-center gap-2">
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

          <div className="hidden rounded-lg border border-slate-200 bg-white p-0.5 md:flex">
            <button
              type="button"
              onClick={() => void updateSettings({ ...settings, view_mode: 'list' })}
              title="리스트 형식으로 보기"
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
              title="카드 형식으로 보기"
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
              ? 'space-y-2.5 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-3'
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
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const items: ContextMenuItem[] = [
                    {
                      label: '새 탭으로 열기',
                      Icon: ExternalLink,
                      onClick: () => window.open(bm.url, '_blank', 'noopener,noreferrer'),
                    },
                    {
                      label: '세부정보 보기',
                      Icon: PanelRightOpen,
                      onClick: () => setDetailDrawer({ bookmark: bm, editing: false }),
                    },
                    ...(canEditCurrentView
                      ? [
                          {
                            label: '수정',
                            Icon: Pencil,
                            onClick: () => setDetailDrawer({ bookmark: bm, editing: true }),
                          },
                          {
                            label: bm.is_favorite ? '즐겨찾기 해제' : '즐겨찾기 추가',
                            Icon: Star,
                            onClick: () => void handleToggleFavorite(bm),
                          },
                        ]
                      : []),
                    {
                      label: 'URL 복사',
                      Icon: Copy,
                      onClick: () => void copyToClipboard(bm.url),
                    },
                    ...(canEditCurrentView
                      ? [
                          {
                            label: '삭제',
                            Icon: Trash2,
                            danger: true,
                            dividerBefore: true,
                            onClick: () => handleDeleteBookmark(bm),
                          },
                        ]
                      : []),
                  ];
                  setContextMenu({ x: e.clientX, y: e.clientY, items });
                }}
                className={`group flex min-w-0 cursor-pointer flex-col justify-between overflow-hidden rounded-xl border p-3 sm:p-4 transition ${
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
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <span className="truncate">
                            <HighlightText text={bm.domain} query={urlQuery} />
                          </span>
                          {bm.link_status === 'broken' && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              손상됨
                            </span>
                          )}
                          {bm.link_status === 'blocked' && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                              <ShieldAlert className="h-2.5 w-2.5" />
                              접근제한
                            </span>
                          )}
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
                        className="block rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:hidden md:group-hover:block"
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
                    <div className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                      <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <span className="min-w-0 flex-1">
                        <HighlightText text={bm.note} query={urlQuery} />
                      </span>
                    </div>
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
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 md:h-screen md:overflow-hidden">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:gap-3 sm:px-4">
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            title="메뉴 열기"
            aria-label="메뉴 열기"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => goScope('/bookmarks')}
            className="hidden shrink-0 items-center gap-2 md:flex"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-white">
              <BookmarkIcon className="h-4 w-4" />
            </div>
            <span className="text-base font-semibold tracking-tight">linktive</span>
          </button>
        </div>

        <div className="min-w-0 flex-1 md:max-w-xl">
          <SearchBar
            value={searchInput}
            inputRef={searchInputRef}
            onChange={setSearchInput}
            onOpenAdvancedSearch={() => navigate('/advanced-search')}
          />
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {canEditCurrentView && (
            <button
              type="button"
              onClick={() => setAddModalOpen(true)}
              title="사이트 추가"
              aria-label="사이트 추가"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-2.5 text-sm font-medium text-white hover:bg-sky-700 md:px-3"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden md:inline">사이트 추가</span>
            </button>
          )}
          <div ref={userMenuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setUserMenuOpen((prev) => !prev);
                setWorkspacePickerOpen(false);
              }}
              title="계정 및 메뉴"
              aria-label="계정 및 메뉴"
              aria-expanded={userMenuOpen}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
                userMenuOpen || routeScope.kind === 'settings' || routeScope.kind === 'admin'
                  ? 'border-sky-500 bg-sky-50 text-sky-600'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              <UserIcon className="h-4 w-4" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-11 z-40 w-60 rounded-xl border border-slate-200 bg-white p-1.5 text-sm shadow-xl">
                <div className="border-b border-slate-100 px-3 py-2">
                  <div className="truncate font-semibold text-slate-900">{user.name}</div>
                  <div className="truncate text-xs text-slate-400">{user.email}</div>
                </div>

                <div className="py-1">
                  {workspaces.length > 1 && (
                    <div className="mb-1 border-b border-slate-100 pb-1">
                      <button
                        type="button"
                        onClick={() => setWorkspacePickerOpen((prev) => !prev)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-slate-700 hover:bg-slate-100"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Layers className="h-4 w-4 shrink-0 text-slate-500" />
                          <span className="truncate font-medium">공간 전환</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-xs text-slate-400">
                          <span className="max-w-[76px] truncate">{activeWorkspace.name}</span>
                          {workspacePickerOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </span>
                      </button>

                      {workspacePickerOpen && (
                        <div className="mt-1 space-y-0.5 rounded-lg bg-slate-50 p-1">
                          {workspaces.map((ws) => {
                            const selected = ws.id === activeWorkspace.id;
                            return (
                              <button
                                key={ws.id}
                                type="button"
                                onClick={() => {
                                  onSelectWorkspace(ws.id);
                                  goScope('/bookmarks');
                                }}
                                className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs ${
                                  selected
                                    ? 'bg-sky-50 font-semibold text-sky-700'
                                    : 'text-slate-600 hover:bg-white'
                                }`}
                              >
                                <span className="truncate">
                                  {ws.name} ({ws.type === 'personal' ? '개인' : '공유'})
                                </span>
                                {selected && <Check className="h-3.5 w-3.5 shrink-0 text-sky-600" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => goScope('/settings')}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-slate-700 hover:bg-slate-100"
                  >
                    <Settings className="h-4 w-4 text-slate-500" />
                    <span>설정</span>
                  </button>

                  {user.is_admin && (
                    <button
                      type="button"
                      onClick={() => goScope('/admin')}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-slate-700 hover:bg-slate-100"
                    >
                      <Shield className="h-4 w-4 text-indigo-600" />
                      <span>관리자 설정</span>
                    </button>
                  )}
                </div>

                <div className="border-t border-slate-100 pt-1">
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-rose-600 hover:bg-rose-50"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>로그아웃</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {mobileSidebarOpen && (
          <div
            onClick={() => setMobileSidebarOpen(false)}
            className="fixed inset-0 z-30 overscroll-none bg-slate-900/40 md:hidden"
            aria-hidden="true"
          />
        )}
        {/* Left Sidebar */}
        <aside
          data-scroll-pane
          onScroll={(e) => handlePaneScroll(e.currentTarget)}
          className={`fixed inset-y-0 left-0 z-40 w-72 overflow-y-auto overscroll-contain border-r border-slate-200 bg-white p-3 transition-transform duration-200 md:static md:z-auto md:block md:h-full md:w-64 md:shrink-0 md:translate-x-0 md:overflow-y-auto ${
            mobileSidebarOpen
              ? 'translate-x-0 shadow-2xl'
              : 'pointer-events-none -translate-x-full md:pointer-events-auto'
          }`}
        >
          <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2 md:hidden">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-600 text-white">
                <BookmarkIcon className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm font-semibold text-slate-800">linktive</span>
            </div>
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              title="메뉴 닫기"
              aria-label="메뉴 닫기"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
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

              <button
                type="button"
                onClick={() => goScope('/broken-links')}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 font-medium ${
                  routeScope.kind === 'broken-links'
                    ? 'bg-rose-50 text-rose-700'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Link2Off className="h-4 w-4 text-rose-500" />
                  손상된 링크
                </span>
                <span className={`text-xs ${stats.broken_count > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>
                  {stats.broken_count}
                </span>
              </button>
            </div>

            {/* Collections (collapsible) */}
            <div>
              <div className="mb-1.5 flex items-center justify-between px-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setCollectionsOpen((prev) => {
                      const next = !prev;
                      try {
                        window.localStorage.setItem('linktive_sidebar_collections', String(next));
                      } catch {
                        // ignore storage errors
                      }
                      return next;
                    });
                  }}
                  title="컬렉션 목록 접기/펼치기"
                  className="flex items-center gap-1 rounded px-1 py-0.5 text-[13px] font-bold tracking-tight text-slate-700 hover:text-sky-600"
                >
                  {collectionsOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                  )}
                  <span>컬렉션</span>
                </button>
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
              {collectionsOpen && (
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
                  onDelete={(col) => handleDeleteCollection(col)}
                  onMoveCollection={(colId, newParentId) =>
                    void handleMoveCollection(colId, newParentId)
                  }
                  onDropBookmark={(bmId, targetColId) =>
                    void handleDropBookmarkToCollection(bmId, targetColId)
                  }
                  onContextMenu={(e, col) => {
                    const items: ContextMenuItem[] = [
                      {
                        label: '컬렉션 열기',
                        Icon: FolderOpen,
                        onClick: () => goScope(`/collections/${encodeURIComponent(col.id)}`),
                      },
                      ...(canEditWorkspace
                        ? [
                            {
                              label: '하위 컬렉션 추가',
                              Icon: FolderPlus,
                              onClick: () =>
                                setCollectionModal({
                                  open: true,
                                  editing: null,
                                  initialParentId: col.id,
                                }),
                            },
                            {
                              label: '수정',
                              Icon: Pencil,
                              onClick: () =>
                                setCollectionModal({
                                  open: true,
                                  editing: col,
                                  initialParentId: col.parent_id ?? null,
                                }),
                            },
                            {
                              label: '공유 및 공개',
                              Icon: Share2,
                              onClick: () => setShareModalCollection(col),
                            },
                            {
                              label: '삭제',
                              Icon: Trash2,
                              danger: true,
                              dividerBefore: true,
                              onClick: () => handleDeleteCollection(col),
                            },
                          ]
                        : []),
                    ];
                    setContextMenu({ x: e.clientX, y: e.clientY, items });
                  }}
                />
              )}
            </div>

            {/* Shared Collections from other users/workspaces */}
            {sharedCollections.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 px-2.5">
                  <Users className="h-3.5 w-3.5 text-slate-500" />
                  <span className="text-[13px] font-bold tracking-tight text-slate-700">
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

            {/* Saved Filters (collapsible) */}
            <div>
              <div className="mb-1.5 flex items-center justify-between px-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setFiltersOpen((prev) => {
                      const next = !prev;
                      try {
                        window.localStorage.setItem('linktive_sidebar_filters', String(next));
                      } catch {
                        // ignore storage errors
                      }
                      return next;
                    });
                  }}
                  title="저장된 필터 접기/펼치기"
                  className="flex items-center gap-1 rounded px-1 py-0.5 text-[13px] font-bold tracking-tight text-slate-700 hover:text-sky-600"
                >
                  {filtersOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                  )}
                  <span>저장된 필터</span>
                </button>
                {canEditWorkspace && (
                  <button
                    type="button"
                    onClick={() =>
                      setSavedFilterModal({ open: true, editing: null, initialQuery: '' })
                    }
                    title="새 저장된 필터"
                    aria-label="새 저장된 필터"
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
              {filtersOpen &&
                (savedFilters.length === 0 ? (
                  <p className="px-2.5 text-xs text-slate-400">저장된 필터가 없습니다.</p>
                ) : (
                  <div className="space-y-0.5">
                    {savedFilters.map((f) => {
                      const active = routeScope.kind === 'filter' && routeScope.filterId === f.id;
                      const isMenuOpen = openFilterMenu === f.id;
                      return (
                        <div key={f.id} className="relative">
                          <div
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setOpenFilterMenu(null);
                              const items: ContextMenuItem[] = [
                                {
                                  label: '필터 열기',
                                  Icon: Filter,
                                  onClick: () => goScope(`/filters/${encodeURIComponent(f.id)}`),
                                },
                                ...(canEditWorkspace
                                  ? [
                                      {
                                        label: '수정',
                                        Icon: Pencil,
                                        onClick: () =>
                                          setSavedFilterModal({
                                            open: true,
                                            editing: f,
                                            initialQuery: f.query,
                                          }),
                                      },
                                      {
                                        label: '삭제',
                                        Icon: Trash2,
                                        danger: true,
                                        dividerBefore: true,
                                        onClick: () => handleDeleteSavedFilter(f),
                                      },
                                    ]
                                  : []),
                              ];
                              setContextMenu({ x: e.clientX, y: e.clientY, items });
                            }}
                            className={`group flex items-center justify-between rounded-lg px-2.5 py-1 text-sm ${
                              active
                                ? 'bg-sky-50 font-medium text-sky-700'
                                : 'text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => goScope(`/filters/${encodeURIComponent(f.id)}`)}
                              className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left"
                            >
                              <Filter
                                className="h-3.5 w-3.5 shrink-0"
                                style={{ color: f.color || '#0284c7' }}
                              />
                              <span className="truncate">{f.name}</span>
                            </button>
                            {canEditWorkspace && (
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenFilterMenu((prev) => (prev === f.id ? null : f.id));
                                }}
                                title="필터 메뉴"
                                aria-label="필터 메뉴"
                                className={`rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700 ${
                                  isMenuOpen
                                    ? 'block bg-white text-slate-700'
                                    : 'block md:hidden md:group-hover:block'
                                }`}
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          {isMenuOpen && canEditWorkspace && (
                            <div
                              onMouseDown={(e) => e.stopPropagation()}
                              className="absolute right-1 top-8 z-30 w-32 rounded-xl border border-slate-200 bg-white p-1.5 text-xs shadow-lg"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenFilterMenu(null);
                                  setSavedFilterModal({
                                    open: true,
                                    editing: f,
                                    initialQuery: f.query,
                                  });
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-100"
                              >
                                <Pencil className="h-3.5 w-3.5 text-slate-500" />
                                <span>수정</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenFilterMenu(null);
                                  handleDeleteSavedFilter(f);
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
                ))}
            </div>

            {/* Tags (collapsible + 1 per row + clickable title -> /tags + context menu) */}
            <div>
              <div className="mb-1.5 flex items-center justify-between px-1.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTagsOpen((prev) => {
                        const next = !prev;
                        try {
                          window.localStorage.setItem('linktive_sidebar_tags', String(next));
                        } catch {
                          // ignore storage errors
                        }
                        return next;
                      });
                    }}
                    title="태그 목록 접기/펼치기"
                    aria-label="태그 목록 접기/펼치기"
                    className="rounded p-0.5 text-slate-500 hover:text-slate-700"
                  >
                    {tagsOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => goScope('/tags')}
                    className={`text-[13px] font-bold tracking-tight hover:text-sky-600 ${
                      routeScope.kind === 'tags-index' ? 'text-sky-600' : 'text-slate-700'
                    }`}
                  >
                    태그
                  </button>
                </div>
              </div>
              {tagsOpen &&
                (tags.length === 0 ? (
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
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setOpenTagMenu(null);
                              const items: ContextMenuItem[] = [
                                {
                                  label: '태그 북마크 보기',
                                  Icon: Hash,
                                  onClick: () => goScope(`/tags/${encodeURIComponent(t.name)}`),
                                },
                                ...(canEditWorkspace
                                  ? [
                                      {
                                        label: '이름 수정',
                                        Icon: Pencil,
                                        onClick: () => setRenameTagTarget(t.name),
                                      },
                                      {
                                        label: '삭제',
                                        Icon: Trash2,
                                        danger: true,
                                        dividerBefore: true,
                                        onClick: () => handleDeleteTag(t.name),
                                      },
                                    ]
                                  : []),
                              ];
                              setContextMenu({ x: e.clientX, y: e.clientY, items });
                            }}
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
                                title="태그 메뉴"
                                aria-label="태그 메뉴"
                                className={`rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700 ${
                                  isMenuOpen ? 'block bg-white text-slate-700' : 'block md:hidden md:group-hover:block'
                                }`}
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <span
                              className={`text-xs text-slate-400 ${
                                canEditWorkspace ? 'md:group-hover:hidden' : ''
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
                ))}
            </div>
          </nav>
        </aside>

        {/* Right Main Area */}
        <main
          data-scroll-pane
          onScroll={(e) => handlePaneScroll(e.currentTarget)}
          className="min-w-0 flex-1 p-3 sm:p-6 md:h-full md:overflow-y-auto"
        >
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
                  onUserUpdated={(updatedUser) => onSetUser(updatedUser)}
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
                  onLogout={handleLogout}
                />
              }
            />
            <Route
              path="/admin"
              element={
                <AdminPage currentUser={user} onBack={() => navigate('/bookmarks')} />
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
          onCheckLink={handleCheckBookmarkLink}
        />
      )}

      {savedFilterModal.open && (
        <SavedFilterModal
          editing={savedFilterModal.editing}
          initialQuery={savedFilterModal.initialQuery}
          onClose={() =>
            setSavedFilterModal({ open: false, editing: null, initialQuery: '' })
          }
          onSave={handleSaveSavedFilter}
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

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
