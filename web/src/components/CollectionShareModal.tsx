import { useEffect, useState, type FormEvent } from 'react';
import { Copy, ExternalLink, Globe, Plus, Trash2, Users, X } from 'lucide-react';
import { api } from '../api/client';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useI18n } from '../i18n';
import type { Collection, CollectionShare, Workspace } from '../types/bookmark';
import { copyToClipboard } from '../utils/clipboard';

interface CollectionShareModalProps {
  workspaceId: string;
  collection: Collection;
  workspaces: Workspace[];
  onClose: () => void;
  onCollectionUpdated: (updated: Collection) => void;
}

export function CollectionShareModal({
  workspaceId,
  collection,
  workspaces,
  onClose,
  onCollectionUpdated,
}: CollectionShareModalProps) {
  const { t } = useI18n();
  useScrollLock();
  const [col, setCol] = useState(collection);
  const [shares, setShares] = useState<CollectionShare[]>([]);
  const [targetType, setTargetType] = useState<'user' | 'workspace'>('user');
  const [targetEmail, setTargetEmail] = useState('');
  const [targetWorkspaceId, setTargetWorkspaceId] = useState('');
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const shareableWorkspaces = workspaces.filter((w) => w.id !== workspaceId);

  useEffect(() => {
    setCol(collection);
  }, [collection]);

  useEffect(() => {
    if (!targetWorkspaceId && shareableWorkspaces.length > 0) {
      setTargetWorkspaceId(shareableWorkspaces[0].id);
    }
  }, [shareableWorkspaces, targetWorkspaceId]);

  useEscapeKey(onClose);

  useEffect(() => {
    void api
      .listCollectionShares(workspaceId, collection.id)
      .then((res) => setShares(res.items))
      .catch(() => setShares([]));
  }, [workspaceId, collection.id]);

  const publicUrl = col.public_slug
    ? `${window.location.origin}/share/${col.public_slug}`
    : '';

  const handleTogglePublic = async () => {
    setError('');
    setMessage('');
    try {
      const updated = await api.setCollectionPublic(workspaceId, col.id, !col.is_public);
      setCol(updated);
      onCollectionUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('shareModal.publicToggleFailed'));
    }
  };

  const handleAddShare = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const share = await api.addCollectionShare(workspaceId, col.id, {
        target_type: targetType,
        target_email: targetType === 'user' ? targetEmail.trim() : undefined,
        target_workspace_id: targetType === 'workspace' ? targetWorkspaceId : undefined,
        role,
      });
      setShares((prev) => [...prev.filter((s) => s.id !== share.id), share]);
      setTargetEmail('');
      setMessage(t('shareModal.shareAdded'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('shareModal.shareAddFailed'));
    }
  };

  const handleRemoveShare = async (shareId: string) => {
    setError('');
    try {
      await api.removeCollectionShare(workspaceId, col.id, shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('shareModal.shareRemoveFailed'));
    }
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center overscroll-none bg-slate-900/40 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900">
              {t('shareModal.title', { name: col.name })}
            </h2>
            <p className="text-xs text-slate-500">{t('shareModal.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title={t('common.close')}
            aria-label={t('common.close')}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Public Link Section */}
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 shrink-0 text-sky-600" />
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    {t('shareModal.publicTitle')}
                  </div>
                  <div className="text-xs text-slate-500">{t('shareModal.publicDesc')}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleTogglePublic()}
                className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${
                  col.is_public
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {col.is_public ? t('shareModal.publicOn') : t('shareModal.publicOff')}
              </button>
            </div>

            {col.is_public && publicUrl && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <span className="flex-1 truncate font-mono text-slate-700">{publicUrl}</span>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyToClipboard(publicUrl);
                    if (ok) {
                      setError('');
                      setMessage(t('shareModal.publicCopied'));
                    } else {
                      setError(t('shareModal.copyBlocked'));
                    }
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded bg-white px-2 py-1 font-medium text-sky-600 shadow-2xs hover:bg-sky-50"
                >
                  <Copy className="h-3 w-3" />
                  {t('common.copy')}
                </button>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded bg-white px-2 py-1 font-medium text-slate-600 shadow-2xs hover:bg-slate-100"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t('common.open')}
                </a>
              </div>
            )}
          </section>

          {/* Shared Access Section */}
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 shrink-0 text-indigo-600" />
              <div>
                <div className="text-sm font-semibold text-slate-800">
                  {t('shareModal.accessTitle')}
                </div>
                <div className="text-xs text-slate-500">{t('shareModal.accessDesc')}</div>
              </div>
            </div>

            <form onSubmit={handleAddShare} className="space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value as 'user' | 'workspace')}
                  className="min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs sm:col-span-4"
                >
                  <option value="user">{t('shareModal.targetUser')}</option>
                  <option value="workspace">{t('shareModal.targetWorkspace')}</option>
                </select>

                {targetType === 'user' ? (
                  <input
                    type="email"
                    required
                    value={targetEmail}
                    onChange={(e) => setTargetEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="min-w-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-sky-500 sm:col-span-8"
                  />
                ) : (
                  <select
                    value={targetWorkspaceId}
                    onChange={(e) => setTargetWorkspaceId(e.target.value)}
                    className="min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs sm:col-span-8"
                  >
                    {shareableWorkspaces.length === 0 ? (
                      <option value="">{t('shareModal.noOtherWorkspaces')}</option>
                    ) : (
                      shareableWorkspaces.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'viewer' | 'editor')}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="viewer">{t('common.viewOnly')}</option>
                  <option value="editor">{t('common.canEdit')}</option>
                </select>

                <button
                  type="submit"
                  disabled={targetType === 'workspace' && !targetWorkspaceId}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('shareModal.addShare')}
                </button>
              </div>
            </form>

            <div className="mt-3 space-y-1.5 text-xs">
              {shares.length === 0 ? (
                <p className="text-slate-400">{t('shareModal.noShares')}</p>
              ) : (
                shares.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="mr-1.5 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                        {s.target_type === 'user'
                          ? t('shareModal.typeUser')
                          : t('shareModal.typeWorkspace')}
                      </span>
                      <span className="truncate font-medium text-slate-800">{s.target_label}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 font-medium ${
                          s.role === 'editor'
                            ? 'bg-sky-100 text-sky-700'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {s.role === 'editor' ? t('common.canEdit') : t('common.viewOnlyShort')}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleRemoveShare(s.id)}
                        title={t('shareModal.removeShare')}
                        aria-label={t('shareModal.removeShare')}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {message && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
        )}
      </div>
    </div>
  );
}
