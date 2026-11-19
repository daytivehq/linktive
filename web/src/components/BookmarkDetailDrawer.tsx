import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ExternalLink, Pencil, Star, Trash2, X } from 'lucide-react';
import type { Bookmark, Collection, Workspace } from '../types/bookmark';
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
}

export function BookmarkDetailDrawer({
  bookmark,
  collections,
  workspaces,
  activeWorkspaceId,
  canEdit,
  initialEditing = false,
  onClose,
  onUpdate,
  onDelete,
  onToggleFavorite,
}: BookmarkDetailDrawerProps) {
  const [editing, setEditing] = useState(initialEditing);
  const [url, setUrl] = useState(bookmark.url);
  const [title, setTitle] = useState(bookmark.title);
  const [description, setDescription] = useState(bookmark.description);
  const [note, setNote] = useState(bookmark.note);
  const [collectionId, setCollectionId] = useState(bookmark.collection_id ?? '');
  const [tagsText, setTagsText] = useState(bookmark.tags.join(', '));
  const [isFavorite, setIsFavorite] = useState(bookmark.is_favorite);
  const [targetWorkspaceId, setTargetWorkspaceId] = useState(activeWorkspaceId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setUrl(bookmark.url);
    setTitle(bookmark.title);
    setDescription(bookmark.description);
    setNote(bookmark.note);
    setCollectionId(bookmark.collection_id ?? '');
    setTagsText(bookmark.tags.join(', '));
    setIsFavorite(bookmark.is_favorite);
    setTargetWorkspaceId(activeWorkspaceId);
    setEditing(initialEditing);
    setError('');
  }, [bookmark, activeWorkspaceId, initialEditing]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const sortedCollections = useMemo(
    () => [...collections].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [collections],
  );
  const writableWorkspaces = useMemo(
    () => workspaces.filter((ws) => ws.role === 'owner' || ws.role === 'editor'),
    [workspaces],
  );
  const currentCollection = collections.find((c) => c.id === bookmark.collection_id);
  const currentWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

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
        is_favorite: isFavorite,
        target_workspace_id:
          targetWorkspaceId !== activeWorkspaceId ? targetWorkspaceId : undefined,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '수정에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-40 flex justify-end bg-slate-900/35"
    >
      <div className="flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <FaviconBadge faviconUrl={bookmark.favicon_url} domain={bookmark.domain} size="sm" />
            <h2 className="text-sm font-semibold text-slate-700">
              {editing ? '북마크 수정' : '북마크 세부정보'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {editing ? (
          <form onSubmit={handleSave} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-4 overflow-y-auto p-6 text-sm">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">URL</label>
                <input
                  type="text"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">제목</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">컬렉션</label>
                  <select
                    value={collectionId}
                    onChange={(e) => setCollectionId(e.target.value)}
                    disabled={targetWorkspaceId !== activeWorkspaceId}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 disabled:bg-slate-100"
                  >
                    <option value="">미분류</option>
                    {sortedCollections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
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
              </div>

              {writableWorkspaces.length > 1 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    소속(워크스페이스) 이동
                  </label>
                  <select
                    value={targetWorkspaceId}
                    onChange={(e) => setTargetWorkspaceId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
                  >
                    {writableWorkspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name} ({ws.type === 'personal' ? '개인' : '공유'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">설명</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">메모</label>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="개인 메모 (검색에 포함됩니다)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={isFavorite}
                  onChange={(e) => setIsFavorite(e.target.checked)}
                />
                <span>즐겨찾기에 추가</span>
              </label>

              {error && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-3.5">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError('');
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
            <div className="flex-1 space-y-5 overflow-y-auto p-6 text-sm">
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
                </div>
              </div>

              <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 sm:grid-cols-2">
                <div>
                  <span className="text-slate-400">도메인:</span> {bookmark.domain}
                </div>
                <div>
                  <span className="text-slate-400">소속:</span> {currentWorkspace?.name ?? '-'}
                </div>
                <div>
                  <span className="text-slate-400">컬렉션:</span>{' '}
                  {currentCollection ? currentCollection.name : '미분류'}
                </div>
                <div>
                  <span className="text-slate-400">즐겨찾기:</span>{' '}
                  {bookmark.is_favorite ? '등록됨' : '일반'}
                </div>
                <div>
                  <span className="text-slate-400">추가일:</span>{' '}
                  {bookmark.created_at.slice(0, 10)}
                </div>
                <div>
                  <span className="text-slate-400">수정일:</span>{' '}
                  {bookmark.updated_at.slice(0, 10)}
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
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3.5">
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
                      <Star className="h-3.5 w-3.5" />
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
