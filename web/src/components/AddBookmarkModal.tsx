import { useState, type FormEvent } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { ApiError } from '../api/client';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useI18n } from '../i18n';
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
  const { t } = useI18n();
  useScrollLock();
  useEscapeKey(onClose);
  const [url, setUrl] = useState('');
  const [duplicateInfo, setDuplicateInfo] = useState<{ existing?: Bookmark } | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submitWithOption = async (allowDuplicate = false) => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError(t('addBookmark.urlRequired'));
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
        setDuplicateInfo({ existing: err.existing });
        setError(t('addBookmark.duplicateError'));
      } else {
        setError(err instanceof Error ? err.message : t('addBookmark.saveFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitWithOption(false);
  };

  const targetName = targetCollection
    ? t('addBookmark.targetCollection', { name: targetCollection.name })
    : t('common.uncollected');

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center overscroll-none bg-slate-900/40 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{t('addBookmark.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            title={t('common.close')}
            aria-label={t('common.close')}
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
              {t('addBookmark.hint', { target: targetName })}
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
                  {duplicateInfo.existing && <div>
                    {t('addBookmark.existingBookmark', {
                      title: duplicateInfo.existing.title,
                      domain: duplicateInfo.existing.domain,
                    })}
                  </div>}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void submitWithOption(true)}
                    className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"
                  >
                    {t('addBookmark.allowDuplicate')}
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
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {saving ? t('addBookmark.submitting') : t('addBookmark.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
