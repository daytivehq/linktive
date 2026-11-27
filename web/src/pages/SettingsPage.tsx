import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  Copy,
  Database,
  Download,
  KeyRound,
  Layers,
  LogOut,
  Pencil,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Trash2,
  Upload,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import { ConfirmModal } from '../components/ConfirmModal';
import { LanguageSelect } from '../components/LanguageSelect';
import { SecretInput } from '../components/SecretInput';
import { useI18n, type LocaleCode } from '../i18n';
import type {
  APIKeyItem,
  ArchiveShareScope,
  ClickAction,
  ClipFormat,
  ClipOnSaveMode,
  MemberRole,
  User,
  UserSettings,
  Workspace,
  WorkspaceMember,
  WorkspaceUsage,
} from '../types/bookmark';
import { copyToClipboard } from '../utils/clipboard';
import { formatBytes } from '../utils/format';

interface SettingsPageProps {
  user: User;
  settings: UserSettings;
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  onBack: () => void;
  onOpenApiDocs: () => void;
  onUserUpdated: (user: User) => void;
  onUpdateSettings: (next: UserSettings) => Promise<void>;
  onWorkspaceCreated: (ws: Workspace) => void;
  onWorkspaceUpdated: (ws: Workspace) => void;
  onWorkspaceDeleted: (wsID: string) => void;
  onSelectWorkspace: (wsID: string) => void;
  onDataImported: () => Promise<void>;
  onLogout: () => Promise<void>;
  onAccountDeleted: () => void;
}

