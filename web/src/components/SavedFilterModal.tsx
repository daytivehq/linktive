import { useState, type FormEvent } from 'react';
import { Filter, X } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import type { SavedFilter } from '../types/bookmark';

const FILTER_COLORS = ['#0284c7', '#4f46e5', '#059669', '#d97706', '#e11d48', '#475569'];

interface SavedFilterModalProps {
  editing: SavedFilter | null;
  initialQuery?: string;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    name: string;
    query: string;
    icon: string;
    color: string;
  }) => Promise<void>;
}

export function SavedFilterModal({
  editing,
  initialQuery = '',
  onClose,
  onSave,
}: SavedFilterModalProps) {
  useScrollLock();
  useEscapeKey(onClose);

  const [name, setName] = useState(editing?.name ?? '');
  const [query, setQuery] = useState(editing?.query ?? initialQuery);
  const [color, setColor] = useState(editing?.color ?? '#0284c7');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !query.trim()) {
      setError('필터 이름과 검색 조건을 모두 입력해 주세요.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await onSave({
        id: editing?.id,
        name: name.trim(),
        query: query.trim(),
        icon: editing?.icon || 'filter',
        color,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center overscroll-none bg-slate-900/40 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: color }}
            >
              <Filter className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">
              {editing ? '저장된 필터 수정' : '새 저장된 필터'}
            </h2>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            title="닫기"
            aria-label="닫기"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">필터 이름</label>
            <input
              type="text"
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 중요 세금 문서"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">검색 조건</label>
            <input
              type="text"
              required
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="예: tags:세금 is:favorite"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs outline-none focus:border-sky-500"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              연산자 조합 가능: <code className="text-slate-600">tags:</code>,{' '}
              <code className="text-slate-600">-tags:</code>,{' '}
              <code className="text-slate-600">site:</code>,{' '}
              <code className="text-slate-600">in:</code>,{' '}
              <code className="text-slate-600">is:favorite</code>,{' '}
              <code className="text-slate-600">is:broken</code>
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">색상</label>
            <div className="flex flex-wrap gap-2">
              {FILTER_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColor(hex)}
                  title={hex}
                  aria-label={`색상 ${hex}`}
                  className={`h-6 w-6 rounded-full border-2 transition ${
                    color === hex ? 'scale-110 border-slate-900' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
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
