import { useEffect, useState, type FormEvent } from 'react';
import { Hash, X } from 'lucide-react';

interface RenameTagModalProps {
  tagName: string;
  onClose: () => void;
  onRename: (oldName: string, newName: string) => Promise<void>;
}

export function RenameTagModal({ tagName, onClose, onRename }: RenameTagModalProps) {
  const [nextName, setNextName] = useState(tagName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = nextName.trim().replace(/^#+/, '');
    if (!trimmed) {
      setError('새 태그 이름을 입력해 주세요.');
      return;
    }
    if (trimmed.toLowerCase() === tagName.toLowerCase()) {
      onClose();
      return;
    }
    setError('');
    setBusy(true);
    try {
      await onRename(tagName, trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '태그 이름 수정에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <Hash className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">태그 이름 수정</h2>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              새 태그 이름 <span className="text-slate-400">(기존: #{tagName})</span>
            </label>
            <input
              type="text"
              autoFocus
              required
              value={nextName}
              onChange={(e) => setNextName(e.target.value)}
              placeholder="예: 세금"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
            />
            <p className="mt-1 text-xs text-slate-400">
              이미 존재하는 태그 이름을 입력하면 두 태그가 자동으로 합쳐집니다.
            </p>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {busy ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
