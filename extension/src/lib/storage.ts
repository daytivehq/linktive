export interface ExtensionSettings {
  serverUrl: string
  apiKey: string
  defaultWorkspaceId: string
}

const STORAGE_KEY = 'linktive_settings'

export const DEFAULT_SETTINGS: ExtensionSettings = {
  serverUrl: '',
  apiKey: '',
  defaultWorkspaceId: '',
}

export function normalizeServerUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `http://${trimmed}`
}

export async function getSettings(): Promise<ExtensionSettings> {
  const data = await chrome.storage.local.get(STORAGE_KEY)
  const stored = (data[STORAGE_KEY] as Partial<ExtensionSettings> | undefined) ?? {}
  return {
    serverUrl: normalizeServerUrl(stored.serverUrl ?? ''),
    apiKey: (stored.apiKey ?? '').trim(),
    defaultWorkspaceId: (stored.defaultWorkspaceId ?? '').trim(),
  }
}

export async function saveSettings(next: ExtensionSettings): Promise<ExtensionSettings> {
  const normalized: ExtensionSettings = {
    serverUrl: normalizeServerUrl(next.serverUrl),
    apiKey: next.apiKey.trim(),
    defaultWorkspaceId: next.defaultWorkspaceId.trim(),
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: normalized })
  return normalized
}
