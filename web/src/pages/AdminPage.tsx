import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Copy,
  Link2,
  Plus,
  Shield,
  ShieldOff,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { api } from '../api/client';
import { ConfirmModal } from '../components/ConfirmModal';
import type { User, UserInvite } from '../types/bookmark';
import { copyToClipboard } from '../utils/clipboard';

interface AdminPageProps {
  currentUser: User;
  onBack: () => void;
}

export function AdminPage({ currentUser, onBack }: AdminPageProps) {
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<UserInvite[]>([]);
  const [expiresHours, setExpiresHours] = useState(72);
  const [deleteTargetUser, setDeleteTargetUser] = useState<User | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentUser.is_admin) return;
    void Promise.all([
      api.adminGetSettings(),
      api.adminListUsers(),
      api.adminListInvites(),
    ])
      .then(([cfg, usersRes, invitesRes]) => {
        setRegistrationEnabled(cfg.registration_enabled);
        setUsers(usersRes.items);
        setInvites(invitesRes.items);
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
