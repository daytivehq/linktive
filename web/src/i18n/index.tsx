import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, type MessageKey, type Messages } from './locales/en';
import { ko } from './locales/ko';
import type { LocaleCode, LocaleInfo, MessageParams } from './types';

export type { LocaleCode, LocaleInfo, MessageKey, MessageParams, Messages };

export const SUPPORTED_LOCALES: LocaleInfo[] = [
  { code: 'en', name: 'English', nativeName: 'English', dateLocale: 'en-US' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', dateLocale: 'ko-KR' },
];

const LOCALE_STORAGE_KEY = 'linktive_locale';

const DICTIONARIES: Record<LocaleCode, Messages> = {
  en,
  ko,
};

export function normalizeLocale(raw?: string | null): LocaleCode {
  if (!raw) return 'en';
  const lower = raw.toLowerCase().trim();
  if (lower.startsWith('ko')) return 'ko';
  return 'en';
}

function loadInitialLocale(): LocaleCode {
  try {
    return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return 'en';
  }
}

interface I18nContextValue {
  locale: LocaleCode;
  dateLocale: string;
  setLocale: (next: LocaleCode) => void;
  t: (key: MessageKey, params?: MessageParams) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  dateLocale: 'en-US',
  setLocale: () => {},
  t: (key) => en[key],
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(loadInitialLocale);

  const setLocale = useCallback((next: LocaleCode) => {
    const normalized = normalizeLocale(next);
    setLocaleState(normalized);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, normalized);
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const localeMeta = useMemo(
    () => SUPPORTED_LOCALES.find((l) => l.code === locale) ?? SUPPORTED_LOCALES[0],
    [locale],
  );

  const t = useCallback(
    (key: MessageKey, params?: MessageParams) => {
      const dict = DICTIONARIES[locale] ?? en;
      let template = dict[key] ?? en[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          template = template.replaceAll(`{${k}}`, String(v));
        }
      }
      return template;
    },
    [locale],
  );

  const value = useMemo(
    () => ({
      locale,
      dateLocale: localeMeta.dateLocale,
      setLocale,
      t,
    }),
    [locale, localeMeta.dateLocale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
