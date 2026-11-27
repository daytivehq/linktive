import { useState, type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useI18n } from '../i18n';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  requireCloseOnError?: boolean;
  danger?: boolean;
  children?: ReactNode;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  danger = true,
  children,
  requireCloseOnError = false,
  onClose,
  onConfirm,
}: ConfirmModalProps) {
  const { t } = useI18n();
  useScrollLock();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEscapeKey(onClose, !busy);

  const handleConfirm = async () => {
    setError('');
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.requestFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center overscroll-none bg-slate-900/40 p-4"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !(requireCloseOnError && error)) void handleConfirm();
        }}
        className="max-h-[90vh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
      >
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
            title={t('common.close')}
            aria-label={t('common.close')}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-slate-600">{message}</p>

        {children && <fieldset disabled={busy} className="mt-3 space-y-3">{children}</fieldset>}

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={busy || (requireCloseOnError && Boolean(error))}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60 ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-sky-600 hover:bg-sky-700'
            }`}
          >
            {busy ? t('common.processing') : (confirmLabel ?? t('common.delete'))}
          </button>
        </div>
      </form>
    </div>
  );
}
