import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  Pencil,
  RefreshCw,
  ShieldAlert,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import type { Bookmark, Collection, Workspace } from '../types/bookmark';
import { flattenCollectionsTree } from '../utils/collections';
import { FaviconBadge } from './FaviconBadge';

interface BookmarkDetailDrawerProps {
  bookmark: Bookmark;
  collections: Collection[];
  workspaces: Workspace[];
  activeWorkspaceId: string;
  canEdit: boolean;
  initialEditing?: boolean;
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
}

export function BookmarkDetailDrawer({
  bookmark,
  collections,
  activeWorkspaceId,
  canEdit,
  initialEditing = false,
  onClose,
  onUpdate,
  onDelete,
  onToggleFavorite,
  onCheckLink,
  onMarkLinkOk,
}: BookmarkDetailDrawerProps) {
  useScrollLock();
  useEscapeKey(onClose);

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

  // Only synchronize editing mode when opening a different bookmark or explicitly changing initialEditing.
  useEffect(() => {
    setEditing(initialEditing);
    setError('');
  }, [bookmark.id, initialEditing]);

  // Synchronize draft fields when bookmark data updates (without overriding local editing state).
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
        .map((t) => t.trim())
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
      setError(err instanceof Error ? err.message : '수정에 실패했습니다.');
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
      <div className="flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2.5">
            <FaviconBadge faviconUrl={bookmark.favicon_url} domain={bookmark.domain} size="sm" />
            <h2 className="text-sm font-semibold text-slate-700">
              {editing ? '북마크 수정' : '북마크 세부정보'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="닫기"
            aria-label="닫기"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {editing ? (
          <form onSubmit={handleSave} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 text-sm sm:p-6">
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">제목</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">URL</label>
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
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">컬렉션</label>
                <select
                  value={collectionId}
                  onChange={(e) => setCollectionId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
                >
                  <option value="">미분류</option>
                  {hierarchicalCollections.map(({ collection, indentedLabel }) => (
                    <option key={collection.id} value={collection.id}>
                      {indentedLabel}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">설명</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">메모</label>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="개인 메모 (검색에 포함됩니다)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                  태그 (쉼표로 구분)
                </label>
                <input
                  type="text"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="세금, 회계, 문서"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-400">
                <span>추가일: {bookmark.created_at.slice(0, 10)}</span>
                <span>수정일: {bookmark.updated_at.slice(0, 10)}</span>
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
                취소
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </form>
        ) : (
          <>
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
                        링크 정상
                      </span>
                    )}
                    {bookmark.link_status === 'broken' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700">
                        <AlertTriangle className="h-3 w-3" />
                        손상된 링크
                      </span>
                    )}
                    {bookmark.link_status === 'blocked' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                        <ShieldAlert className="h-3 w-3" />
                        접근 제한(차단)
                      </span>
                    )}
                    {onCheckLink && canEdit && (
                      <button
                        type="button"
                        disabled={checkingLink}
                        onClick={() => void handleRunLinkCheck()}
                        title="링크 연결 상태 확인"
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3 w-3 ${checkingLink ? 'animate-spin' : ''}`} />
                        <span>{checkingLink ? '확인 중...' : '링크 상태 확인'}</span>
                      </button>
                    )}
                    {onMarkLinkOk && canEdit && (bookmark.link_status === 'broken' || bookmark.link_status === 'blocked') && (
                      <button
                        type="button"
                        onClick={() => void onMarkLinkOk(bookmark)}
                        title="직접 접속 확인 후 정상으로 표시"
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        <span>정상 처리</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-semibold text-slate-500">컬렉션</div>
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3.5 py-2.5 text-slate-700">
                  <FolderOpen className="h-4 w-4 text-slate-400" />
                  <span>{currentCollection ? currentCollection.name : '미분류'}</span>
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-semibold text-slate-500">설명</div>
                <p className="rounded-lg bg-slate-50 p-3.5 text-slate-700">
                  {bookmark.description || <span className="text-slate-400">설명이 없습니다.</span>}
                </p>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-semibold text-slate-500">메모</div>
                <p className="rounded-lg bg-amber-50 p-3.5 text-amber-900">
                  {bookmark.note || <span className="text-amber-700/60">메모가 없습니다.</span>}
                </p>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-semibold text-slate-500">태그</div>
                {bookmark.tags.length === 0 ? (
                  <p className="text-xs text-slate-400">등록된 태그가 없습니다.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {bookmark.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-400">
                <span>추가일: {bookmark.created_at.slice(0, 10)}</span>
                <span>수정일: {bookmark.updated_at.slice(0, 10)}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3.5 sm:px-6">
              <div className="flex items-center gap-2">
                {canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(bookmark)}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                        bookmark.is_favorite
                          ? 'border-amber-300 bg-amber-50 text-amber-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Star className="h-3.5 w-3.5" fill={bookmark.is_favorite ? 'currentColor' : 'none'} />
                      <span>{bookmark.is_favorite ? '즐겨찾기 해제' : '즐겨찾기'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>수정</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(bookmark)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>삭제</span>
                    </button>
                  </>
                )}
              </div>
              <a
                href={bookmark.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
              >
                <span>열기</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
