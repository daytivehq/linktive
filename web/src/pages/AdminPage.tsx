import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Copy,
  Database,
  Download,
  HardDrive,
  Link2,
  Play,
  Plus,
  Shield,
  ShieldOff,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { api } from '../api/client';
import { ConfirmModal } from '../components/ConfirmModal';
import type {
  AdminUsage,
  ArchivePolicy,
  AutoBackupSettings,
  BackupFileInfo,
  User,
  UserInvite,
} from '../types/bookmark';
import { copyToClipboard } from '../utils/clipboard';
import { formatBytes } from '../utils/format';

interface AdminPageProps {
  currentUser: User;
  onBack: () => void;
}

export function AdminPage({ currentUser, onBack }: AdminPageProps) {
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<UserInvite[]>([]);
  const [expiresHours, setExpiresHours] = useState(72);
  const [backupSettings, setBackupSettings] = useState<AutoBackupSettings>({
    enabled: true,
    interval_hours: 24,
    keep_count: 7,
  });
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [adminUsage, setAdminUsage] = useState<AdminUsage | null>(null);
  const [archivePolicy, setArchivePolicy] = useState<ArchivePolicy>({
    limit_enabled: true,
    max_asset_mb: 10,
    max_bookmark_mb: 30,
  });
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [cleaningAssets, setCleaningAssets] = useState(false);
  const [runningBackup, setRunningBackup] = useState(false);
  const [deleteTargetBackup, setDeleteTargetBackup] = useState<BackupFileInfo | null>(null);
  const [deleteTargetUser, setDeleteTargetUser] = useState<User | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentUser.is_admin) return;
    void Promise.all([
      api.adminGetSettings(),
      api.adminListUsers(),
      api.adminListInvites(),
      api.adminListBackups(),
      api.adminGetUsage(),
    ])
      .then(([cfg, usersRes, invitesRes, backupRes, usageRes]) => {
        setRegistrationEnabled(cfg.registration_enabled);
        setUsers(usersRes.items);
        setInvites(invitesRes.items);
        setBackupSettings(backupRes.settings);
        setBackups(backupRes.items);
        setAdminUsage(usageRes);
        setArchivePolicy(usageRes.archive_policy);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '관리자 정보를 불러오지 못했습니다.');
      });
  }, [currentUser.is_admin]);

  if (!currentUser.is_admin) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm font-medium text-slate-700">관리자 권한이 필요합니다.</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white"
        >
          돌아가기
        </button>
      </div>
    );
  }

  const handleToggleRegistration = async () => {
    setError('');
    setMessage('');
    try {
      const res = await api.adminUpdateSettings(!registrationEnabled);
      setRegistrationEnabled(res.registration_enabled);
      setMessage(
        res.registration_enabled
          ? '누구나 회원가입할 수 있도록 허용했습니다.'
          : '신규 공개 회원가입을 비활성화했습니다. (초대 링크로만 가입 가능)',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '설정 변경 실패');
    }
  };

  const handleToggleUserAdmin = async (u: User) => {
    setError('');
    setMessage('');
    try {
      const updated = await api.adminUpdateUser(u.id, !u.is_admin);
      setUsers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(`${updated.name} 님의 권한을 변경했습니다.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '권한 변경 실패');
    }
  };

  const handleCreateInvite = async () => {
    setError('');
    setMessage('');
    try {
      const inv = await api.adminCreateInvite(expiresHours);
      setInvites((prev) => [inv, ...prev]);
      const url = `${window.location.origin}/?invite=${inv.token}`;
      const ok = await copyToClipboard(url);
      setMessage(
        ok ? '초대 링크를 생성하고 클립보드에 복사했습니다.' : '초대 링크를 생성했습니다.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '초대 링크 생성 실패');
    }
  };

  const handleDeleteInvite = async (inviteID: string) => {
    setError('');
    try {
      await api.adminDeleteInvite(inviteID);
      setInvites((prev) => prev.filter((i) => i.id !== inviteID));
    } catch (err) {
      setError(err instanceof Error ? err.message : '초대 링크 삭제 실패');
    }
  };

  const handleSaveBackupSettings = async (next: AutoBackupSettings) => {
    setError('');
    setMessage('');
    try {
      const updated = await api.adminUpdateBackupSettings({
        enabled: next.enabled,
        interval_hours: next.interval_hours,
        keep_count: next.keep_count,
      });
      setBackupSettings(updated);
      setMessage('자동 백업 설정을 저장했습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '백업 설정 저장 실패');
    }
  };

  const handleRunBackupNow = async () => {
    setError('');
    setMessage('');
    setRunningBackup(true);
    try {
      const info = await api.adminRunBackup();
      const refreshed = await api.adminListBackups();
      setBackupSettings(refreshed.settings);
      setBackups(refreshed.items);
      setMessage(`백업 파일(${info.filename})을 생성했습니다.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '백업 실행 실패');
    } finally {
      setRunningBackup(false);
    }
  };

  const handleSaveArchivePolicy = async () => {
    setError('');
    setMessage('');
    setSavingPolicy(true);
    try {
      const updated = await api.adminUpdateArchivePolicy(archivePolicy);
      setArchivePolicy(updated);
      setAdminUsage((prev) => (prev ? { ...prev, archive_policy: updated } : prev));
      setMessage('아카이빙 용량 안전장치 설정을 저장했습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '안전장치 설정 저장 실패');
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleCleanupOrphanAssets = async () => {
    setError('');
    setMessage('');
    setCleaningAssets(true);
    try {
      const res = await api.adminCleanupOrphanAssets();
      const refreshed = await api.adminGetUsage();
      setAdminUsage(refreshed);
      setMessage(
        `고아 에셋 ${res.removed_files}개 파일(${formatBytes(res.freed_bytes)})을 정리했습니다.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '고아 에셋 정리 실패');
    } finally {
      setCleaningAssets(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>북마크로 돌아가기</span>
        </button>
        <h1 className="text-xl font-bold text-slate-900">관리자 설정</h1>
        <p className="mt-1 text-sm text-slate-500">
          회원가입 정책, 사용자 관리 및 초대 링크 발급을 관리합니다.
        </p>
      </div>

      {message && (
        <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-xs text-emerald-700">{message}</p>
      )}
      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-xs text-rose-700">{error}</p>
      )}

      {/* Registration Policy */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">신규 회원가입 허용</div>
            <p className="mt-0.5 text-xs text-slate-500">
              비활성화하면 로그인 화면의 공개 회원가입이 차단되고 관리자 초대 링크로만 가입할 수
              있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleToggleRegistration()}
            className={`rounded-lg px-4 py-2 text-xs font-semibold ${
              registrationEnabled
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            {registrationEnabled ? '허용 중' : '비활성화됨'}
          </button>
        </div>
      </section>

      {/* Server Usage & Archive Policy */}
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <HardDrive className="h-4 w-4 text-sky-600" />
              <span>시스템 사용량 및 아카이빙 안전장치</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              전체 DB·에셋·백업 디스크 사용량과 클리핑 이미지/북마크 용량 상한을 관리합니다.
            </p>
          </div>
          <button
            type="button"
            disabled={cleaningAssets}
            onClick={() => void handleCleanupOrphanAssets()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{cleaningAssets ? '정리 중...' : '고아 에셋 정리'}</span>
          </button>
        </div>

        {adminUsage && (
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3.5">
              <div className="text-[11px] text-slate-500">전체 데이터</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {adminUsage.total_bookmarks.toLocaleString()} 북마크
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                사용자 {adminUsage.total_users} · 소속 {adminUsage.total_workspaces} · 태그{' '}
                {adminUsage.total_tags}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3.5">
              <div className="text-[11px] text-slate-500">SQLite DB</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {formatBytes(adminUsage.db_size_bytes)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                아카이빙 {adminUsage.total_archived.toLocaleString()}건 포함
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3.5">
              <div className="text-[11px] text-slate-500">아카이빙 에셋 (/data/assets)</div>
              <div className="mt-1 text-lg font-bold text-sky-700">
                {formatBytes(adminUsage.assets_size_bytes)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {adminUsage.assets_file_count.toLocaleString()}개 파일
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3.5">
              <div className="text-[11px] text-slate-500">백업 (/data/backups)</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {formatBytes(adminUsage.backups_size_bytes)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {adminUsage.backups_file_count}개 파일
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={archivePolicy.limit_enabled}
                onChange={(e) =>
                  setArchivePolicy((prev) => ({ ...prev, limit_enabled: e.target.checked }))
                }
              />
              <span>아카이빙 용량·파일 크기 안전장치 활성화 (기본: 10MB / 30MB)</span>
            </label>
            <button
              type="button"
              disabled={savingPolicy}
              onClick={() => void handleSaveArchivePolicy()}
              className="rounded-lg bg-sky-600 px-3.5 py-1.5 font-medium text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {savingPolicy ? '저장 중...' : '안전장치 설정 저장'}
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-slate-600">이미지 1개 최대 크기 (MB)</span>
              <input
                type="number"
                min={1}
                max={1024}
                disabled={!archivePolicy.limit_enabled}
                value={archivePolicy.max_asset_mb}
                onChange={(e) =>
                  setArchivePolicy((prev) => ({
                    ...prev,
                    max_asset_mb: Math.max(1, Number(e.target.value) || 1),
                  }))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-sky-500 disabled:bg-slate-100 disabled:text-slate-400"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-600">북마크 1건 총 에셋 제한 (MB)</span>
              <input
                type="number"
                min={1}
                max={4096}
                disabled={!archivePolicy.limit_enabled}
                value={archivePolicy.max_bookmark_mb}
                onChange={(e) =>
                  setArchivePolicy((prev) => ({
                    ...prev,
                    max_bookmark_mb: Math.max(1, Number(e.target.value) || 1),
                  }))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-sky-500 disabled:bg-slate-100 disabled:text-slate-400"
              />
            </label>
          </div>
        </div>
      </section>

      {/* Invite Links */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-sky-600" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">사용자 초대 링크</h2>
              <p className="text-xs text-slate-500">
                1회용 초대 링크를 생성해 가족이나 지인을 초대할 수 있습니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={expiresHours}
              onChange={(e) => setExpiresHours(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
            >
              <option value={24}>24시간 유효</option>
              <option value={72}>3일 유효</option>
              <option value={168}>7일 유효</option>
            </select>
            <button
              type="button"
              onClick={() => void handleCreateInvite()}
              className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>초대 링크 생성</span>
            </button>
          </div>
        </div>

        <div className="space-y-2 text-xs">
          {invites.length === 0 ? (
            <p className="text-slate-400">생성된 초대 링크가 없습니다.</p>
          ) : (
            invites.map((inv) => {
              const inviteUrl = `${window.location.origin}/?invite=${inv.token}`;
              const isUsed = Boolean(inv.used_at);
              const isExpired = !isUsed && new Date(inv.expires_at).getTime() <= Date.now();
              return (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-slate-700">{inviteUrl}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {isUsed
                        ? `사용됨 (${inv.used_by_email || inv.used_by})`
                        : isExpired
                          ? '만료됨'
                          : `만료: ${inv.expires_at.slice(0, 16).replace('T', ' ')} UTC`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!isUsed && !isExpired && (
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await copyToClipboard(inviteUrl);
                          if (ok) setMessage('초대 링크를 복사했습니다.');
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 font-medium text-sky-600 shadow-2xs hover:bg-sky-50"
                      >
                        <Copy className="h-3 w-3" />
                        복사
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDeleteInvite(inv.id)}
                      title="초대 링크 삭제"
                      aria-label="초대 링크 삭제"
                      className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Users Management */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-600" />
          <h2 className="text-sm font-semibold text-slate-900">
            사용자 관리 ({users.length}명)
          </h2>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3.5 py-2.5 font-semibold">닉네임</th>
                <th className="px-3.5 py-2.5 font-semibold">이메일</th>
                <th className="px-3.5 py-2.5 font-semibold">권한</th>
                <th className="px-3.5 py-2.5 font-semibold">2FA</th>
                <th className="px-3.5 py-2.5 font-semibold">가입일</th>
                <th className="px-3.5 py-2.5 text-right font-semibold">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const isSelf = u.id === currentUser.id;
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-3.5 py-2.5 font-medium text-slate-900">
                      {u.name}{' '}
                      {isSelf && (
                        <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700">
                          나
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-600">{u.email}</td>
                    <td className="px-3.5 py-2.5">
                      <span
                        className={`rounded px-2 py-0.5 font-medium ${
                          u.is_admin
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {u.is_admin ? '관리자' : '일반'}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-500">
                      {u.totp_enabled ? '사용 중' : '미사용'}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-400">{u.created_at.slice(0, 10)}</td>
                    <td className="px-3.5 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleToggleUserAdmin(u)}
                          title={u.is_admin ? '관리자 해제' : '관리자 지정'}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100"
                        >
                          {u.is_admin ? (
                            <>
                              <ShieldOff className="h-3 w-3" />
                              <span>권한 해제</span>
                            </>
                          ) : (
                            <>
                              <Shield className="h-3 w-3 text-indigo-600" />
                              <span>관리자 지정</span>
                            </>
                          )}
                        </button>
                        {!isSelf && (
                          <button
                            type="button"
                            onClick={() => setDeleteTargetUser(u)}
                            title="사용자 삭제"
                            className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <UserCheck className="h-3.5 w-3.5" />
          <span>최소 1명의 관리자는 항상 유지됩니다.</span>
        </div>
      </section>

      {/* Auto Backups */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-emerald-600" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">자동 데이터베이스 백업</h2>
              <p className="text-xs text-slate-500">
                서버의 SQLite DB 스냅샷을 <code className="text-slate-700">/data/backups</code>에
                자동으로 저장하고 보관 개수에 따라 정리합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={runningBackup}
            onClick={() => void handleRunBackupNow()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            <span>{runningBackup ? '백업 중...' : '지금 백업 실행'}</span>
          </button>
        </div>

        <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs sm:grid-cols-3">
          <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-700">
            <input
              type="checkbox"
              checked={backupSettings.enabled}
              onChange={(e) =>
                void handleSaveBackupSettings({ ...backupSettings, enabled: e.target.checked })
              }
            />
            <span>자동 백업 활성화</span>
          </label>

          <label className="flex items-center gap-2 text-slate-600">
            <span className="shrink-0">백업 주기</span>
            <select
              value={backupSettings.interval_hours}
              onChange={(e) =>
                void handleSaveBackupSettings({
                  ...backupSettings,
                  interval_hours: Number(e.target.value),
                })
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
            >
              <option value={6}>6시간마다</option>
              <option value={12}>12시간마다</option>
              <option value={24}>24시간(매일)</option>
              <option value={168}>7일(매주)</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-slate-600">
            <span className="shrink-0">최대 보관</span>
            <select
              value={backupSettings.keep_count}
              onChange={(e) =>
                void handleSaveBackupSettings({
                  ...backupSettings,
                  keep_count: Number(e.target.value),
                })
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
            >
              <option value={3}>최근 3개</option>
              <option value={7}>최근 7개</option>
              <option value={14}>최근 14개</option>
              <option value={30}>최근 30개</option>
            </select>
          </label>
        </div>

        {backupSettings.last_run_at && (
          <p className="text-[11px] text-slate-400">
            최근 백업 시각: {new Date(backupSettings.last_run_at).toLocaleString('ko-KR')}
          </p>
        )}

        <div className="space-y-2 text-xs">
          {backups.length === 0 ? (
            <p className="text-slate-400">저장된 백업 파일이 없습니다.</p>
          ) : (
            backups.map((b) => (
              <div
                key={b.filename}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <HardDrive className="h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <div className="truncate font-mono font-medium text-slate-800">
                      {b.filename}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {formatBytes(b.size_bytes)} · {new Date(b.created_at).toLocaleString('ko-KR')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <a
                    href={api.adminDownloadBackupUrl(b.filename)}
                    download={b.filename}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <Download className="h-3 w-3" />
                    <span>다운로드</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setDeleteTargetBackup(b)}
                    title="백업 파일 삭제"
                    aria-label="백업 파일 삭제"
                    className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {deleteTargetBackup && (
        <ConfirmModal
          title="백업 파일 삭제"
          message={`"${deleteTargetBackup.filename}" 백업 파일을 삭제할까요?`}
          confirmLabel="삭제"
          onClose={() => setDeleteTargetBackup(null)}
          onConfirm={async () => {
            await api.adminDeleteBackup(deleteTargetBackup.filename);
            setBackups((prev) => prev.filter((item) => item.filename !== deleteTargetBackup.filename));
            setMessage(`${deleteTargetBackup.filename} 백업을 삭제했습니다.`);
          }}
        />
      )}

      {deleteTargetUser && (
        <ConfirmModal
          title="사용자 삭제"
          message={`"${deleteTargetUser.name} (${deleteTargetUser.email})" 계정을 삭제할까요? 이 사용자가 소유한 개인 소속과 북마크도 함께 삭제됩니다.`}
          confirmLabel="삭제"
          onClose={() => setDeleteTargetUser(null)}
          onConfirm={async () => {
            await api.adminDeleteUser(deleteTargetUser.id);
            setUsers((prev) => prev.filter((item) => item.id !== deleteTargetUser.id));
            setMessage(`${deleteTargetUser.email} 계정을 삭제했습니다.`);
          }}
        />
      )}
    </div>
  );
}
