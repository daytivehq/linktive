import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Bookmark,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Search,
  Sparkles,
} from 'lucide-react'
import './index.css'
import { Workspace, fetchMe } from './lib/api'
import { getSettings, normalizeServerUrl, saveSettings } from './lib/storage'

function OptionsApp() {
  const [serverUrl, setServerUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [defaultWorkspaceId, setDefaultWorkspaceId] = useState('')
  const [showKey, setShowKey] = useState(false)

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [userLabel, setUserLabel] = useState('')
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    void (async () => {
      const s = await getSettings()
      setServerUrl(s.serverUrl)
      setApiKey(s.apiKey)
      setDefaultWorkspaceId(s.defaultWorkspaceId)
      if (s.serverUrl && s.apiKey) {
        void verifyConnection(s.serverUrl, s.apiKey, s.defaultWorkspaceId, false)
      }
    })()
  }, [])

  async function verifyConnection(
    rawUrl: string,
    rawKey: string,
    preferredWsId: string,
    persist: boolean,
  ) {
    const cleanUrl = normalizeServerUrl(rawUrl)
    const cleanKey = rawKey.trim()
    if (!cleanUrl || !cleanKey) {
      setStatus('error')
      setMessage('서버 URL과 API 키를 모두 입력하세요.')
      return
    }
    setTesting(true)
    setStatus('idle')
    setMessage('')
    try {
      const me = await fetchMe(cleanUrl, cleanKey)
      setWorkspaces(me.workspaces)
      setUserLabel(`${me.user.name} (${me.user.email})`)

      const chosenWsId =
        me.workspaces.find((w) => w.id === preferredWsId)?.id ??
        me.workspaces[0]?.id ??
        ''
      setDefaultWorkspaceId(chosenWsId)

      if (persist) {
        await saveSettings({
          serverUrl: cleanUrl,
          apiKey: cleanKey,
          defaultWorkspaceId: chosenWsId,
        })
        setServerUrl(cleanUrl)
        setStatus('ok')
        setMessage('연결 확인 및 설정 저장이 완료되었습니다.')
      }
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : '서버에 연결할 수 없습니다.')
    } finally {
      setTesting(false)
    }
  }

  async function handleWorkspaceChange(nextWsId: string) {
    setDefaultWorkspaceId(nextWsId)
    await saveSettings({
      serverUrl,
      apiKey,
      defaultWorkspaceId: nextWsId,
    })
    setStatus('ok')
    setMessage('기본 소속 설정이 저장되었습니다.')
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm">
            <Bookmark className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">linktive 확장 프로그램 설정</h1>
            <p className="text-xs text-slate-500">
              자체 호스팅 linktive 서버와 API 키를 연결합니다.
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void verifyConnection(serverUrl, apiKey, defaultWorkspaceId, true)
          }}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              서버 주소 (URL)
            </label>
            <input
              type="text"
              required
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://100.82.235.57:18080 또는 https://bookmark.example.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              API 키
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                required
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="lkt_..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 font-mono text-sm focus:border-sky-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute inset-y-0 right-2 flex items-center px-1 text-slate-400 hover:text-slate-600"
                title={showKey ? '숨기기' : '표시'}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              linktive 웹 앱의 <strong>설정 → API 키</strong> 메뉴에서 발급한 키를 입력하세요.
            </p>
          </div>

          {workspaces.length > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                기본 소속 (검색 및 빠른 저장 대상)
              </label>
              <select
                value={defaultWorkspaceId}
                onChange={(e) => void handleWorkspaceChange(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.type === 'personal' ? '개인' : '공유 소속'})
                  </option>
                ))}
              </select>
              {userLabel && (
                <p className="mt-1 text-xs text-slate-500">연결된 계정: {userLabel}</p>
              )}
            </div>
          )}

          {status !== 'idle' && message && (
            <div
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                status === 'ok'
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border border-rose-200 bg-rose-50 text-rose-700'
              }`}
            >
              {status === 'ok' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
              <span>{message}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={testing}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {testing && <Loader2 className="h-4 w-4 animate-spin" />}
            {testing ? '연결 확인 중...' : '연결 테스트 및 저장'}
          </button>
        </form>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Sparkles className="h-4 w-4 text-sky-600" />
            빠른 사용 팁
          </h2>
          <div className="space-y-2.5 text-xs leading-relaxed text-slate-600">
            <div className="flex items-start gap-2.5 rounded-lg bg-slate-50 p-3">
              <Search className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
              <div>
                <p className="font-semibold text-slate-800">주소창 즉시 검색 (Omnibox)</p>
                <p className="mt-0.5">
                  브라우저 주소창에 <code className="rounded bg-white px-1.5 py-0.5 font-mono font-semibold text-sky-700">lk</code> 입력 후
                  <kbd className="mx-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[11px]">Space</kbd>
                  또는
                  <kbd className="mx-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[11px]">Tab</kbd>
                  을 누르고 검색어를 입력하면 저장된 북마크가 바로 표시됩니다.
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="font-semibold text-slate-800">단축키로 현재 페이지 저장</p>
              <p className="mt-0.5">
                <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[11px]">Alt+Shift+L</kbd>{' '}
                (macOS: <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[11px]">Cmd+Shift+L</kbd>)
                단축키로 어디서든 저장 팝업을 열 수 있습니다.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>,
)
