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
import { useI18n } from '../i18n';
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
  const { dateLocale, t } = useI18n();
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<UserInvite[]>([]);
  const [expiresHours, setExpiresHours] = useState(72);
  const [backupSettings, setBackupSettings] = useState<AutoBackupSettings>({
    enabled: true,
    interval_hours: 24,
    keep_count: 7,
    include_assets: false,
  });
  const [backupSettingsReady, setBackupSettingsReady] = useState(false);
  const [savingBackupSettings, setSavingBackupSettings] = useState(false);
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
        setBackupSettingsReady(true);
        setBackups(backupRes.items);
        setAdminUsage(usageRes);
        setArchivePolicy(usageRes.archive_policy);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t('admin.loadFailed'));
      });
  }, [currentUser.is_admin, t]);

  if (!currentUser.is_admin) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm font-medium text-slate-700">{t('admin.required')}</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white"
        >
          {t('admin.back')}
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
      setMessage(res.registration_enabled ? t('admin.regEnabledMsg') : t('admin.regDisabledMsg'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'));
    }
  };

  const handleToggleUserAdmin = async (u: User) => {
    setError('');
    setMessage('');
    try {
      const updated = await api.adminUpdateUser(u.id, !u.is_admin);
      setUsers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(t('admin.userRoleUpdated', { name: updated.name }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.requestFailed'));
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
      setMessage(ok ? t('admin.inviteCopiedMsg') : t('admin.inviteCreatedMsg'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.requestFailed'));
    }
  };

  const handleDeleteInvite = async (id: string) => {
    try {
      await api.adminDeleteInvite(id);
      setInvites((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.requestFailed'));
    }
  };

  const handleSaveBackupSettings = async (next: AutoBackupSettings) => {
    setError('');
    setMessage('');
    setSavingBackupSettings(true);
    try {
      const updated = await api.adminUpdateBackupSettings({
        enabled: next.enabled,
        interval_hours: next.interval_hours,
        keep_count: next.keep_count,
        include_assets: next.include_assets,
      });
      setBackupSettings(updated);
      setMessage(t('admin.backupSettingsSaved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'));
    } finally {
      setSavingBackupSettings(false);
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
      setMessage(t('admin.backupDone', { filename: info.filename }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.requestFailed'));
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
      setMessage(t('admin.policySavedMsg'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'));
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
        t('admin.cleanupDone', {
          files: res.removed_files,
          size: formatBytes(res.freed_bytes),
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.requestFailed'));
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
          <span>{t('common.backToBookmarks')}</span>
        </button>
        <h1 className="text-xl font-bold text-slate-900">{t('admin.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('admin.subtitle')}</p>
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
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900">{t('admin.regTitle')}</div>
            <p className="mt-0.5 text-xs text-slate-500">{t('admin.regDesc')}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleToggleRegistration()}
            className={`shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold ${
              registrationEnabled
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            {registrationEnabled ? t('admin.regEnabled') : t('admin.regDisabled')}
          </button>
        </div>
      </section>

      {/* Server Usage & Archive Policy */}
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <HardDrive className="h-4 w-4 shrink-0 text-sky-600" />
              <span>{t('admin.usageTitle')}</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">{t('admin.usageDesc')}</p>
          </div>
          <button
            type="button"
            disabled={cleaningAssets}
            onClick={() => void handleCleanupOrphanAssets()}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{cleaningAssets ? t('admin.cleaningAssets') : t('admin.cleanupAssets')}</span>
          </button>
        </div>

        {adminUsage && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0 rounded-xl bg-slate-50 p-3.5">
              <div className="text-[11px] text-slate-500">{t('admin.statAllData')}</div>
              <div className="mt-1 truncate text-lg font-bold text-slate-900">
                {t('admin.statBookmarks', { count: adminUsage.total_bookmarks.toLocaleString() })}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {t('admin.statAllSub', {
                  users: adminUsage.total_users,
                  workspaces: adminUsage.total_workspaces,
                  tags: adminUsage.total_tags,
                })}
              </div>
            </div>
            <div className="min-w-0 rounded-xl bg-slate-50 p-3.5">
              <div className="text-[11px] text-slate-500">SQLite DB</div>
              <div className="mt-1 truncate text-lg font-bold text-slate-900">
                {formatBytes(adminUsage.db_size_bytes)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {t('admin.statDbSub', { count: adminUsage.total_archived.toLocaleString() })}
              </div>
            </div>
            <div className="min-w-0 rounded-xl bg-slate-50 p-3.5">
              <div className="text-[11px] text-slate-500">{t('admin.statAssets')}</div>
              <div className="mt-1 truncate text-lg font-bold text-sky-700">
                {formatBytes(adminUsage.assets_size_bytes)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {t('admin.fileCount', { count: adminUsage.assets_file_count.toLocaleString() })}
              </div>
            </div>
            <div className="min-w-0 rounded-xl bg-slate-50 p-3.5">
              <div className="text-[11px] text-slate-500">{t('admin.statBackups')}</div>
              <div className="mt-1 truncate text-lg font-bold text-slate-900">
                {formatBytes(adminUsage.backups_size_bytes)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {t('admin.fileCount', { count: adminUsage.backups_file_count })}
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
              <span>{t('admin.policyEnable')}</span>
            </label>
            <button
              type="button"
              disabled={savingPolicy}
              onClick={() => void handleSaveArchivePolicy()}
              className="shrink-0 whitespace-nowrap rounded-lg bg-sky-600 px-3.5 py-1.5 font-medium text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {savingPolicy ? t('common.saving') : t('admin.policySave')}
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-slate-600">{t('admin.policyMaxAsset')}</span>
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
              <span className="mb-1 block text-slate-600">{t('admin.policyMaxBookmark')}</span>
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
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 shrink-0 text-sky-600" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{t('admin.invitesTitle')}</h2>
              <p className="text-xs text-slate-500">{t('admin.invitesDesc')}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={expiresHours}
              onChange={(e) => setExpiresHours(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
            >
              <option value={24}>{t('admin.expires24h')}</option>
              <option value={72}>{t('admin.expires3d')}</option>
              <option value={168}>{t('admin.expires7d')}</option>
            </select>
            <button
              type="button"
              onClick={() => void handleCreateInvite()}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{t('admin.createInvite')}</span>
            </button>
          </div>
        </div>

        <div className="space-y-2 text-xs">
          {invites.length === 0 ? (
            <p className="text-slate-400">{t('admin.noInvites')}</p>
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
                        ? t('admin.inviteUsed', { email: inv.used_by_email || inv.used_by || '' })
                        : isExpired
                          ? t('admin.inviteExpired')
                          : t('admin.inviteExpires', {
                              date: inv.expires_at.slice(0, 16).replace('T', ' '),
                            })}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!isUsed && !isExpired && (
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await copyToClipboard(inviteUrl);
                          if (ok) setMessage(t('admin.inviteCopied'));
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 font-medium text-sky-600 shadow-2xs hover:bg-sky-50"
                      >
                        <Copy className="h-3 w-3" />
                        {t('common.copy')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDeleteInvite(inv.id)}
                      title={t('admin.deleteInvite')}
                      aria-label={t('admin.deleteInvite')}
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
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-600" />
          <h2 className="text-sm font-semibold text-slate-900">
            {t('admin.usersTitle', { count: users.length })}
          </h2>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="whitespace-nowrap px-3.5 py-2.5 font-semibold">
                  {t('admin.colName')}
                </th>
                <th className="whitespace-nowrap px-3.5 py-2.5 font-semibold">
                  {t('admin.colEmail')}
                </th>
                <th className="whitespace-nowrap px-3.5 py-2.5 font-semibold">
                  {t('admin.colRole')}
                </th>
                <th className="whitespace-nowrap px-3.5 py-2.5 font-semibold">
                  {t('admin.col2fa')}
                </th>
                <th className="whitespace-nowrap px-3.5 py-2.5 font-semibold">
                  {t('admin.colJoined')}
                </th>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-right font-semibold">
                  {t('admin.colActions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const isSelf = u.id === currentUser.id;
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3.5 py-2.5 font-medium text-slate-900">
                      {u.name}{' '}
                      {isSelf && (
                        <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700">
                          {t('admin.selfBadge')}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-slate-600">{u.email}</td>
                    <td className="whitespace-nowrap px-3.5 py-2.5">
                      <span
                        className={`rounded px-2 py-0.5 font-medium ${
                          u.is_admin
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {u.is_admin ? t('admin.roleAdmin') : t('admin.roleUser')}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-slate-500">
                      {u.totp_enabled ? t('settings.twoFactorOn') : t('settings.twoFactorOff')}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-slate-400">
                      {u.created_at.slice(0, 10)}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleToggleUserAdmin(u)}
                          title={u.is_admin ? t('admin.revokeAdmin') : t('admin.makeAdmin')}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100"
                        >
                          {u.is_admin ? (
                            <>
                              <ShieldOff className="h-3 w-3" />
                              <span>{t('admin.revokeAdmin')}</span>
                            </>
                          ) : (
                            <>
                              <Shield className="h-3 w-3 text-indigo-600" />
                              <span>{t('admin.makeAdmin')}</span>
                            </>
                          )}
                        </button>
                        {!isSelf && (
                          <button
                            type="button"
                            onClick={() => setDeleteTargetUser(u)}
                            title={t('admin.deleteUser')}
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
          <UserCheck className="h-3.5 w-3.5 shrink-0" />
          <span>{t('admin.minAdminHint')}</span>
        </div>
      </section>

      {/* Auto Backups */}
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 shrink-0 text-emerald-600" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{t('admin.backupsTitle')}</h2>
              <p className="text-xs text-slate-500">{t('admin.backupsDesc')}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={!backupSettingsReady || runningBackup || savingBackupSettings}
            onClick={() => void handleRunBackupNow()}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            <span>{runningBackup ? t('admin.runningBackup') : t('admin.runBackup')}</span>
          </button>
        </div>

        <fieldset
          disabled={!backupSettingsReady || savingBackupSettings || runningBackup}
          className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs sm:grid-cols-2"
        >
          <legend className="sr-only">{t('admin.backupsTitle')}</legend>
          <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-700">
            <input
              type="checkbox"
              checked={backupSettings.enabled}
              onChange={(e) =>
                void handleSaveBackupSettings({ ...backupSettings, enabled: e.target.checked })
              }
            />
            <span>{t('admin.backupEnable')}</span>
          </label>

          <label className="flex items-center gap-2 text-slate-600">
            <span className="shrink-0">{t('admin.backupScope')}</span>
            <select
              value={backupSettings.include_assets ? 'full' : 'database'}
              onChange={(e) => void handleSaveBackupSettings({
                ...backupSettings,
                include_assets: e.target.value === 'full',
              })}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
            >
              <option value="database">{t('admin.backupDatabaseOnly')}</option>
              <option value="full">{t('admin.backupFull')}</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-slate-600">
            <span className="shrink-0">{t('admin.backupInterval')}</span>
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
              <option value={6}>{t('admin.interval6h')}</option>
              <option value={12}>{t('admin.interval12h')}</option>
              <option value={24}>{t('admin.interval24h')}</option>
              <option value={168}>{t('admin.interval168h')}</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-slate-600">
            <span className="shrink-0">{t('admin.backupKeep')}</span>
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
              <option value={3}>{t('admin.keepCount', { count: 3 })}</option>
              <option value={7}>{t('admin.keepCount', { count: 7 })}</option>
              <option value={14}>{t('admin.keepCount', { count: 14 })}</option>
              <option value={30}>{t('admin.keepCount', { count: 30 })}</option>
            </select>
          </label>
        </fieldset>

        {backupSettings.last_failure_at && (
          <p className="text-xs text-rose-700">
            {t('admin.backupFailedAt', { date: new Date(backupSettings.last_failure_at).toLocaleString(dateLocale) })}
          </p>
        )}
        {backupSettings.last_run_at && (
          <p className="text-[11px] text-slate-400">
            {t('admin.lastBackupAt', {
              date: new Date(backupSettings.last_run_at).toLocaleString(dateLocale),
            })}
          </p>
        )}

        <div className="space-y-2 text-xs">
          {backups.length === 0 ? (
            <p className="text-slate-400">{t('admin.noBackups')}</p>
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
                      {t(b.includes_assets ? 'admin.backupFull' : 'admin.backupDatabaseOnly')} · {formatBytes(b.size_bytes)} · {new Date(b.created_at).toLocaleString(dateLocale)}
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
                    <span>{t('admin.download')}</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setDeleteTargetBackup(b)}
                    title={t('admin.deleteBackupTitle')}
                    aria-label={t('admin.deleteBackupTitle')}
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
          title={t('admin.deleteBackupTitle')}
          message={t('admin.deleteBackupMsg', { filename: deleteTargetBackup.filename })}
          confirmLabel={t('common.delete')}
          onClose={() => setDeleteTargetBackup(null)}
          onConfirm={async () => {
            await api.adminDeleteBackup(deleteTargetBackup.filename);
            setBackups((prev) => prev.filter((item) => item.filename !== deleteTargetBackup.filename));
            setMessage(t('admin.backupDeletedMsg', { filename: deleteTargetBackup.filename }));
          }}
        />
      )}

      {deleteTargetUser && (
        <ConfirmModal
          title={t('admin.deleteUser')}
          message={t('admin.deleteUserMsg', {
            name: deleteTargetUser.name,
            email: deleteTargetUser.email,
          })}
          confirmLabel={t('common.delete')}
          onClose={() => setDeleteTargetUser(null)}
          onConfirm={async () => {
            await api.adminDeleteUser(deleteTargetUser.id);
            setUsers((prev) => prev.filter((item) => item.id !== deleteTargetUser.id));
            setMessage(t('admin.userDeletedMsg', { email: deleteTargetUser.email }));
          }}
        />
      )}
    </div>
  );
}
