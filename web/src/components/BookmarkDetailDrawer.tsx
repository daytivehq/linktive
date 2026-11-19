import { ExternalLink, Pencil, Star, Trash2, X } from 'lucide-react';
import type { Bookmark, Collection } from '../types/bookmark';

interface BookmarkDetailDrawerProps {
  bookmark: Bookmark;
  collection?: Collection;
  canEdit: boolean;
  onClose: () => void;
  onEdit: (bm: Bookmark) => void;
  onDelete: (bm: Bookmark) => void;
  onToggleFavorite: (bm: Bookmark) => void;
}

export function BookmarkDetailDrawer({
  bookmark,
  collection,
  canEdit,
  onClose,
  onEdit,
  onDelete,
  onToggleFavorite,
}: BookmarkDetailDrawerProps) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30">
      <div className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-700">북마크 세부정보</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-sm">
          <div>
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

          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-md bg-slate-100 px-2 py-1">도메인: {bookmark.domain}</span>
            <span className="rounded-md bg-slate-100 px-2 py-1">
              컬렉션: {collection ? collection.name : '미분류'}
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-1">
              추가일: {bookmark.created_at.slice(0, 10)}
            </span>
          </div>

          {bookmark.description && (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-500">설명</div>
              <p className="rounded-lg bg-slate-50 p-3 text-slate-700">{bookmark.description}</p>
            </div>
          )}

          {bookmark.note && (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-500">메모</div>
              <p className="rounded-lg bg-amber-50 p-3 text-amber-900">{bookmark.note}</p>
            </div>
          )}

          <div>
            <div className="mb-1.5 text-xs font-semibold text-slate-500">태그</div>
            {bookmark.tags.length === 0 ? (
              <p className="text-xs text-slate-400">등록된 태그가 없습니다.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {bookmark.tags.map((t) => (
                  <span key={t} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
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
                  onClick={() => onEdit(bookmark)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
          >
            <span>열기</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
