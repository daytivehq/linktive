import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Bookmark,
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  Search,
  Sparkles,
} from 'lucide-react'
import './index.css'
import { Workspace, fetchMe, requestErrorMessage } from './lib/api'
import { localizePage, t } from './lib/i18n'
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
      setMessage(t('credentials_required'))
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
        setMessage(t('connection_saved'))
      }
    } catch (err) {
      setStatus('error')
      setMessage(requestErrorMessage(err, 'connection_error'))
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
    setMessage(t('workspace_saved'))
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm">
            <Bookmark className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{t('options_title')}</h1>
            <p className="text-xs text-slate-500">
              {t('options_intro')}
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
              {t('server_url')}
            </label>
            <input
              type="text"
              required
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder={t('server_url_placeholder')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t('api_key')}
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
                title={t(showKey ? 'hide_api_key' : 'show_api_key')}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {t('api_key_instructions')}
            </p>
          </div>

          {workspaces.length > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t('default_workspace')}
              </label>
              <select
                value={defaultWorkspaceId}
                onChange={(e) => void handleWorkspaceChange(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({t(w.type === 'personal' ? 'personal_workspace' : 'shared_workspace')})
                  </option>
                ))}
              </select>
              {userLabel && (
                <p className="mt-1 text-xs text-slate-500">{t('connected_account', userLabel)}</p>
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
            {t(testing ? 'testing_connection' : 'test_and_save')}
          </button>
        </form>

        <nav aria-label={t('related_links')} className="flex flex-wrap gap-2 text-sm">
          {[
            [t('chrome_web_store'), 'https://chromewebstore.google.com/detail/linktive/opalenmkjhflejpemlkbliiadchgjhje'],
            ['GitHub', 'https://github.com/daytivehq/linktive'],
          ].map(([label, href]) => (
            <a key={href} href={href} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">
              {label}
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            </a>
          ))}
        </nav>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Sparkles className="h-4 w-4 text-sky-600" />
            {t('quick_tips')}
          </h2>
          <div className="space-y-2.5 text-xs leading-relaxed text-slate-600">
            <div className="flex items-start gap-2.5 rounded-lg bg-slate-50 p-3">
              <Search className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
              <div>
                <p className="font-semibold text-slate-800">{t('omnibox_tip_title')}</p>
                <p className="mt-0.5">
                  {t('omnibox_tip')}
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="font-semibold text-slate-800">{t('shortcut_tip_title')}</p>
              <p className="mt-0.5">
                {t('shortcut_tip')}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

localizePage('options_title')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>,
)
