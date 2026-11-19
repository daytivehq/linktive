import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Database,
  Download,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  Upload,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { ConfirmModal } from '../components/ConfirmModal';
import type {
  APIKeyItem,
  ClickAction,
  MemberRole,
  User,
  UserSettings,
  Workspace,
  WorkspaceMember,
} from '../types/bookmark';
import { copyToClipboard } from '../utils/clipboard';

interface SettingsPageProps {
  user: User;
  settings: UserSettings;
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  onBack: () => void;
  onOpenApiDocs: () => void;
  onOpenAdmin: () => void;
  onUserUpdated: (user: User) => void;
  onUpdateSettings: (next: UserSettings) => Promise<void>;
  onWorkspaceCreated: (ws: Workspace) => void;
  onWorkspaceUpdated: (ws: Workspace) => void;
  onWorkspaceDeleted: (wsID: string) => void;
  onSelectWorkspace: (wsID: string) => void;
  onDataImported: () => Promise<void>;
  onLogout: () => Promise<void>;
}

export function SettingsPage({
  user,
  settings,
  workspaces,
  activeWorkspace,
  onBack,
  onOpenApiDocs,
  onOpenAdmin,
  onUserUpdated,
  onUpdateSettings,
  onWorkspaceCreated,
  onWorkspaceUpdated,
  onWorkspaceDeleted,
  onSelectWorkspace,
  onDataImported,
  onLogout,
}: SettingsPageProps) {
  const [tab, setTab] = useState<'general' | 'account' | 'workspaces' | 'transfer' | 'apikeys'>(
    'general',
  );
  const [clickAction, setClickAction] = useState<ClickAction>(settings.click_action);

  // Account & Security state
  const [profileName, setProfileName] = useState(user.name);
  const [profileEmail, setProfileEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpQrDataUrl, setTotpQrDataUrl] = useState('');
  const [totpEnableCode, setTotpEnableCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');

  // Workspaces state
  const [newWsName, setNewWsName] = useState('');
  const [editingWsId, setEditingWsId] = useState<string | null>(null);
  const [editingWsName, setEditingWsName] = useState('');
  const [deleteTargetWs, setDeleteTargetWs] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MemberRole>('editor');

  // API keys state
  const [apiKeys, setApiKeys] = useState<APIKeyItem[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdToken, setCreatedToken] = useState('');

  // Import/Export state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFormat, setImportFormat] = useState('auto');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importing, setImporting] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setClickAction(settings.click_action);
  }, [settings.click_action]);

  useEffect(() => {
    setProfileName(user.name);
    setProfileEmail(user.email);
  }, [user.name, user.email]);

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

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await api.updateProfile({
        name: profileName.trim(),
        email: profileEmail.trim(),
      });
      onUserUpdated(res.user);
      setMessage('사용자 정보를 수정했습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '사용자 정보 수정 실패');
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.updatePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setMessage('비밀번호를 변경했습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '비밀번호 변경 실패');
    }
  };

  const handleStart2FASetup = async () => {
    setError('');
    setMessage('');
    try {
      const res = await api.setup2FA();
      setTotpSecret(res.secret);
      const qrUrl = await QRCode.toDataURL(res.otpauth_url, { width: 180, margin: 1 });
      setTotpQrDataUrl(qrUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : '2FA 설정 준비 실패');
    }
  };

  const handleEnable2FA = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await api.enable2FA(totpEnableCode.trim());
      onUserUpdated(res.user);
      setTotpSecret('');
      setTotpQrDataUrl('');
      setTotpEnableCode('');
      setMessage('2단계 인증(2FA)이 활성화되었습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '2FA 활성화 실패');
    }
  };

  const handleDisable2FA = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await api.disable2FA(disablePassword, disableCode.trim());
      onUserUpdated(res.user);
      setDisablePassword('');
      setDisableCode('');
      setMessage('2단계 인증(2FA)이 해제되었습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '2FA 해제 실패');
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

  const handleImportSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!importFile) {
      setError('가져올 파일을 선택해 주세요.');
      return;
    }
    setError('');
    setMessage('');
    setImporting(true);
    try {
      const res = await api.importWorkspace(
        activeWorkspace.id,
        importFile,
        importFormat,
        skipDuplicates,
      );
      setImportFile(null);
      await onDataImported();
      setMessage(
        `[${res.format}] 가져오기 완료 — 북마크 ${res.imported}개 추가, ${res.skipped}개 중복 건너뜀, 컬렉션 ${res.created_collections}개 생성 (실패 ${res.failed}개)`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '가져오기에 실패했습니다.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
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
            {user.is_admin && (
              <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-700">
                관리자
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {user.is_admin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
            >
              <Shield className="h-3.5 w-3.5" />
              <span>관리자 설정</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void onLogout()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>로그아웃</span>
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-5 flex flex-wrap gap-4 border-b border-slate-200 text-sm">
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
            onClick={() => setTab('account')}
            className={`inline-flex items-center gap-1.5 border-b-2 pb-2.5 font-medium ${
              tab === 'account' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-500'
            }`}
          >
            <UserIcon className="h-4 w-4" />
            <span>내 정보 · 보안</span>
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
            onClick={() => setTab('transfer')}
            className={`inline-flex items-center gap-1.5 border-b-2 pb-2.5 font-medium ${
              tab === 'transfer' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-500'
            }`}
          >
            <Database className="h-4 w-4" />
            <span>가져오기·내보내기</span>
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

        {tab === 'account' && (
          <div className="space-y-6">
            {/* Profile */}
            <form onSubmit={handleSaveProfile} className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-800">기본 정보 수정</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">닉네임</label>
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">이메일</label>
                  <input
                    type="email"
                    required
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
                >
                  정보 저장
                </button>
              </div>
            </form>

            {/* Password */}
            <form onSubmit={handleChangePassword} className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-800">비밀번호 변경</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    현재 비밀번호
                  </label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    새 비밀번호 (6자 이상)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
                >
                  비밀번호 변경
                </button>
              </div>
            </form>

            {/* 2FA TOTP */}
            <div className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck
                    className={`h-4 w-4 ${user.totp_enabled ? 'text-emerald-600' : 'text-slate-400'}`}
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">
                      2단계 인증 (TOTP 2FA)
                    </div>
                    <div className="text-xs text-slate-500">
                      1Password, Google Authenticator 등 OTP 앱으로 로그인을 보호합니다.
                    </div>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    user.totp_enabled
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {user.totp_enabled ? '사용 중' : '미사용'}
                </span>
              </div>

              {!user.totp_enabled ? (
                !totpSecret ? (
                  <button
                    type="button"
                    onClick={() => void handleStart2FASetup()}
                    className="rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
                  >
                    2FA 설정 시작
                  </button>
                ) : (
                  <form onSubmit={handleEnable2FA} className="space-y-3 rounded-lg bg-slate-50 p-3.5">
                    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                      {totpQrDataUrl && (
                        <img
                          src={totpQrDataUrl}
                          alt="2FA QR Code"
                          className="h-36 w-36 rounded-lg border border-slate-200 bg-white p-1"
                        />
                      )}
                      <div className="space-y-2 text-xs text-slate-600">
                        <p>인증 앱으로 QR 코드를 스캔하거나 아래 시크릿 키를 직접 입력하세요.</p>
                        <div className="flex items-center gap-2 rounded bg-white px-2.5 py-1.5 font-mono text-slate-800">
                          <span>{totpSecret}</span>
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await copyToClipboard(totpSecret);
                              if (ok) setMessage('2FA 시크릿 키를 복사했습니다.');
                            }}
                            className="text-sky-600 hover:underline"
                          >
                            복사
                          </button>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            required
                            maxLength={6}
                            value={totpEnableCode}
                            onChange={(e) => setTotpEnableCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="앱의 6자리 코드 입력"
                            className="w-40 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs outline-none focus:border-sky-500"
                          />
                          <button
                            type="submit"
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                          >
                            확인 후 활성화
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                )
              ) : (
                <form onSubmit={handleDisable2FA} className="space-y-2 rounded-lg bg-rose-50/50 p-3">
                  <div className="text-xs font-medium text-slate-700">2FA 해제 확인</div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="password"
                      required
                      value={disablePassword}
                      onChange={(e) => setDisablePassword(e.target.value)}
                      placeholder="현재 비밀번호"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-sky-500"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      maxLength={6}
                      value={disableCode}
                      onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="OTP 6자리 코드"
                      className="w-32 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs outline-none focus:border-sky-500"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                    >
                      2FA 해제
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
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
                                  onClick={() => setDeleteTargetWs(ws)}
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

        {tab === 'transfer' && (
          <div className="space-y-6">
            <section className="rounded-xl border border-slate-200 p-4">
              <div className="mb-1 text-sm font-semibold text-slate-800">
                내보내기 (현재 소속: {activeWorkspace.name})
              </div>
              <p className="mb-3 text-xs text-slate-500">
                전체 백업용 JSON 또는 브라우저·다른 서비스 호환용 HTML/CSV로 내려받을 수 있습니다.
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={api.exportWorkspaceUrl(activeWorkspace.id, 'json')}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Download className="h-3.5 w-3.5 text-sky-600" />
                  <span>linktive JSON 백업</span>
                </a>
                <a
                  href={api.exportWorkspaceUrl(activeWorkspace.id, 'html')}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-600" />
                  <span>표준 북마크 HTML</span>
                </a>
                <a
                  href={api.exportWorkspaceUrl(activeWorkspace.id, 'csv')}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Download className="h-3.5 w-3.5 text-indigo-600" />
                  <span>CSV (Excel/Raindrop 호환)</span>
                </a>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 p-4">
              <div className="mb-1 text-sm font-semibold text-slate-800">가져오기</div>
              <p className="mb-3 text-xs text-slate-500">
                linktive JSON, 브라우저/Raindrop HTML, Raindrop.io CSV, Linkwarden JSON, Karakeep
                JSON 파일을 지원합니다.
              </p>
              <form onSubmit={handleImportSubmit} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">파일 형식</label>
                    <select
                      value={importFormat}
                      onChange={(e) => setImportFormat(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                    >
                      <option value="auto">자동 감지 (추천)</option>
                      <option value="linktive_json">linktive JSON</option>
                      <option value="html">브라우저 / Raindrop HTML</option>
                      <option value="raindrop_csv">Raindrop.io CSV</option>
                      <option value="linkwarden_json">Linkwarden JSON</option>
                      <option value="karakeep_json">Karakeep JSON</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">파일 선택</label>
                    <input
                      type="file"
                      accept=".json,.html,.htm,.csv"
                      onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                      className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                    />
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                  />
                  <span>이미 저장된 동일 URL은 중복 건너뛰기</span>
                </label>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={importing || !importFile}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>{importing ? '가져오는 중...' : '가져오기 실행'}</span>
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {tab === 'apikeys' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs">
              <span className="text-slate-600">
                Bearer 토큰으로 REST API를 호출할 수 있습니다.
              </span>
              <button
                type="button"
                onClick={onOpenApiDocs}
                className="inline-flex items-center gap-1 font-medium text-sky-600 hover:underline"
              >
                <span>REST API 활용 매뉴얼</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

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
                    onClick={async () => {
                      const ok = await copyToClipboard(createdToken);
                      if (ok) setMessage('API 토큰을 복사했습니다.');
                      else setError('복사에 실패했습니다. 직접 선택해 복사해 주세요.');
                    }}
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

      {deleteTargetWs && (
        <ConfirmModal
          title="소속 삭제"
          message={`"${deleteTargetWs.name}" 소속을 삭제할까요? 이 소속에 저장된 컬렉션과 북마크도 함께 삭제됩니다.`}
          confirmLabel="삭제"
          onClose={() => setDeleteTargetWs(null)}
          onConfirm={async () => {
            await api.deleteWorkspace(deleteTargetWs.id);
            onWorkspaceDeleted(deleteTargetWs.id);
            setMessage(`"${deleteTargetWs.name}" 소속을 삭제했습니다.`);
          }}
        />
      )}
    </div>
  );
}