export function SettingsPage({
  user,
  settings,
  workspaces,
  activeWorkspace,
  onBack,
  onOpenApiDocs,
  onUserUpdated,
  onUpdateSettings,
  onWorkspaceCreated,
  onWorkspaceUpdated,
  onWorkspaceDeleted,
  onSelectWorkspace,
  onDataImported,
  onLogout,
  onAccountDeleted,
}: SettingsPageProps) {
  const { setLocale, t } = useI18n();
  const [tab, setTab] = useState<'general' | 'workspaces' | 'account' | 'transfer'>('general');
  const [language, setLanguage] = useState<LocaleCode>(settings.language);
  const [defaultWorkspaceId, setDefaultWorkspaceId] = useState<string>(settings.default_workspace_id);
  const [clickAction, setClickAction] = useState<ClickAction>(settings.click_action);
  const [includeSubcollections, setIncludeSubcollections] = useState<boolean>(
    settings.include_subcollections,
  );
  const [clipOnSave, setClipOnSave] = useState<ClipOnSaveMode>(settings.clip_on_save);
  const [clipFormat, setClipFormat] = useState<ClipFormat>(settings.clip_format);
  const [searchArchiveContent, setSearchArchiveContent] = useState<boolean>(
    settings.search_archive_content,
  );
  const [archiveShareScope, setArchiveShareScope] = useState<ArchiveShareScope>(
    settings.archive_share_scope,
  );

  // Usage state
  const [workspaceUsage, setWorkspaceUsage] = useState<WorkspaceUsage | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [confirmClearArchives, setConfirmClearArchives] = useState(false);

  // Account & Security state
  const [profileName, setProfileName] = useState(user.name);
  const [profileEmail, setProfileEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [totpSetupPassword, setTotpSetupPassword] = useState('');
  const [totpSetupCode, setTotpSetupCode] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpQrDataUrl, setTotpQrDataUrl] = useState('');
  const [totpEnableCode, setTotpEnableCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deletionPassword, setDeletionPassword] = useState('');
  const [deletionCode, setDeletionCode] = useState('');

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
    setLanguage(settings.language);
    setDefaultWorkspaceId(settings.default_workspace_id);
    setClickAction(settings.click_action);
    setIncludeSubcollections(settings.include_subcollections);
    setClipOnSave(settings.clip_on_save);
    setClipFormat(settings.clip_format);
    setSearchArchiveContent(settings.search_archive_content);
    setArchiveShareScope(settings.archive_share_scope);
  }, [
    settings.language,
    settings.default_workspace_id,
    settings.click_action,
    settings.include_subcollections,
    settings.clip_on_save,
    settings.clip_format,
    settings.search_archive_content,
    settings.archive_share_scope,
  ]);

  useEffect(() => {
    setMessage('');
    setError('');
  }, [tab]);

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
      setLoadingUsage(true);
      void api
        .getWorkspaceUsage(activeWorkspace.id)
        .then((res) => setWorkspaceUsage(res))
        .catch(() => setWorkspaceUsage(null))
        .finally(() => setLoadingUsage(false));
    } else if (tab === 'account') {
      void api
        .listAPIKeys()
        .then((res) => setApiKeys(res.items))
        .catch(() => setApiKeys([]));
    }
  }, [tab, activeWorkspace.id]);

  const effectiveDefaultWorkspaceId =
    defaultWorkspaceId && workspaces.some((w) => w.id === defaultWorkspaceId)
      ? defaultWorkspaceId
      : (workspaces[0]?.id ?? '');

  const buildMergedSettings = (overrides?: Partial<UserSettings>): UserSettings => ({
    ...settings,
    language,
    default_workspace_id: defaultWorkspaceId,
    click_action: clickAction,
    include_subcollections: includeSubcollections,
    clip_on_save: clipOnSave,
    clip_format: clipFormat,
    search_archive_content: searchArchiveContent,
    archive_share_scope: archiveShareScope,
    ...overrides,
  });

  const handleLanguageChange = async (next: LocaleCode) => {
    setLanguage(next);
    setLocale(next);
    setError('');
    setMessage('');
    try {
      await onUpdateSettings(buildMergedSettings({ language: next }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'));
    }
  };

  const handleDefaultWorkspaceChange = async (wsId: string) => {
    setDefaultWorkspaceId(wsId);
    setError('');
    setMessage('');
    try {
      await onUpdateSettings(buildMergedSettings({ default_workspace_id: wsId }));
      const target = workspaces.find((w) => w.id === wsId);
      if (target) {
        setMessage(t('settings.defaultWorkspaceSaved', { name: target.name }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'));
    }
  };

  const handleSaveGeneral = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      setLocale(language);
      await onUpdateSettings(buildMergedSettings());
      setMessage(t('settings.savedPreferences'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'));
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
      setMessage(t('settings.profileUpdated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'));
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
      setMessage(t('settings.passwordUpdated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'));
    }
  };

  const handleStart2FASetup = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await api.setup2FA(totpSetupPassword, totpSetupCode);
      setTotpSetupPassword('');
      setTotpSetupCode('');
      setTotpSecret(res.secret);
      const qrUrl = await QRCode.toDataURL(res.otpauth_url, { width: 180, margin: 1 });
      setTotpQrDataUrl(qrUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.requestFailed'));
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
      setMessage(t('settings.twoFactorEnabledMsg'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.requestFailed'));
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
      setMessage(t('settings.twoFactorDisabledMsg'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.requestFailed'));
    }
  };

  const closeDeleteAccount = () => {
    setConfirmDeleteAccount(false);
    setDeletionPassword('');
    setDeletionCode('');
  };

  const handleDeleteAccount = async () => {
    try {
      await api.deleteAccount(deletionPassword, deletionCode);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'last_admin') throw new Error(t('settings.deleteAccountLastAdmin'));
        if (err.code === 'invalid_password') throw new Error(t('settings.deleteAccountInvalidPassword'));
        if (err.code === 'invalid_totp') throw new Error(t('settings.deleteAccountInvalidCode'));
        if (err.status === 429) throw new Error(t('settings.deleteAccountRateLimit'));
      }
      throw new Error(t('settings.deleteAccountFailed'));
    }
    onAccountDeleted();
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
      setMessage(t('settings.wsCreatedMsg', { name: ws.name }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.requestFailed'));
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
      setMessage(t('settings.wsRenamedMsg'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'));
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
      setMessage(t('settings.memberAddedMsg', { email: m.email }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.requestFailed'));
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setError('');
    try {
      await api.removeMember(activeWorkspace.id, userId);
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.requestFailed'));
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
      setError(err instanceof Error ? err.message : t('common.requestFailed'));
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    try {
      await api.deleteAPIKey(keyId);
      setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.requestFailed'));
    }
  };

  const handleImportSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!importFile) {
      setError(t('settings.importSelectFile'));
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
        t('settings.importDone', {
          format: res.format,
          imported: res.imported,
          skipped: res.skipped,
          collections: res.created_collections,
          failed: res.failed,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.requestFailed'));
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
            <span>{t('common.backToBookmarks')}</span>
          </button>
          <h1 className="text-xl font-bold text-slate-900">{t('settings.title')}</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {user.name} ({user.email})
            {user.is_admin && (
              <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-700">
                {t('admin.roleAdmin')}
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-slate-500">{t('settings.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void onLogout()}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>{t('nav.logout')}</span>
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="mb-5 flex gap-4 overflow-x-auto whitespace-nowrap border-b border-slate-200 text-sm">
          <button
            type="button"
            onClick={() => setTab('general')}
            className={`inline-flex items-center gap-1.5 border-b-2 pb-2.5 font-medium ${
              tab === 'general' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>{t('settings.tabGeneral')}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('workspaces')}
            className={`inline-flex items-center gap-1.5 border-b-2 pb-2.5 font-medium ${
              tab === 'workspaces' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>{t('settings.tabWorkspacesUsage')}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('account')}
            className={`inline-flex items-center gap-1.5 border-b-2 pb-2.5 font-medium ${
              tab === 'account' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserIcon className="h-4 w-4" />
            <span>{t('settings.tabAccountApi')}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('transfer')}
            className={`inline-flex items-center gap-1.5 border-b-2 pb-2.5 font-medium ${
              tab === 'transfer' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Database className="h-4 w-4" />
            <span>{t('settings.tabTransfer')}</span>
          </button>
        </div>

        {tab === 'general' && (
          <form onSubmit={handleSaveGeneral} className="space-y-5">
            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('settings.sectionInterface')}
              </h2>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800">
                    {t('settings.languageTitle')}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{t('settings.languageDesc')}</div>
                </div>
                <LanguageSelect value={language} onChange={(next) => void handleLanguageChange(next)} />
              </div>

              {workspaces.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800">
                      {t('settings.defaultWorkspaceTitle')}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {t('settings.defaultWorkspaceDesc')}
                    </div>
                  </div>
                  <select
                    value={effectiveDefaultWorkspaceId}
                    onChange={(e) => void handleDefaultWorkspaceChange(e.target.value)}
                    aria-label={t('settings.defaultWorkspaceTitle')}
                    className="max-w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-sky-500"
                  >
                    {workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name} ({ws.type === 'personal' ? t('common.personal') : t('common.shared')})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </section>

            <section className="space-y-4 rounded-xl border border-slate-200 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('settings.sectionBehavior')}
              </h2>
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-700">
                  {t('settings.clickActionTitle')}
                </label>
                <div className="space-y-2 text-sm">
                  {(
                    [
                      ['new_tab', t('settings.clickNewTab')],
                      ['current_tab', t('settings.clickCurrentTab')],
                      ['detail_panel', t('settings.clickDetailPanel')],
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

              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-700">
                  {t('settings.collectionNavTitle')}
                </label>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 px-3.5 py-3 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={includeSubcollections}
                    onChange={(e) => setIncludeSubcollections(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-medium text-slate-800">{t('settings.includeSubTitle')}</div>
                    <div className="text-xs text-slate-500">{t('settings.includeSubDesc')}</div>
                  </div>
                </label>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-slate-200 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('settings.sectionClipping')}
              </h2>
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-700">
                  {t('settings.clipModeTitle')}
                </label>
                <div className="space-y-2 text-sm">
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 px-3.5 py-2.5 hover:bg-slate-50">
                    <input
                      type="radio"
                      name="clip_on_save"
                      checked={clipOnSave === 'manual'}
                      onChange={() => setClipOnSave('manual')}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-medium text-slate-800">{t('settings.clipManualTitle')}</div>
                      <div className="text-xs text-slate-500">{t('settings.clipManualDesc')}</div>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 px-3.5 py-2.5 hover:bg-slate-50">
                    <input
                      type="radio"
                      name="clip_on_save"
                      checked={clipOnSave === 'auto'}
                      onChange={() => setClipOnSave('auto')}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-medium text-slate-800">{t('settings.clipAutoTitle')}</div>
                      <div className="text-xs text-slate-500">{t('settings.clipAutoDesc')}</div>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-700">
                  {t('settings.clipFormatTitle')}
                </label>
                <div className="space-y-2 text-sm">
                  {(
                    [
                      [
                        'readable',
                        t('settings.clipFormatReadableTitle'),
                        t('settings.clipFormatReadableDesc'),
                      ],
                      [
                        'html',
                        t('settings.clipFormatHtmlTitle'),
                        t('settings.clipFormatHtmlDesc'),
                      ],
                      [
                        'both',
                        t('settings.clipFormatBothTitle'),
                        t('settings.clipFormatBothDesc'),
                      ],
                    ] as const
                  ).map(([value, titleText, descText]) => (
                    <label
                      key={value}
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 px-3.5 py-2.5 hover:bg-slate-50"
                    >
                      <input
                        type="radio"
                        name="clip_format"
                        checked={clipFormat === value}
                        onChange={() => setClipFormat(value)}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="font-medium text-slate-800">{titleText}</div>
                        <div className="text-xs text-slate-500">{descText}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-700">
                  {t('settings.archiveSearchTitle')}
                </label>
                <div className="space-y-2 text-sm">
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 px-3.5 py-3 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={searchArchiveContent}
                      onChange={(e) => setSearchArchiveContent(e.target.checked)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-medium text-slate-800">
                        {t('settings.searchArchiveTitle')}
                      </div>
                      <div className="text-xs text-slate-500">{t('settings.searchArchiveDesc')}</div>
                    </div>
                  </label>

                  <div className="rounded-lg border border-slate-200 p-3.5">
                    <div className="mb-2 text-xs font-semibold text-slate-700">
                      {t('settings.shareScopeTitle')}
                    </div>
                    <div className="space-y-2">
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="radio"
                          name="archive_share_scope"
                          checked={archiveShareScope === 'owner_only'}
                          onChange={() => setArchiveShareScope('owner_only')}
                          className="mt-0.5"
                        />
                        <div>
                          <div className="font-medium text-slate-800">
                            {t('settings.shareOwnerOnlyTitle')}
                          </div>
                          <div className="text-xs text-slate-500">
                            {t('settings.shareOwnerOnlyDesc')}
                          </div>
                        </div>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="radio"
                          name="archive_share_scope"
                          checked={archiveShareScope === 'shared_members'}
                          onChange={() => setArchiveShareScope('shared_members')}
                          className="mt-0.5"
                        />
                        <div>
                          <div className="font-medium text-slate-800">
                            {t('settings.shareMembersTitle')}
                          </div>
                          <div className="text-xs text-amber-700">
                            {t('settings.shareMembersWarn')}
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
              >
                {t('settings.savePreferences')}
              </button>
            </div>
          </form>
        )}

        {tab === 'workspaces' && (
          <div className="space-y-5">
            <form onSubmit={handleCreateWorkspace} className="flex flex-wrap gap-2 sm:flex-nowrap">
              <input
                type="text"
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                placeholder={t('settings.newWsPlaceholder')}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-sky-700"
              >
                <Plus className="h-4 w-4" />
                <span>{t('settings.createWsBtn')}</span>
              </button>
            </form>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Users className="h-3.5 w-3.5 text-slate-500" />
                <span>{t('settings.wsListTitle')}</span>
              </div>
              <div className="space-y-1.5 text-sm">
                {workspaces.map((ws) => {
                  const isEditing = editingWsId === ws.id;
                  const isActive = ws.id === activeWorkspace.id;
                  const isDefault = effectiveDefaultWorkspaceId === ws.id;
                  return (
                    <div
                      key={ws.id}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 sm:flex-nowrap ${
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
                            className="min-w-0 flex-1 rounded border border-sky-400 bg-white px-2.5 py-1 text-sm outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => void handleRenameWorkspace(ws.id)}
                            title={t('common.save')}
                            aria-label={t('common.save')}
                            className="rounded bg-sky-600 p-1 text-white"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingWsId(null)}
                            title={t('common.cancel')}
                            aria-label={t('common.cancel')}
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
                            <span className="shrink-0 whitespace-nowrap rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-500">
                              {ws.type === 'personal' ? t('common.personal') : t('common.shared')}
                            </span>
                            <span className="shrink-0 whitespace-nowrap rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-500">
                              {ws.role}
                            </span>
                            {isDefault && (
                              <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200/70">
                                <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                                <span>{t('settings.defaultWorkspaceBadge')}</span>
                              </span>
                            )}
                          </button>

                          <div className="flex shrink-0 items-center gap-1">
                            {workspaces.length > 1 && !isDefault && (
                              <button
                                type="button"
                                onClick={() => void handleDefaultWorkspaceChange(ws.id)}
                                className="whitespace-nowrap rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-amber-300 hover:text-amber-700"
                              >
                                {t('settings.setDefaultWorkspace')}
                              </button>
                            )}
                            {ws.role === 'owner' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingWsId(ws.id);
                                    setEditingWsName(ws.name);
                                  }}
                                  title={t('settings.wsEditTitle')}
                                  className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                {ws.type === 'shared' && (
                                  <button
                                    type="button"
                                    onClick={() => setDeleteTargetWs(ws)}
                                    title={t('settings.wsDeleteTitle')}
                                    className="rounded p-1 text-slate-400 hover:bg-white hover:text-rose-600"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2.5 text-xs font-semibold text-slate-700">
                {t('settings.wsMembersTitle', { name: activeWorkspace.name })}
              </div>
              <div className="space-y-1.5 text-sm">
                {members.map((m) => (
                  <div
                    key={m.user_id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{m.name}</span>{' '}
                      <span className="text-xs text-slate-500">({m.email})</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded bg-white px-2 py-0.5 text-xs text-slate-600">
                        {m.role}
                      </span>
                      {activeWorkspace.role === 'owner' && m.role !== 'owner' && (
                        <button
                          type="button"
                          onClick={() => void handleRemoveMember(m.user_id)}
                          title={t('settings.removeMember')}
                          aria-label={t('settings.removeMember')}
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
                <form onSubmit={handleInviteMember} className="mt-3 flex flex-wrap gap-2 sm:flex-nowrap">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder={t('settings.invitePlaceholder')}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-sky-500"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as MemberRole)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                  >
                    <option value="editor">{t('common.editor')}</option>
                    <option value="viewer">{t('common.viewer')}</option>
                  </select>
                  <button
                    type="submit"
                    className="shrink-0 whitespace-nowrap rounded-lg bg-slate-800 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
                  >
                    {t('settings.inviteBtn')}
                  </button>
                </form>
              )}
            </div>

            {/* Usage & Storage for active workspace */}
            <div className="space-y-4 rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-start gap-2">
                  <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      {t('settings.usageTitle', { name: activeWorkspace.name })}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">{t('settings.usageDesc')}</p>
                  </div>
                </div>
                {activeWorkspace.role !== 'viewer' && workspaceUsage && workspaceUsage.archived_count > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmClearArchives(true)}
                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{t('settings.clearArchivesBtn')}</span>
                  </button>
                )}
              </div>

              {loadingUsage ? (
                <p className="py-6 text-center text-xs text-slate-400">
                  {t('settings.loadingUsage')}
                </p>
              ) : workspaceUsage ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="text-xs text-slate-500">{t('settings.usageBookmarks')}</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900">
                      {workspaceUsage.bookmark_count.toLocaleString()}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      {t('settings.usageBookmarksSub', {
                        collections: workspaceUsage.collection_count,
                        tags: workspaceUsage.tag_count,
                      })}
                    </div>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="text-xs text-slate-500">{t('settings.usageArchives')}</div>
                    <div className="mt-1 text-2xl font-bold text-sky-700">
                      {workspaceUsage.archived_count.toLocaleString()}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      {t('settings.usageArchivesSub', {
                        assets: workspaceUsage.archive_asset_count.toLocaleString(),
                      })}
                    </div>
                  </div>
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="text-xs text-slate-500">{t('settings.usageStorage')}</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900">
                      {formatBytes(workspaceUsage.archive_bytes)}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      {t('settings.usageStorageSub')}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">{t('settings.usageError')}</p>
              )}
            </div>
          </div>
        )}

        {tab === 'account' && (
          <div className="space-y-5">
            {/* Profile */}
            <form onSubmit={handleSaveProfile} className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-800">{t('settings.profileTitle')}</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    {t('auth.name')}
                  </label>
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    {t('auth.email')}
                  </label>
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
                  {t('settings.profileSave')}
                </button>
              </div>
            </form>

            {/* Password */}
            <form onSubmit={handleChangePassword} className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-800">
                {t('settings.passwordTitle')}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SecretInput
                  label={t('settings.currentPassword')}
                  required
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
                <SecretInput
                  label={t('settings.newPassword')}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
                >
                  {t('settings.passwordTitle')}
                </button>
              </div>
            </form>

            {/* 2FA TOTP */}
            <div className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck
                    className={`h-4 w-4 shrink-0 ${user.totp_enabled ? 'text-emerald-600' : 'text-slate-400'}`}
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">
                      {t('settings.twoFactorTitle')}
                    </div>
                    <div className="text-xs text-slate-500">{t('settings.twoFactorDesc')}</div>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    user.totp_enabled
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {user.totp_enabled ? t('settings.twoFactorOn') : t('settings.twoFactorOff')}
                </span>
              </div>

              {!totpSecret ? (
                <form onSubmit={handleStart2FASetup} className="flex flex-wrap gap-2">
                  <SecretInput
                    compact
                    label={t('settings.currentPassword')}
                    placeholder={t('settings.currentPassword')}
                    required
                    autoComplete="current-password"
                    value={totpSetupPassword}
                    onChange={(e) => setTotpSetupPassword(e.target.value)}
                  />
                  {user.totp_enabled && (
                    <input type="text" inputMode="numeric" required maxLength={6}
                      aria-label={t('settings.twoFactorCodePlaceholder')} placeholder={t('settings.twoFactorCodePlaceholder')}
                      value={totpSetupCode} onChange={(e) => setTotpSetupCode(e.target.value.replace(/\D/g, ''))}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs" />
                  )}
                  <button type="submit"
                    className="rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-sky-700">
                    {t(user.totp_enabled ? 'settings.twoFactorReplace' : 'settings.twoFactorStart')}
                  </button>
                </form>
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
                      <div className="min-w-0 flex-1 space-y-2 text-xs text-slate-600">
                        <p>{t('settings.twoFactorQrHint')}</p>
                        <div className="flex items-center justify-between gap-2 rounded bg-white px-2.5 py-1.5 font-mono text-slate-800">
                          <span className="truncate">{totpSecret}</span>
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await copyToClipboard(totpSecret);
                              if (ok) setMessage(t('settings.twoFactorSecretCopied'));
                            }}
                            className="shrink-0 text-sky-600 hover:underline"
                          >
                            {t('common.copy')}
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            required
                            maxLength={6}
                            value={totpEnableCode}
                            onChange={(e) => setTotpEnableCode(e.target.value.replace(/\D/g, ''))}
                            placeholder={t('settings.twoFactorCodePlaceholder')}
                            className="w-40 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs outline-none focus:border-sky-500"
                          />
                          <button
                            type="submit"
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                          >
                            {t('settings.twoFactorVerifyBtn')}
                          </button>
                        </div>
                      </div>
                    </div>
                    <button type="button" onClick={() => {
                      setTotpSecret('');
                      setTotpQrDataUrl('');
                      setTotpEnableCode('');
                    }} className="text-xs text-slate-600 hover:underline">{t('common.cancel')}</button>
                  </form>
              )}
              {user.totp_enabled && !totpSecret && (
                <form onSubmit={handleDisable2FA} className="space-y-2 rounded-lg bg-rose-50/50 p-3">
                  <div className="text-xs font-medium text-slate-700">
                    {t('settings.twoFactorDisableTitle')}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <SecretInput
                      compact
                      label={t('settings.currentPassword')}
                      placeholder={t('settings.currentPassword')}
                      required
                      autoComplete="current-password"
                      value={disablePassword}
                      onChange={(e) => setDisablePassword(e.target.value)}
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      maxLength={6}
                      value={disableCode}
                      onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                      placeholder={t('settings.twoFactorOtpPlaceholder')}
                      className="w-36 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs outline-none focus:border-sky-500"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                    >
                      {t('settings.twoFactorDisableBtn')}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* API Keys & Automation */}
            <div className="space-y-4 rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">
                      {t('settings.sectionApiKeys')}
                    </div>
                    <div className="text-xs text-slate-500">{t('settings.apiKeyDesc')}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenApiDocs}
                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-slate-50 px-2.5 py-1 text-xs font-medium text-sky-600 hover:bg-sky-50"
                >
                  <span>{t('settings.apiDocsLink')}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <form onSubmit={handleCreateKey} className="flex flex-wrap gap-2 sm:flex-nowrap">
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder={t('settings.apiKeyNamePlaceholder')}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
                <button
                  type="submit"
                  className="shrink-0 whitespace-nowrap rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
                >
                  {t('settings.issueKey')}
                </button>
              </form>

              {createdToken && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  <div className="mb-1 font-semibold">{t('settings.issuedTokenTitle')}</div>
                  <div className="flex items-center justify-between gap-2 rounded bg-white px-2.5 py-1.5 font-mono">
                    <span className="truncate">{createdToken}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await copyToClipboard(createdToken);
                        if (ok) setMessage(t('settings.tokenCopied'));
                        else setError(t('settings.copyFailed'));
                      }}
                      className="inline-flex shrink-0 items-center gap-1 text-sky-600"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {t('common.copy')}
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-1.5 text-sm">
                {apiKeys.length === 0 ? (
                  <p className="text-xs text-slate-400">{t('settings.noApiKeys')}</p>
                ) : (
                  apiKeys.map((k) => (
                    <div
                      key={k.id}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{k.name}</div>
                        <div className="text-xs text-slate-400">
                          {t('settings.createdDate', { date: k.created_at.slice(0, 10) })}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteKey(k.id)}
                        title={t('settings.deleteApiKey')}
                        aria-label={t('settings.deleteApiKey')}
                        className="rounded p-1 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'account' && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 p-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">{t('settings.deleteAccount')}</h2>
              <p className="text-xs text-slate-500">{t('settings.deleteAccountSummary')}</p>
            </div>
            <button
              type="button"
              onClick={() => setConfirmDeleteAccount(true)}
              className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
            >
              {t('settings.deleteAccount')}
            </button>
          </div>
        )}

        {confirmDeleteAccount && (
          <ConfirmModal
            title={t('settings.deleteAccount')}
            message={t('settings.deleteAccountDetails')}
            confirmLabel={t('settings.deleteAccountConfirm')}
            onClose={closeDeleteAccount}
            onConfirm={handleDeleteAccount}
          >
            <SecretInput
              label={t('settings.currentPassword')}
              required
              autoComplete="current-password"
              value={deletionPassword}
              onChange={(event) => setDeletionPassword(event.target.value)}
            />
            {user.totp_enabled && (
              <label className="block text-xs font-medium text-slate-700">
                {t('settings.twoFactorOtpPlaceholder')}
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={deletionCode}
                  onChange={(event) => setDeletionCode(event.target.value.replace(/\D/g, ''))}
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            )}
          </ConfirmModal>
        )}

        {tab === 'transfer' && (
          <div className="space-y-6">
            <section className="rounded-xl border border-slate-200 p-4">
              <div className="mb-1 text-sm font-semibold text-slate-800">
                {t('settings.exportTitle', { name: activeWorkspace.name })}
              </div>
              <p className="mb-3 text-xs text-slate-500">{t('settings.exportDesc')}</p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={api.exportWorkspaceUrl(activeWorkspace.id, 'json')}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Download className="h-3.5 w-3.5 text-sky-600" />
                  <span>{t('settings.exportJson')}</span>
                </a>
                <a
                  href={api.exportWorkspaceUrl(activeWorkspace.id, 'html')}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-600" />
                  <span>{t('settings.exportHtml')}</span>
                </a>
                <a
                  href={api.exportWorkspaceUrl(activeWorkspace.id, 'csv')}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Download className="h-3.5 w-3.5 text-indigo-600" />
                  <span>{t('settings.exportCsv')}</span>
                </a>
                <a href={api.exportWorkspaceUrl(activeWorkspace.id, 'excel_csv')} download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100">
                  <Download className="h-3.5 w-3.5 text-indigo-600" />
                  <span>{t('settings.exportExcelCsv')}</span>
                </a>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 p-4">
              <div className="mb-1 text-sm font-semibold text-slate-800">
                {t('settings.importTitle')}
              </div>
              <p className="mb-3 text-xs text-slate-500">{t('settings.importDesc')}</p>
              <form onSubmit={handleImportSubmit} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      {t('settings.importFormat')}
                    </label>
                    <select
                      value={importFormat}
                      onChange={(e) => setImportFormat(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                    >
                      <option value="auto">{t('settings.importAuto')}</option>
                      <option value="linktive_json">linktive JSON</option>
                      <option value="html">{t('settings.importHtml')}</option>
                      <option value="raindrop_csv">Raindrop.io CSV</option>
                      <option value="linkwarden_json">Linkwarden JSON</option>
                      <option value="karakeep_json">Karakeep JSON</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      {t('settings.importFile')}
                    </label>
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
                  <span>{t('settings.skipDuplicates')}</span>
                </label>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={importing || !importFile}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>{importing ? t('settings.importing') : t('settings.importRun')}</span>
                  </button>
                </div>
              </form>
            </section>
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
          title={t('settings.wsDeleteTitle')}
          message={t('settings.wsDeleteMsg', { name: deleteTargetWs.name })}
          confirmLabel={t('common.delete')}
          onClose={() => setDeleteTargetWs(null)}
          onConfirm={async () => {
            await api.deleteWorkspace(deleteTargetWs.id);
            if (settings.default_workspace_id === deleteTargetWs.id) {
              await onUpdateSettings(buildMergedSettings({ default_workspace_id: '' }));
            }
            onWorkspaceDeleted(deleteTargetWs.id);
            setMessage(t('settings.wsDeletedMsg', { name: deleteTargetWs.name }));
          }}
        />
      )}

      {confirmClearArchives && (
        <ConfirmModal
          title={t('settings.clearArchivesModalTitle')}
          message={t('settings.clearArchivesModalMsg', { name: activeWorkspace.name })}
          confirmLabel={t('settings.clearArchivesBtn')}
          onClose={() => setConfirmClearArchives(false)}
          onConfirm={async () => {
            const res = await api.clearWorkspaceArchives(activeWorkspace.id);
            const refreshed = await api.getWorkspaceUsage(activeWorkspace.id);
            setWorkspaceUsage(refreshed);
            await onDataImported();
            setMessage(t('settings.clearArchivesDone', { count: res.deleted }));
          }}
        />
      )}
    </div>
  );
}
