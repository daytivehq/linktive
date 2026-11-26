import { Globe } from 'lucide-react';
import { SUPPORTED_LOCALES, useI18n, type LocaleCode } from '../i18n';

interface LanguageSelectProps {
  value?: LocaleCode;
  onChange?: (next: LocaleCode) => void;
  compact?: boolean;
}

export function LanguageSelect({ value, onChange, compact = false }: LanguageSelectProps) {
  const { locale, setLocale, t } = useI18n();
  const active = value ?? locale;

  const handleChange = (next: LocaleCode) => {
    if (onChange) {
      onChange(next);
    } else {
      setLocale(next);
    }
  };

  return (
    <label
      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 ${
        compact ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'
      }`}
    >
      <Globe className={compact ? 'h-3.5 w-3.5 text-slate-400' : 'h-4 w-4 text-slate-400'} />
      <select
        aria-label={t('common.language')}
        value={active}
        onChange={(e) => handleChange(e.target.value as LocaleCode)}
        className="bg-transparent font-medium outline-none cursor-pointer"
      >
        {SUPPORTED_LOCALES.map((item) => (
          <option key={item.code} value={item.code}>
            {item.nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}
