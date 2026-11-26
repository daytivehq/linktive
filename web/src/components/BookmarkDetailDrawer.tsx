import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Archive,
  BookOpen,
  CheckCircle2,
  Code2,
  Download,
  ExternalLink,
  FolderOpen,
  Info,
  Maximize2,
  Minimize2,
  Pencil,
  Printer,
  RefreshCw,
  ShieldAlert,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useI18n } from '../i18n';
import type {
  Bookmark,
  BookmarkArchive,
  ClipFormat,
  Collection,
  Workspace,
} from '../types/bookmark';
import { flattenCollectionsTree } from '../utils/collections';
import { formatBytes } from '../utils/format';
import { ConfirmModal } from './ConfirmModal';
import { FaviconBadge } from './FaviconBadge';

interface BookmarkDetailDrawerProps {
  bookmark: Bookmark;
  collections: Collection[];
  workspaces: Workspace[];
  activeWorkspaceId: string;
  canEdit: boolean;
  initialEditing?: boolean;
  initialTab?: 'info' | 'archive';
  initialExpanded?: boolean;
  defaultClipFormat?: ClipFormat;
  isSharedCollectionView?: boolean;
  sharedCollectionId?: string;
  onClose: () => void;
  onUpdate: (payload: {
    id: string;
    url: string;
    title: string;
    description: string;
    note: string;
    collection_id: string | null;
    tags: string[];
    is_favorite: boolean;
    target_workspace_id?: string;
  }) => Promise<void>;
  onDelete: (bm: Bookmark) => void;
  onToggleFavorite: (bm: Bookmark) => void;
  onCheckLink?: (bm: Bookmark) => Promise<void>;
  onMarkLinkOk?: (bm: Bookmark) => Promise<void>;
  onArchiveUpdated?: () => Promise<void> | void;
}

