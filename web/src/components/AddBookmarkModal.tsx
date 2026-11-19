import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { ApiError } from '../api/client';
import type { Bookmark, Collection } from '../types/bookmark';

interface AddBookmarkModalProps {
  targetCollection?: Collection;
  onClose: () => void;
  onCreate: (payload: {
    url: string;
    collection_id: string | null;
    allow_duplicate?: boolean;
  }) => Promise<void>;
}

export function AddBookmarkModal({ targetCollection, onClose, onCreate }: AddBookmarkModalProps) {
  const [url, setUrl] = useState('');
  const [duplicateInfo, setDuplicateInfo] = useState<Bookmark | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const submitWithOption = async (allowDuplicate = false) => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError('URL을 입력해 주세요.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onCreate({
        url: trimmed,
        collection_id: targetCollection ? targetCollection.id : null,
        allow_duplicate: allowDuplicate,
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
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">사이트 추가</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">URL</label>
            <input
              type="text"
              autoFocus
              required
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setDuplicateInfo(null);
              }}
              placeholder="https://example.com"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              제목·설명·파비콘은 자동으로 수집되며,{' '}
              <strong>{targetCollection ? `"${targetCollection.name}" 컬렉션` : '미분류'}</strong>에
              저장됩니다.
            </p>
          </div>

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

          <div className="flex justify-end gap-2 pt-1">
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
              {saving ? '수집 및 저장 중...' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
