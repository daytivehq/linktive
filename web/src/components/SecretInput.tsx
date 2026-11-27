import { useEffect, useId, useState, type ComponentPropsWithoutRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useI18n } from '../i18n';

interface SecretInputProps extends Omit<ComponentPropsWithoutRef<'input'>, 'value'> {
  label: string;
  value: string;
  compact?: boolean;
}

export function SecretInput({ label, value, disabled, compact = false, ...inputProps }: SecretInputProps) {
  const { t } = useI18n();
  const id = useId();
  const [visible, setVisible] = useState(false);
  const showValue = visible && !disabled;
  const toggleLabel = t(showValue ? 'common.hideSecret' : 'common.showSecret', { field: label });

  useEffect(() => {
    if (value === '') setVisible(false);
  }, [value]);

  return (
    <div className={compact ? 'w-full sm:w-auto' : undefined}>
      <label htmlFor={id} className={compact ? 'sr-only' : 'mb-1 block text-xs font-medium text-slate-700'}>
        {label}
      </label>
      <div className="relative">
        <input
          {...inputProps}
          id={id}
          type={showValue ? 'text' : 'password'}
          value={value}
          disabled={disabled}
          className={`w-full rounded-lg border border-slate-200 pl-3 pr-11 outline-none focus:border-sky-500 disabled:bg-slate-100 ${
            compact ? 'bg-white py-1.5 text-xs' : 'py-2 text-sm'
          }`}
        />
        <button
          type="button"
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-controls={id}
          disabled={disabled}
          onClick={() => setVisible(!visible)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-500 enabled:hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50"
        >
          {showValue ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