export function BookmarkDetailDrawer({
  bookmark,
  collections,
  activeWorkspaceId,
  canEdit,
  initialEditing = false,
  initialTab = 'info',
  initialExpanded = false,
  defaultClipFormat = 'readable',
  isSharedCollectionView = false,
  sharedCollectionId,
  onClose,
  onUpdate,
  onDelete,
  onToggleFavorite,
  onCheckLink,
  onMarkLinkOk,
  onArchiveUpdated,
}: BookmarkDetailDrawerProps) {
  const { t } = useI18n();
  useScrollLock();
  useEscapeKey(onClose);

  const [activeTab, setActiveTab] = useState<'info' | 'archive'>(initialTab);
  const [expanded, setExpanded] = useState(initialExpanded);
  const [editing, setEditing] = useState(initialEditing);
  const [url, setUrl] = useState(bookmark.url);
  const [title, setTitle] = useState(bookmark.title);
  const [description, setDescription] = useState(bookmark.description);
  const [note, setNote] = useState(bookmark.note);
  const [collectionId, setCollectionId] = useState(bookmark.collection_id ?? '');
  const [tagsText, setTagsText] = useState(bookmark.tags.join(', '));
  const [checkingLink, setCheckingLink] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Archive / Reader View state
  const [archive, setArchive] = useState<BookmarkArchive | null>(null);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [clipping, setClipping] = useState(false);
  const [clipMode, setClipMode] = useState<ClipFormat>(defaultClipFormat);
  const [viewFormat, setViewFormat] = useState<'readable' | 'html'>('readable');
  const [archiveStatusCode, setArchiveStatusCode] = useState<number | null>(null);
  const [archiveError, setArchiveError] = useState('');
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');
  const [confirmDeleteArchive, setConfirmDeleteArchive] = useState(false);

  // Only synchronize mode/tab when opening a different bookmark or explicitly changing initial flags.
  useEffect(() => {
    setEditing(initialEditing);
    setActiveTab(initialTab);
    setExpanded(initialExpanded);
    setClipMode(defaultClipFormat);
    setArchive(null);
    setArchiveStatusCode(null);
    setArchiveError('');
    setError('');
  }, [bookmark.id, initialEditing, initialTab, initialExpanded, defaultClipFormat]);

  const syncViewFormatFromArchive = (ar: BookmarkArchive) => {
    if (ar.archive_mode === 'html' && ar.snapshot_html) {
      setViewFormat('html');
    } else if (ar.content_html) {
      setViewFormat('readable');
    } else if (ar.snapshot_html) {
      setViewFormat('html');
    }
    if (ar.archive_mode) {
      setClipMode(ar.archive_mode);
    }
  };

  const loadArchive = useCallback(async () => {
    setLoadingArchive(true);
    setArchiveError('');
    setArchiveStatusCode(null);
    try {
      const res =
        isSharedCollectionView && sharedCollectionId
          ? await api.getSharedCollectionBookmarkArchive(sharedCollectionId, bookmark.id)
          : await api.getBookmarkArchive(activeWorkspaceId, bookmark.id);
      setArchive(res);
      syncViewFormatFromArchive(res);
    } catch (err) {
      setArchive(null);
      if (err instanceof ApiError) {
        setArchiveStatusCode(err.status);
        if (err.status === 404) {
          setArchiveError('');
        } else if (err.status === 403) {
          setArchiveError(t('drawer.archiveForbidden'));
        } else {
          setArchiveError(err.message);
        }
      } else {
        setArchiveError(err instanceof Error ? err.message : t('drawer.archiveFetchError'));
      }
    } finally {
      setLoadingArchive(false);
    }
  }, [activeWorkspaceId, bookmark.id, isSharedCollectionView, sharedCollectionId, t]);

  useEffect(() => {
    if (activeTab === 'archive' && !editing) {
      void loadArchive();
    }
  }, [activeTab, editing, loadArchive]);

  const handleClipNow = async (modeOverride?: ClipFormat, merge = false) => {
    if (clipping || isSharedCollectionView) return;
    const targetMode = modeOverride ?? clipMode;
    setClipping(true);
    setArchiveError('');
    setArchiveStatusCode(null);
    try {
      const res = await api.archiveBookmark(activeWorkspaceId, bookmark.id, {
        mode: targetMode,
        merge,
      });
      setArchive(res);
      if (merge) {
        if (targetMode === 'html' && res.snapshot_html) {
          setViewFormat('html');
        } else if (targetMode === 'readable' && res.content_html) {
          setViewFormat('readable');
        } else {
          syncViewFormatFromArchive(res);
        }
      } else {
        syncViewFormatFromArchive(res);
      }
      await onArchiveUpdated?.();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : t('drawer.clipFailed'));
    } finally {
      setClipping(false);
    }
  };

  const snapshotFrame = useRef<HTMLIFrameElement>(null);
  const handlePrintPDF = () => {
    const frame = snapshotFrame.current?.contentWindow;
    if (viewFormat === 'html' && frame) {
      frame.focus();
      frame.print();
      return;
    }
    window.print();
  };

  useEffect(() => {
    setUrl(bookmark.url);
    setTitle(bookmark.title);
    setDescription(bookmark.description);
    setNote(bookmark.note);
    setCollectionId(bookmark.collection_id ?? '');
    setTagsText(bookmark.tags.join(', '));
  }, [bookmark, activeWorkspaceId]);

  const hierarchicalCollections = useMemo(
    () => flattenCollectionsTree(collections),
    [collections],
  );
  const currentCollection = collections.find((c) => c.id === bookmark.collection_id);

  const resetDraft = () => {
    setUrl(bookmark.url);
    setTitle(bookmark.title);
    setDescription(bookmark.description);
    setNote(bookmark.note);
    setCollectionId(bookmark.collection_id ?? '');
    setTagsText(bookmark.tags.join(', '));
    setError('');
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const tags = tagsText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      await onUpdate({
        id: bookmark.id,
        url: url.trim(),
        title: title.trim() || bookmark.domain,
        description: description.trim(),
        note: note.trim(),
        collection_id: collectionId || null,
        tags,
        is_favorite: bookmark.is_favorite,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('drawer.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleRunLinkCheck = async () => {
    if (!onCheckLink || checkingLink) return;
    setCheckingLink(true);
    try {
      await onCheckLink(bookmark);
    } finally {
      setCheckingLink(false);
    }
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-40 flex justify-end overscroll-none bg-slate-900/35"
    >
      <div
        className={`flex h-full w-full flex-col bg-white shadow-2xl transition-all ${
          expanded ? 'max-w-none' : 'max-w-2xl border-l border-slate-200'
        }`}
      >
        <div className="no-print flex items-center justify-between border-b border-slate-200 px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <FaviconBadge faviconUrl={bookmark.favicon_url} domain={bookmark.domain} size="sm" />
            <h2 className="truncate text-sm font-semibold text-slate-700">
              {editing
                ? t('drawer.titleEdit')
                : expanded
                  ? bookmark.title
                  : t('drawer.titleDetail')}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!editing && (
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                title={expanded ? t('drawer.defaultSize') : t('drawer.fullscreen')}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">
                  {expanded ? t('drawer.defaultSize') : t('drawer.fullscreen')}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              title={t('common.close')}
              aria-label={t('common.close')}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {editing ? (
          <form onSubmit={handleSave} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 text-sm sm:p-6">
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    {t('drawer.fieldTitle')}
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    {t('drawer.fieldUrl')}
                  </label>
                  <input
                    type="text"
                    required
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                  {t('drawer.fieldCollection')}
                </label>
                <select
                  value={collectionId}
                  onChange={(e) => setCollectionId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
                >
                  <option value="">{t('common.uncollected')}</option>
                  {hierarchicalCollections.map(({ collection, indentedLabel }) => (
                    <option key={collection.id} value={collection.id}>
                      {indentedLabel}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                  {t('drawer.fieldDescription')}
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                  {t('drawer.fieldNote')}
                </label>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('drawer.fieldNotePlaceholder')}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                  {t('drawer.fieldTagsComma')}
                </label>
                <input
                  type="text"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder={t('drawer.fieldTagsPlaceholder')}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-400">
                <span>{t('drawer.addedAt', { date: bookmark.created_at.slice(0, 10) })}</span>
                <span>{t('drawer.updatedAt', { date: bookmark.updated_at.slice(0, 10) })}</span>
              </div>

              {error && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3.5 sm:px-6">
              <button
                type="button"
                onClick={() => {
                  resetDraft();
                  setEditing(false);
                }}
                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="no-print flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/70 px-4 sm:px-6">
              <div className="flex gap-4 overflow-x-auto whitespace-nowrap text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setActiveTab('info')}
                  className={`inline-flex items-center gap-1.5 border-b-2 py-2.5 ${
                    activeTab === 'info'
                      ? 'border-sky-600 text-sky-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Info className="h-3.5 w-3.5" />
                  <span>{t('drawer.tabInfo')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('archive')}
                  className={`inline-flex items-center gap-1.5 border-b-2 py-2.5 ${
                    activeTab === 'archive'
                      ? 'border-sky-600 text-sky-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>{t('drawer.tabArchive')}</span>
                  {bookmark.archive_status === 'ready' && (
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                      {t('drawer.tabArchiveSaved')}
                    </span>
                  )}
                  {bookmark.archive_status === 'pending' && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      {t('drawer.tabArchivePending')}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {activeTab === 'info' ? (
              <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 text-sm sm:p-6">
                <div className="flex items-start gap-3">
                  <FaviconBadge faviconUrl={bookmark.favicon_url} domain={bookmark.domain} />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold text-slate-900">{bookmark.title}</h3>
                    <a
                      href={bookmark.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 break-all text-xs text-sky-600 hover:underline"
                    >
                      <span>{bookmark.url}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </a>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      {bookmark.link_status === 'ok' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          {t('drawer.linkOk')}
                        </span>
                      )}
                      {bookmark.link_status === 'broken' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700">
                          <AlertTriangle className="h-3 w-3" />
                          {t('drawer.linkBroken')}
                        </span>
                      )}
                      {bookmark.link_status === 'blocked' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                          <ShieldAlert className="h-3 w-3" />
                          {t('drawer.linkBlocked')}
                        </span>
                      )}
                      {onCheckLink && canEdit && (
                        <button
                          type="button"
                          disabled={checkingLink}
                          onClick={() => void handleRunLinkCheck()}
                          title={t('drawer.checkLinkTitle')}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <RefreshCw className={`h-3 w-3 ${checkingLink ? 'animate-spin' : ''}`} />
                          <span>
                            {checkingLink ? t('drawer.checkingLink') : t('drawer.checkLink')}
                          </span>
                        </button>
                      )}
                      {onMarkLinkOk &&
                        canEdit &&
                        (bookmark.link_status === 'broken' || bookmark.link_status === 'blocked') && (
                          <button
                            type="button"
                            onClick={() => void onMarkLinkOk(bookmark)}
                            title={t('drawer.markOkTitle')}
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            <span>{t('drawer.markOk')}</span>
                          </button>
                        )}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 text-xs font-semibold text-slate-500">
                    {t('drawer.fieldCollection')}
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3.5 py-2.5 text-slate-700">
                    <FolderOpen className="h-4 w-4 text-slate-400" />
                    <span>{currentCollection ? currentCollection.name : t('common.uncollected')}</span>
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 text-xs font-semibold text-slate-500">
                    {t('drawer.fieldDescription')}
                  </div>
                  <p className="rounded-lg bg-slate-50 p-3.5 text-slate-700">
                    {bookmark.description || (
                      <span className="text-slate-400">{t('drawer.noDescription')}</span>
                    )}
                  </p>
                </div>

                <div>
                  <div className="mb-1.5 text-xs font-semibold text-slate-500">
                    {t('drawer.fieldNote')}
                  </div>
                  <p className="rounded-lg bg-amber-50 p-3.5 text-amber-900">
                    {bookmark.note || (
                      <span className="text-amber-700/60">{t('drawer.noNote')}</span>
                    )}
                  </p>
                </div>

                <div>
                  <div className="mb-1.5 text-xs font-semibold text-slate-500">
                    {t('drawer.fieldTags')}
                  </div>
                  {bookmark.tags.length === 0 ? (
                    <p className="text-xs text-slate-400">{t('drawer.noTags')}</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {bookmark.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Archive className="h-4 w-4 shrink-0 text-slate-400" />
                    <span>
                      {bookmark.archive_status === 'ready'
                        ? t('drawer.archiveReadyStatus', {
                            size: formatBytes(bookmark.archive_bytes ?? 0),
                          })
                        : bookmark.archive_status === 'pending'
                          ? t('drawer.archivePendingStatus')
                          : bookmark.archive_status === 'failed'
                            ? t('drawer.archiveFailedStatus')
                            : t('drawer.archiveEmptyStatus')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('archive')}
                    className="shrink-0 font-semibold text-sky-600 hover:underline"
                  >
                    {bookmark.archive_status === 'ready'
                      ? t('drawer.readArticle')
                      : t('drawer.viewClipping')}
                  </button>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-400">
                  <span>{t('drawer.addedAt', { date: bookmark.created_at.slice(0, 10) })}</span>
                  <span>{t('drawer.updatedAt', { date: bookmark.updated_at.slice(0, 10) })}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col overflow-y-auto overscroll-contain p-4 sm:p-6">
                {loadingArchive ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    {t('drawer.loadingArchive')}
                  </div>
                ) : archiveError ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                    <p className="font-medium">{archiveError}</p>
                    {archiveStatusCode !== 403 && canEdit && !isSharedCollectionView && (
                      <button
                        type="button"
                        disabled={clipping}
                        onClick={() => void handleClipNow()}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${clipping ? 'animate-spin' : ''}`} />
                        <span>{clipping ? t('drawer.clippingBusy') : t('drawer.retryClip')}</span>
                      </button>
                    )}
                  </div>
                ) : !archive ? (
                  <div className="mx-auto w-full max-w-xl rounded-2xl border border-dashed border-slate-200 p-6 text-center sm:p-8">
                    <BookOpen className="mx-auto mb-2.5 h-8 w-8 text-slate-300" />
                    <p className="text-sm font-medium text-slate-700">
                      {t('drawer.emptyArchiveTitle')}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">{t('drawer.emptyArchiveDesc')}</p>
                    {canEdit && !isSharedCollectionView && (
                      <div className="mt-5 space-y-3 text-left">
                        <div className="grid gap-2 sm:grid-cols-3">
                          {(
                            [
                              ['readable', t('drawer.modeReadable'), t('drawer.modeReadableSub')],
                              ['html', t('drawer.modeHtml'), t('drawer.modeHtmlSub')],
                              ['both', t('drawer.modeBoth'), t('drawer.modeBothSub')],
                            ] as const
                          ).map(([modeVal, titleText, subText]) => (
                            <button
                              key={modeVal}
                              type="button"
                              onClick={() => setClipMode(modeVal)}
                              className={`rounded-xl border p-2.5 text-left text-xs transition ${
                                clipMode === modeVal
                                  ? 'border-sky-500 bg-sky-50/70 ring-1 ring-sky-400'
                                  : 'border-slate-200 bg-white hover:bg-slate-50'
                              }`}
                            >
                              <div className="font-semibold text-slate-800">{titleText}</div>
                              <div className="mt-0.5 text-[11px] text-slate-500">{subText}</div>
                            </button>
                          ))}
                        </div>
                        <div className="text-center">
                          <button
                            type="button"
                            disabled={clipping}
                            onClick={() => void handleClipNow()}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                          >
                            <Archive className={`h-3.5 w-3.5 ${clipping ? 'animate-spin' : ''}`} />
                            <span>
                              {clipping ? t('drawer.clippingAssets') : t('drawer.runClip')}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : archive.status === 'pending' ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-600">
                    <p className="font-medium">{t('drawer.pendingDesc')}</p>
                    <button
                      type="button"
                      onClick={() => void loadArchive()}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>{t('drawer.refreshStatus')}</span>
                    </button>
                  </div>
                ) : archive.status === 'failed' ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
                    <div className="font-semibold">{t('drawer.failedTitle')}</div>
                    {archive.error_message && (
                      <p className="mt-1 text-rose-700">{archive.error_message}</p>
                    )}
                    {canEdit && !isSharedCollectionView && (
                      <button
                        type="button"
                        disabled={clipping}
                        onClick={() => void handleClipNow()}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${clipping ? 'animate-spin' : ''}`} />
                        <span>{clipping ? t('drawer.reclipBusy') : t('drawer.reclip')}</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className={`flex flex-1 flex-col space-y-4 ${expanded ? 'mx-auto w-full max-w-6xl' : ''}`}>
                    <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        {(archive.content_html || archive.snapshot_html) && (
                          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                            <button
                              type="button"
                              onClick={() => setViewFormat('readable')}
                              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 font-medium ${
                                viewFormat === 'readable'
                                  ? 'bg-sky-600 text-white'
                                  : 'text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              <BookOpen className="h-3 w-3" />
                              <span>{t('drawer.modeReadable')}</span>
                              {!archive.content_html && <span className="text-[10px] opacity-70">+</span>}
                            </button>
                            <button
                              type="button"
                              onClick={() => setViewFormat('html')}
                              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 font-medium ${
                                viewFormat === 'html'
                                  ? 'bg-sky-600 text-white'
                                  : 'text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              <Code2 className="h-3 w-3" />
                              <span>{t('drawer.modeHtml')}</span>
                              {!archive.snapshot_html && <span className="text-[10px] opacity-70">+</span>}
                            </button>
                          </div>
                        )}

                        {viewFormat === 'readable' && archive.content_html && (
                          <div className="flex items-center gap-1">
                            <span className="mr-0.5 text-slate-500">{t('drawer.fontLabel')}</span>
                            {(['sm', 'base', 'lg'] as const).map((sz) => (
                              <button
                                key={sz}
                                type="button"
                                onClick={() => setFontSize(sz)}
                                className={`whitespace-nowrap rounded px-2 py-0.5 font-medium ${
                                  fontSize === sz
                                    ? 'bg-sky-600 text-white'
                                    : 'bg-white text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {sz === 'sm'
                                  ? t('drawer.fontSm')
                                  : sz === 'base'
                                    ? t('drawer.fontBase')
                                    : t('drawer.fontLg')}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setExpanded((prev) => !prev)}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"
                        >
                          {expanded ? (
                            <Minimize2 className="h-3.5 w-3.5" />
                          ) : (
                            <Maximize2 className="h-3.5 w-3.5" />
                          )}
                          <span>{expanded ? t('drawer.shrinkView') : t('drawer.fullscreen')}</span>
                        </button>
                        {!isSharedCollectionView && (
                          <a
                            href={api.exportBookmarkMarkdownUrl(activeWorkspaceId, bookmark.id)}
                            download
                            title={
                              archive.content_html.includes('/assets/')
                                ? t('drawer.mdZipTooltip')
                                : t('drawer.mdTooltip')
                            }
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>
                              {archive.content_html.includes('/assets/') ? t('drawer.mdZip') : '.md'}
                            </span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={handlePrintPDF}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          <span>{t('drawer.savePdf')}</span>
                        </button>
                        {canEdit && !isSharedCollectionView && (
                          <>
                            <select
                              aria-label={t('drawer.reclipModeAria')}
                              value={clipMode}
                              onChange={(e) => setClipMode(e.target.value as ClipFormat)}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:border-sky-500"
                            >
                              <option value="readable">{t('drawer.modeReadable')}</option>
                              <option value="html">{t('drawer.modeHtml')}</option>
                              <option value="both">{t('drawer.modeBothShort')}</option>
                            </select>
                            <button
                              type="button"
                              disabled={clipping}
                              onClick={() => void handleClipNow(clipMode)}
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${clipping ? 'animate-spin' : ''}`} />
                              <span>{clipping ? t('drawer.reclipBusy') : t('drawer.reclip')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteArchive(true)}
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-rose-200 bg-white px-2.5 py-1 font-medium text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>{t('common.delete')}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {archive.error_message && (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {archive.error_message}
                      </p>
                    )}

                    {viewFormat === 'html' ? (
                      archive.snapshot_html ? (
                        <div className="flex flex-1 flex-col space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                            <span>
                              {t('drawer.snapshotMeta', {
                                count: archive.asset_count,
                                size: formatBytes(archive.total_bytes),
                              })}
                            </span>
                            <a
                              href={bookmark.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex shrink-0 items-center gap-1 text-sky-600 hover:underline"
                            >
                              <span>{t('drawer.openSource')}</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                          <iframe
                            ref={snapshotFrame}
                            sandbox="allow-same-origin allow-modals"
                            title={archive.title || bookmark.title}
                            srcDoc={archive.snapshot_html}
                            className="min-h-[65vh] w-full flex-1 rounded-xl border border-slate-200 bg-white"
                          />
                        </div>
                      ) : (
                        <div className="mx-auto w-full max-w-xl rounded-2xl border border-dashed border-slate-200 p-6 text-center">
                          <Code2 className="mx-auto mb-2.5 h-8 w-8 text-slate-300" />
                          <p className="text-sm font-medium text-slate-700">
                            {t('drawer.missingSnapshotTitle')}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {t('drawer.missingSnapshotDesc')}
                          </p>
                          {canEdit && !isSharedCollectionView && (
                            <button
                              type="button"
                              disabled={clipping}
                              onClick={() => void handleClipNow('html', true)}
                              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                            >
                              <Code2 className="h-3.5 w-3.5" />
                              <span>
                                {clipping ? t('drawer.addingSnapshotBtn') : t('drawer.addSnapshotBtn')}
                              </span>
                            </button>
                          )}
                        </div>
                      )
                    ) : archive.content_html ? (
                      <div className={expanded ? 'mx-auto w-full max-w-3xl space-y-4' : 'space-y-4'}>
                        <div className="border-b border-slate-200 pb-3">
                          <h3 className="text-xl font-bold leading-snug text-slate-900">
                            {archive.title || bookmark.title}
                          </h3>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span>{archive.site_name || bookmark.domain}</span>
                            {archive.byline && <span>· {archive.byline}</span>}
                            <span>
                              ·{' '}
                              {t('drawer.archivedMeta', {
                                date: archive.archived_at.slice(0, 10),
                                count: archive.asset_count,
                                size: formatBytes(archive.total_bytes),
                              })}
                            </span>
                          </div>
                          <a
                            href={bookmark.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1 break-all text-xs text-sky-600 hover:underline"
                          >
                            <span>{bookmark.url}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        </div>

                        <article
                          className={`clipper-article ${
                            fontSize === 'sm' ? 'text-sm' : fontSize === 'lg' ? 'text-lg' : 'text-[15px]'
                          }`}
                          dangerouslySetInnerHTML={{ __html: archive.content_html }}
                        />
                      </div>
                    ) : (
                      <div className="mx-auto w-full max-w-xl rounded-2xl border border-dashed border-slate-200 p-6 text-center">
                        <BookOpen className="mx-auto mb-2.5 h-8 w-8 text-slate-300" />
                        <p className="text-sm font-medium text-slate-700">
                          {t('drawer.missingReadableTitle')}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {t('drawer.missingReadableDesc')}
                        </p>
                        {canEdit && !isSharedCollectionView && (
                          <button
                            type="button"
                            disabled={clipping}
                            onClick={() => void handleClipNow('readable', true)}
                            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                          >
                            <BookOpen className="h-3.5 w-3.5" />
                            <span>
                              {clipping ? t('drawer.addingReadableBtn') : t('drawer.addReadableBtn')}
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="no-print flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3.5 sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                {canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(bookmark)}
                      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                        bookmark.is_favorite
                          ? 'border-amber-300 bg-amber-50 text-amber-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Star className="h-3.5 w-3.5" fill={bookmark.is_favorite ? 'currentColor' : 'none'} />
                      <span>
                        {bookmark.is_favorite ? t('bulk.unfavorite') : t('bulk.favorite')}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>{t('common.edit')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(bookmark)}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{t('common.delete')}</span>
                    </button>
                  </>
                )}
              </div>
              <a
                href={bookmark.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
              >
                <span>{t('common.open')}</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </>
        )}
      </div>

      {confirmDeleteArchive && (
        <ConfirmModal
          title={t('drawer.deleteArchiveTitle')}
          message={t('drawer.deleteArchiveMsg')}
          confirmLabel={t('common.delete')}
          onClose={() => setConfirmDeleteArchive(false)}
          onConfirm={async () => {
            await api.deleteBookmarkArchive(activeWorkspaceId, bookmark.id);
            setArchive(null);
            await onArchiveUpdated?.();
          }}
        />
      )}

      {archive &&
        archive.status === 'ready' &&
        archive.content_html &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="clipper-print-portal">
            <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '6px' }}>
              {archive.title || bookmark.title}
            </h1>
            <div
              style={{
                fontSize: '12px',
                color: '#64748b',
                marginBottom: '14px',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '10px',
              }}
            >
              <div>{bookmark.url}</div>
              <div>
                {archive.site_name || bookmark.domain}
                {archive.byline ? ` · ${archive.byline}` : ''} ·{' '}
                {t('drawer.printArchived', { date: archive.archived_at.slice(0, 10) })}
              </div>
            </div>
            <article
              className="clipper-article"
              dangerouslySetInnerHTML={{ __html: archive.content_html }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
