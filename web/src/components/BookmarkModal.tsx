import { useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { ApiError } from '../api/client';
import type { Bookmark, Collection, Workspace } from '../types/bookmark';

interface BookmarkModalProps {
  collections: Collection[];
  workspaces: Workspace[];
  activeWorkspaceId: string;
  editing: Bookmark | null;
  defaultCollectionId: string | null;
  onClose: () => void;
  onSave: (payload: {
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
  }) => Promise<void>;
}

export function BookmarkModal({
  collections,
  workspaces,
  activeWorkspaceId,
  editing,
  defaultCollectionId,
  onClose,
  onSave,
}: BookmarkModalProps) {
  const [url, setUrl] = useState(editing?.url ?? '');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [collectionId, setCollectionId] = useState<string>(
    editing?.collection_id ?? defaultCollectionId ?? '',
  );
  const [tagsText, setTagsText] = useState(editing ? editing.tags.join(', ') : '');
  const [isFavorite, setIsFavorite] = useState(editing?.is_favorite ?? false);
  const [targetWorkspaceId, setTargetWorkspaceId] = useState(activeWorkspaceId);
  const [duplicateInfo, setDuplicateInfo] = useState<Bookmark | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const sortedCollections = useMemo(
    () => [...collections].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [collections],
  );

  const writableWorkspaces = useMemo(
    () => workspaces.filter((ws) => ws.role === 'owner' || ws.role === 'editor'),
    [workspaces],
  );

  const submitWithOption = async (allowDuplicate = false) => {
    setError('');
    setSaving(true);
    try {
      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await onSave({
        id: editing?.id,
        url: url.trim(),
        title: title.trim(),
        description: description.trim(),
        note: note.trim(),
        collection_id: collectionId || null,
        tags,
        is_favorite: isFavorite,
        allow_duplicate: allowDuplicate,
        target_workspace_id:
          editing && targetWorkspaceId !== activeWorkspaceId ? targetWorkspaceId : undefined,
      });
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDuplicateInfo(err.existing ?? null);
        setError('이 공간에 동일한 URL이 이미 저장되어 있습니다.');
      } else {
        setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitWithOption(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            {editing ? '북마크 수정' : '사이트 추가'}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">URL</label>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setDuplicateInfo(null);
              }}
              placeholder="https://example.com"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              제목 <span className="font-normal text-slate-400">(비워두면 사이트에서 자동 수집)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 거래명세서 발행 포털"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">컬렉션</label>
              <select
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
                disabled={Boolean(editing && targetWorkspaceId !== activeWorkspaceId)}
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
              <label className="mb-1 block text-xs font-medium text-slate-700">태그 (쉼표로 구분)</label>
              <input
                type="text"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="세금, 회계, 문서"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {editing && writableWorkspaces.length > 1 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">소속(워크스페이스) 이동</label>
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
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="사이트 설명 (비워두면 자동 수집)"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">메모</label>
            <textarea
              rows={2}
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
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              <div className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
              {duplicateInfo && (
                <div className="mt-1.5 space-y-2 text-amber-900">
                  <div>
                    기존 북마크: <strong>{duplicateInfo.title}</strong> ({duplicateInfo.domain})
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void submitWithOption(true)}
                    className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"
                  >
                    중복 허용하여 저장
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
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
      </div>
    </div>
  );
}
