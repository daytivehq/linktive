import { fetchMe, searchBookmarks } from './lib/api'
import { getSettings, saveSettings } from './lib/storage'

const OPEN_OPTIONS_SENTINEL = '__linktive_open_options__'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatOmniboxMatch(text: string, query: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 1)
    .slice(0, 5)
  if (terms.length === 0) return escapeXml(clean)

  const regex = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi')
  return clean
    .split(regex)
    .map((part, idx) => (idx % 2 === 1 ? `<match>${escapeXml(part)}</match>` : escapeXml(part)))
    .join('')
}

function openUrl(url: string, disposition: chrome.omnibox.OnInputEnteredDisposition) {
  if (disposition === 'currentTab') {
    void chrome.tabs.update({ url })
  } else if (disposition === 'newBackgroundTab') {
    void chrome.tabs.create({ url, active: false })
  } else {
    void chrome.tabs.create({ url, active: true })
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined
let activeController: AbortController | undefined
let requestSeq = 0

chrome.omnibox.setDefaultSuggestion({
  description: 'linktive에서 <match>%s</match> 검색 (Enter: 웹 검색 페이지 열기)',
})

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (activeController) activeController.abort()

  const seq = ++requestSeq
  debounceTimer = setTimeout(async () => {
    try {
      const settings = await getSettings()
      if (!settings.serverUrl || !settings.apiKey) {
        suggest([
          {
            content: OPEN_OPTIONS_SENTINEL,
            description: '<dim>linktive 서버 URL과 API 키를 먼저 설정하세요 (클릭하여 설정 열기)</dim>',
          },
        ])
        return
      }

      let workspaceId = settings.defaultWorkspaceId
      if (!workspaceId) {
        const me = await fetchMe(settings.serverUrl, settings.apiKey)
        workspaceId = me.workspaces[0]?.id ?? ''
        if (workspaceId) {
          await saveSettings({ ...settings, defaultWorkspaceId: workspaceId })
        }
      }
      if (!workspaceId || seq !== requestSeq) return

      activeController = new AbortController()
      const res = await searchBookmarks(
        settings.serverUrl,
        settings.apiKey,
        workspaceId,
        text,
        8,
        activeController.signal,
      )
      if (seq !== requestSeq) return

      const suggestions: chrome.omnibox.SuggestResult[] = res.items.map((bm) => {
        const title = bm.title || bm.domain || bm.url
        const tagsPart =
          bm.tags.length > 0
            ? ` <dim>${escapeXml(bm.tags.slice(0, 3).map((t) => `#${t}`).join(' '))}</dim>`
            : ''
        return {
          content: bm.url,
          description: `${formatOmniboxMatch(title, text)} <dim>—</dim> <url>${formatOmniboxMatch(bm.url, text)}</url>${tagsPart}`,
        }
      })

      suggest(suggestions)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError' || seq !== requestSeq) return
      suggest([
        {
          content: OPEN_OPTIONS_SENTINEL,
          description: '<dim>검색 오류: linktive 연결 설정을 확인하세요</dim>',
        },
      ])
    }
  }, 150)
})

chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  if (text === OPEN_OPTIONS_SENTINEL) {
    await chrome.runtime.openOptionsPage()
    return
  }
  if (/^https?:\/\//i.test(text)) {
    openUrl(text, disposition)
    return
  }

  const settings = await getSettings()
  if (!settings.serverUrl) {
    await chrome.runtime.openOptionsPage()
    return
  }
  const q = text.trim()
  const target = q
    ? `${settings.serverUrl}/search?q=${encodeURIComponent(q)}`
    : `${settings.serverUrl}/`
  openUrl(target, disposition)
})
