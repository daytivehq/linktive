export type LocaleCode = 'en' | 'ko';

export interface LocaleInfo {
  code: LocaleCode;
  name: string;
  nativeName: string;
  dateLocale: string;
}

export type MessageParams = Record<string, string | number>;
