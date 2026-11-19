import { useEffect, useState, type FormEvent } from 'react';
import { Bookmark, ShieldCheck, Ticket } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { AuthConfig, User, Workspace } from '../types/bookmark';

interface AuthScreenProps {
  onSuccess: (user: User, workspaces: Workspace[]) => void;
}

export function AuthScreen({ onSuccess }: AuthScreenProps) {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite') ?? '';

  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>(inviteToken ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .authConfig(inviteToken || undefined)
      .then((cfg) => {
        setAuthConfig(cfg);
        const allowReg =
          !cfg.has_users || cfg.registration_enabled || Boolean(inviteToken && cfg.invite_valid);
        if (!allowReg) {
          setMode('login');
        } else if (!cfg.has_users || (inviteToken && cfg.invite_valid)) {
          setMode('register');
        }
      })
      .catch(() => {
        setAuthConfig({ registration_enabled: true, has_users: true });
      });
  }, [inviteToken]);

  const canRegister =
    !authConfig ||
    !authConfig.has_users ||
    authConfig.registration_enabled ||
    Boolean(inviteToken && authConfig.invite_valid);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const res = await api.login({
          email,
          password,
          totp_code: requires2FA ? totpCode.trim() : undefined,
        });
        if (res.requires_2fa) {
          setRequires2FA(true);
          return;
        }
        if (res.user && res.workspaces) {
          onSuccess(res.user, res.workspaces);
        }
      } else {
        const res = await api.register({
          email,
          name,
          password,
          invite_token: inviteToken || undefined,
        });
        onSuccess(res.user, res.workspaces);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청 처리에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white">
            <Bookmark className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">linktive</h1>
            <p className="text-xs text-slate-500">가볍고 빠른 북마크 관리</p>
          </div>
        </div>

        {inviteToken && authConfig && (
          <div
            className={`mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
              authConfig.invite_valid
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-rose-50 text-rose-700'
            }`}
          >
            <Ticket className="h-4 w-4 shrink-0" />
            <span>
              {authConfig.invite_valid
                ? '유효한 초대 링크로 회원가입을 진행합니다.'
                : '만료되었거나 이미 사용된 초대 링크입니다.'}
            </span>
          </div>
        )}

        {authConfig && !authConfig.has_users && (
          <div className="mb-4 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
            첫 번째로 가입하는 계정은 <strong>시스템 관리자</strong>로 자동 등록됩니다.
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setRequires2FA(false);
              setTotpCode('');
              setError('');
            }}
            className={`rounded-md py-1.5 ${
              mode === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
            }`}
          >
            로그인
          </button>
          <button
            type="button"
            disabled={!canRegister}
            title={!canRegister ? '관리자에 의해 회원가입이 비활성화되었습니다.' : undefined}
            onClick={() => {
              if (!canRegister) return;
              setMode('register');
              setRequires2FA(false);
              setError('');
            }}
            className={`rounded-md py-1.5 ${
              !canRegister
                ? 'cursor-not-allowed text-slate-400 opacity-50'
                : mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500'
            }`}
          >
            회원가입
          </button>
        </div>

        {!canRegister && (
          <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            신규 회원가입이 비활성화되어 있습니다. 기존 계정으로 로그인하거나 관리자 초대 링크를
            사용해 주세요.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && canRegister && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">닉네임</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">이메일</label>
            <input
              type="email"
              required
              disabled={requires2FA}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 disabled:bg-slate-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              비밀번호 (6자 이상)
            </label>
            <input
              type="password"
              required
              minLength={6}
              disabled={requires2FA}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 disabled:bg-slate-100"
            />
          </div>

          {requires2FA && mode === 'login' && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3">
              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-sky-900">
                <ShieldCheck className="h-4 w-4 text-sky-600" />
                <span>2단계 인증(2FA) 코드 6자리</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                required
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full rounded-lg border border-sky-300 bg-white px-3 py-2 text-center font-mono text-base tracking-widest outline-none focus:border-sky-500"
              />
            </div>
          )}

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {submitting
              ? '처리 중...'
              : mode === 'login'
                ? requires2FA
                  ? '인증 후 로그인'
                  : '로그인'
                : '계정 만들기'}
          </button>
        </form>
      </div>
    </div>
  );
}
