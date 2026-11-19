import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = '삭제',
  danger = true,
  onClose,
  onConfirm,
}: ConfirmModalProps) {
  useScrollLock();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  const handleConfirm = async () => {
    setError('');
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청 처리에 실패했습니다.');
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
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {danger && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                <AlertTriangle className="h-4 w-4" />
              </div>
            )}
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
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

        <p className="text-sm text-slate-600">{message}</p>

        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleConfirm()}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60 ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-sky-600 hover:bg-sky-700'
            }`}
          >
            {busy ? '처리 중...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
