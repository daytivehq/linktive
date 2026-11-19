import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import type {
  APIKeyItem,
  ClickAction,
  MemberRole,
  User,
  UserSettings,
  Workspace,
  WorkspaceMember,
} from '../types/bookmark';

interface SettingsPageProps {
  user: User;
  settings: UserSettings;
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  onBack: () => void;
  onUpdateSettings: (next: UserSettings) => Promise<void>;
  onWorkspaceCreated: (ws: Workspace) => void;
  onWorkspaceUpdated: (ws: Workspace) => void;
  onWorkspaceDeleted: (wsID: string) => void;
  onSelectWorkspace: (wsID: string) => void;
  onLogout: () => Promise<void>;
}

export function SettingsPage({
  user,
  settings,
  workspaces,
  activeWorkspace,
  onBack,
  onUpdateSettings,
  onWorkspaceCreated,
  onWorkspaceUpdated,
  onWorkspaceDeleted,
  onSelectWorkspace,
  onLogout,
}: SettingsPageProps) {
  const [tab, setTab] = useState<'general' | 'workspaces' | 'apikeys'>('general');
  const [clickAction, setClickAction] = useState<ClickAction>(settings.click_action);

  const [newWsName, setNewWsName] = useState('');
  const [editingWsId, setEditingWsId] = useState<string | null>(null);
  const [editingWsName, setEditingWsName] = useState('');
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MemberRole>('editor');

  const [apiKeys, setApiKeys] = useState<APIKeyItem[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdToken, setCreatedToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setClickAction(settings.click_action);
  }, [settings.click_action]);

  useEffect(() => {
    if (tab === 'workspaces') {
      void api
        .listMembers(activeWorkspace.id)
        .then((res) => setMembers(res.items))
        .catch(() => setMembers([]));
    } else if (tab === 'apikeys') {
      void api
        .listAPIKeys()
        .then((res) => setApiKeys(res.items))
        .catch(() => setApiKeys([]));
    }
  }, [tab, activeWorkspace.id]);

  const handleSaveGeneral = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await onUpdateSettings({ ...settings, click_action: clickAction });
      setMessage('설정이 저장되었습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '설정 저장 실패');
    }
  };

  const handleCreateWorkspace = async (e: FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    setError('');
    setMessage('');
    try {
      const ws = await api.createWorkspace(newWsName.trim());
      onWorkspaceCreated(ws);
      setNewWsName('');
      setMessage(`공유 소속 "${ws.name}"이 생성되었습니다.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '소속 생성 실패');
    }
  };

  const handleRenameWorkspace = async (wsId: string) => {
    const trimmed = editingWsName.trim();
    if (!trimmed) return;
    setError('');
    setMessage('');
    try {
      const updated = await api.updateWorkspace(wsId, trimmed);
      onWorkspaceUpdated(updated);
      setEditingWsId(null);
      setMessage('소속 이름을 수정했습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '소속 이름 수정 실패');
    }
  };

  const handleDeleteWorkspace = async (ws: Workspace) => {
    if (
      !window.confirm(
        `"${ws.name}" 소속을 삭제할까요? 이 소속에 저장된 컬렉션과 북마크도 함께 삭제됩니다.`,
      )
    ) {
      return;
    }
    setError('');
    setMessage('');
    try {
      await api.deleteWorkspace(ws.id);
      onWorkspaceDeleted(ws.id);
      setMessage(`"${ws.name}" 소속을 삭제했습니다.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '소속 삭제 실패');
    }
  };

  const handleInviteMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setError('');
    setMessage('');
    try {
      const m = await api.addMember(activeWorkspace.id, inviteEmail.trim(), inviteRole);
      setMembers((prev) => [...prev.filter((x) => x.user_id !== m.user_id), m]);
      setInviteEmail('');
      setMessage(`${m.email} 님을 추가했습니다.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '멤버 추가 실패');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setError('');
    try {
      await api.removeMember(activeWorkspace.id, userId);
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '멤버 제거 실패');
    }
  };

  const handleCreateKey = async (e: FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setError('');
    try {
      const res = await api.createAPIKey(newKeyName.trim());
      setApiKeys((prev) => [res.api_key, ...prev]);
      setCreatedToken(res.token);
      setNewKeyName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API 키 생성 실패');
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    try {
      await api.deleteAPIKey(keyId);
      setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API 키 삭제 실패');
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>북마크로 돌아가기</span>
          </button>
          <h1 className="text-xl font-bold text-slate-900">설정 및 계정</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {user.name} ({user.email})
          </p>
        </div>

        <button
          type="button"
          onClick={() => void onLogout()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>로그아웃</span>
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-5 flex gap-4 border-b border-slate-200 text-sm">
          <button
            type="button"
            onClick={() => setTab('general')}
            className={`border-b-2 pb-2.5 font-medium ${
              tab === 'general' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-500'
            }`}
          >
            동작 설정
          </button>
          <button
            type="button"
            onClick={() => setTab('workspaces')}
            className={`inline-flex items-center gap-1.5 border-b-2 pb-2.5 font-medium ${
              tab === 'workspaces' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-500'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>소속·공유</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('apikeys')}
            className={`inline-flex items-center gap-1.5 border-b-2 pb-2.5 font-medium ${
              tab === 'apikeys' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-500'
            }`}
          >
            <KeyRound className="h-4 w-4" />
            <span>API 키</span>
          </button>
        </div>

        {tab === 'general' && (
          <form onSubmit={handleSaveGeneral} className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-700">
                북마크 클릭 시 기본 동작
              </label>
              <div className="space-y-2 text-sm">
                {(
                  [
                    ['new_tab', '새 창(새 탭)으로 원본 URL 열기'],
                    ['current_tab', '현재 창에서 원본 URL 열기'],
                    ['detail_panel', '북마크 세부정보 패널 열기'],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3.5 py-2.5 hover:bg-slate-50"
                  >
                    <input
                      type="radio"
                      name="click_action"
                      checked={clickAction === value}
                      onChange={() => setClickAction(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
              >
                설정 저장
              </button>
            </div>
          </form>
        )}

        {tab === 'workspaces' && (
          <div className="space-y-5">
            <form onSubmit={handleCreateWorkspace} className="flex gap-2">
              <input
                type="text"
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                placeholder="새 공유 소속 이름 (예: 우리 가족)"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-sky-700"
              >
                <Plus className="h-4 w-4" />
                <span>소속 만들기</span>
              </button>
            </form>

            {/* Workspace List with Rename / Delete */}
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2.5 text-xs font-semibold text-slate-600">내 소속 목록</div>
              <div className="space-y-1.5 text-sm">
                {workspaces.map((ws) => {
                  const isEditing = editingWsId === ws.id;
                  const isActive = ws.id === activeWorkspace.id;
                  return (
                    <div
                      key={ws.id}
                      className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 ${
                        isActive ? 'bg-sky-50 ring-1 ring-sky-200' : 'bg-slate-50'
                      }`}
                    >
                      {isEditing ? (
                        <div className="flex flex-1 items-center gap-2">
                          <input
                            type="text"
                            autoFocus
                            value={editingWsName}
                            onChange={(e) => setEditingWsName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleRenameWorkspace(ws.id);
                              if (e.key === 'Escape') setEditingWsId(null);
                            }}
                            className="flex-1 rounded border border-sky-400 bg-white px-2.5 py-1 text-sm outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => void handleRenameWorkspace(ws.id)}
                            className="rounded bg-sky-600 p-1 text-white"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingWsId(null)}
                            className="rounded p-1 text-slate-400 hover:bg-white"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => onSelectWorkspace(ws.id)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <span className="truncate font-medium text-slate-900">{ws.name}</span>
                            <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-500">
                              {ws.type === 'personal' ? '개인' : '공유'}
                            </span>
                            <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-500">
                              {ws.role}
                            </span>
                          </button>

                          {ws.role === 'owner' && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingWsId(ws.id);
                                  setEditingWsName(ws.name);
                                }}
                                title="소속 이름 수정"
                                className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {ws.type === 'shared' && (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteWorkspace(ws)}
                                  title="소속 삭제"
                                  className="rounded p-1 text-slate-400 hover:bg-white hover:text-rose-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Active Workspace Members */}
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2.5 text-xs font-semibold text-slate-600">
                선택된 소속 멤버: {activeWorkspace.name}
              </div>
              <div className="space-y-1.5 text-sm">
                {members.map((m) => (
                  <div
                    key={m.user_id}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <div>
                      <span className="font-medium">{m.name}</span>{' '}
                      <span className="text-xs text-slate-500">({m.email})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-white px-2 py-0.5 text-xs text-slate-600">
                        {m.role}
                      </span>
                      {activeWorkspace.role === 'owner' && m.role !== 'owner' && (
                        <button
                          type="button"
                          onClick={() => void handleRemoveMember(m.user_id)}
                          className="text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {activeWorkspace.role === 'owner' && activeWorkspace.type === 'shared' && (
                <form onSubmit={handleInviteMember} className="mt-3 flex gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="가입된 사용자 이메일 입력"
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-sky-500"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as MemberRole)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                  >
                    <option value="editor">편집자</option>
                    <option value="viewer">열람자</option>
                  </select>
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-800 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
                  >
                    초대
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {tab === 'apikeys' && (
          <div className="space-y-4">
            <form onSubmit={handleCreateKey} className="flex gap-2">
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="키 이름 (예: Chrome 확장, n8n)"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
              >
                발급
              </button>
            </form>

            {createdToken && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                <div className="mb-1 font-semibold">
                  발급된 API 토큰 (지금 한 번만 표시됩니다):
                </div>
                <div className="flex items-center justify-between gap-2 rounded bg-white px-2.5 py-1.5 font-mono">
                  <span className="truncate">{createdToken}</span>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(createdToken)}
                    className="inline-flex shrink-0 items-center gap-1 text-sky-600"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    복사
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1.5 text-sm">
              {apiKeys.length === 0 ? (
                <p className="text-xs text-slate-400">발급된 API 키가 없습니다.</p>
              ) : (
                apiKeys.map((k) => (
                  <div
                    key={k.id}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2.5"
                  >
                    <div>
                      <div className="font-medium">{k.name}</div>
                      <div className="text-xs text-slate-400">생성: {k.created_at.slice(0, 10)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteKey(k.id)}
                      className="rounded p-1 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {message && (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
        )}
      </div>
    </div>
  );
}
