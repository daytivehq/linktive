export function t(key: string, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(key, substitutions)
}

export function localizePage(titleKey: string) {
  document.documentElement.lang = t('locale')
  document.title = t(titleKey)
}
