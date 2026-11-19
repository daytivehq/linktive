import { useState } from 'react';
import { Check, Hash, Pencil, Trash2, X } from 'lucide-react';
import type { TagSummary } from '../types/bookmark';

interface TagsPageProps {
  tags: TagSummary[];
  canEdit: boolean;
  onOpenTag: (tagName: string) => void;
  onRenameTag: (oldName: string, newName: string) => Promise<void>;
  onDeleteTag: (tagName: string) => Promise<void>;
}

export function TagsPage({
  tags,
  canEdit,
  onOpenTag,
  onRenameTag,
  onDeleteTag,
}: TagsPageProps) {
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [error, setError] = useState('');

  const handleRenameSubmit = async (oldName: string) => {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    setError('');
    try {
      await onRenameTag(oldName, trimmed);
      setEditingTag(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '태그 이름 수정 실패');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">전체 태그</h1>
        <p className="mt-1 text-sm text-slate-500">
          총 <strong>{tags.length}</strong>개의 태그가 사용 중입니다. 태그를 클릭해 관련
          북마크를 확인하거나 이름을 정리할 수 있습니다.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      )}

      {tags.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          등록된 태그가 없습니다.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tags.map((t) => {
            const isEditing = editingTag === t.name;
            return (
              <div
                key={t.name}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-sky-300"
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleRenameSubmit(t.name);
                        if (e.key === 'Escape') setEditingTag(null);
                      }}
                      className="w-full rounded-lg border border-sky-400 px-2.5 py-1.5 text-sm outline-none"
                    />
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingTag(null)}
                        className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRenameSubmit(t.name)}
                        className="rounded-md bg-sky-600 p-1 text-white hover:bg-sky-700"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onOpenTag(t.name)}
                      className="flex items-start justify-between gap-2 text-left"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                          <Hash className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-base font-semibold text-slate-900">
                            {t.name}
                          </div>
                          <div className="text-xs text-slate-400">북마크 {t.count}개</div>
                        </div>
                      </div>
                    </button>

                    {canEdit && (
                      <div className="mt-4 flex justify-end gap-1 border-t border-slate-100 pt-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTag(t.name);
                            setDraftName(t.name);
                          }}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span>이름 수정</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteTag(t.name)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>삭제</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
