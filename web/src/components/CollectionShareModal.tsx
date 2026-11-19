import { useEffect, useState, type FormEvent } from 'react';
import { Copy, ExternalLink, Globe, Plus, Trash2, Users, X } from 'lucide-react';
import { api } from '../api/client';
import type { Collection, CollectionShare, Workspace } from '../types/bookmark';

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

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
      setError(err instanceof Error ? err.message : '공개 설정 변경 실패');
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
      setMessage('공유 대상을 추가했습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '공유 추가 실패');
    }
  };

  const handleRemoveShare = async (shareId: string) => {
    setError('');
    try {
      await api.removeCollectionShare(workspaceId, col.id, shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '공유 해제 실패');
    }
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              &ldquo;{col.name}&rdquo; 공유 및 공개 설정
            </h2>
            <p className="text-xs text-slate-500">
              로그인 없는 공개 링크와 사용자/소속 공유를 따로 관리합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Public Link Section */}
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-sky-600" />
                <div>
                  <div className="text-sm font-semibold text-slate-800">공개 링크 (Public)</div>
                  <div className="text-xs text-slate-500">
                    링크를 아는 사람은 로그인 없이 이 컬렉션을 볼 수 있습니다.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleTogglePublic()}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  col.is_public
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {col.is_public ? '공개 중' : '비공개'}
              </button>
            </div>

            {col.is_public && publicUrl && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <span className="flex-1 truncate font-mono text-slate-700">{publicUrl}</span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(publicUrl);
                    setMessage('공개 링크를 복사했습니다.');
                  }}
                  className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 font-medium text-sky-600 shadow-2xs hover:bg-sky-50"
                >
                  <Copy className="h-3 w-3" />
                  복사
                </button>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 font-medium text-slate-600 shadow-2xs hover:bg-slate-100"
                >
                  <ExternalLink className="h-3 w-3" />
                  열기
                </a>
              </div>
            )}
          </section>

          {/* Shared Access Section */}
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-600" />
              <div>
                <div className="text-sm font-semibold text-slate-800">사용자 · 소속 공유</div>
                <div className="text-xs text-slate-500">
                  지정한 사용자나 다른 소속에 열람/편집 권한으로 공유합니다.
                </div>
              </div>
            </div>

            <form onSubmit={handleAddShare} className="space-y-2">
              <div className="flex gap-2">
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value as 'user' | 'workspace')}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="user">사용자 (이메일)</option>
                  <option value="workspace">소속 (Workspace)</option>
                </select>

                {targetType === 'user' ? (
                  <input
                    type="email"
                    required
                    value={targetEmail}
                    onChange={(e) => setTargetEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-sky-500"
                  />
                ) : (
                  <select
                    value={targetWorkspaceId}
                    onChange={(e) => setTargetWorkspaceId(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                  >
                    {shareableWorkspaces.length === 0 ? (
                      <option value="">공유 가능한 다른 소속 없음</option>
                    ) : (
                      shareableWorkspaces.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))
                    )}
                  </select>
                )}

                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'viewer' | 'editor')}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="viewer">열람만</option>
                  <option value="editor">편집 가능</option>
                </select>

                <button
                  type="submit"
                  disabled={targetType === 'workspace' && !targetWorkspaceId}
                  className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  공유
                </button>
              </div>
            </form>

            <div className="mt-3 space-y-1.5 text-xs">
              {shares.length === 0 ? (
                <p className="text-slate-400">아직 공유된 대상이 없습니다.</p>
              ) : (
                shares.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <div>
                      <span className="mr-1.5 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                        {s.target_type === 'user' ? '사용자' : '소속'}
                      </span>
                      <span className="font-medium text-slate-800">{s.target_label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 font-medium ${
                          s.role === 'editor'
                            ? 'bg-sky-100 text-sky-700'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {s.role === 'editor' ? '편집 가능' : '열람만'}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleRemoveShare(s.id)}
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
