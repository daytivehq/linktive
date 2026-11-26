import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowRight, Calendar, Folder, Globe, Hash, Search, SlidersHorizontal, Star } from 'lucide-react';
import { useI18n } from '../i18n';

interface SearchBarProps {
  value: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onChange: (next: string) => void;
  onOpenAdvancedSearch: () => void;
}

export function SearchBar({ value, inputRef: externalRef, onChange, onOpenAdvancedSearch }: SearchBarProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = externalRef ?? internalRef;

  const filterSuggestions = [
    { token: 'tags:', label: t('search.op.tags'), desc: t('search.op.tagsEx'), Icon: Hash },
    { token: '-tags:', label: t('search.op.excludeTags'), desc: t('search.op.excludeTagsEx'), Icon: Hash },
    { token: 'site:', label: t('search.op.site'), desc: t('search.op.siteEx'), Icon: Globe },
    { token: 'in:', label: t('search.op.in'), desc: t('search.op.inEx'), Icon: Folder },
    { token: 'date:', label: t('search.op.date'), desc: t('search.op.dateEx'), Icon: Calendar },
    { token: 'after:', label: t('search.op.after'), desc: t('search.op.afterEx'), Icon: Calendar },
    { token: 'before:', label: t('search.op.before'), desc: t('search.op.beforeEx'), Icon: Calendar },
    { token: 'is:favorite ', label: t('search.op.favorite'), desc: t('search.op.favoriteDesc'), Icon: Star },
  ];

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [open]);

  const appendOperator = (token: string) => {
    const trimmed = value.trimEnd();
    const next = trimmed ? `${trimmed} ${token}` : token;
    onChange(next);
    setOpen(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div ref={containerRef} className="relative w-full sm:flex-1 sm:max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('search.placeholder')}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-10 text-sm outline-none transition focus:border-sky-500 focus:bg-white"
      />
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title={t('search.filterOperators')}
        aria-label={t('search.filterOperators')}
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 transition ${
          open ? 'bg-sky-50 text-sky-600' : 'text-slate-400 hover:bg-slate-200/70 hover:text-slate-700'
        }`}
      >
        <SlidersHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <div className="px-2 py-1 text-xs font-semibold text-slate-400">
            {t('search.addOperator')}
          </div>
          <div className="mt-1 space-y-0.5">
            {filterSuggestions.map((item) => {
              const Icon = item.Icon;
              return (
                <button
                  key={item.token}
                  type="button"
                  onClick={() => appendOperator(item.token)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-slate-100"
                >
                  <span className="flex min-w-0 items-center gap-2 font-medium text-slate-700">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-slate-400">{item.desc}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 border-t border-slate-100 pt-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenAdvancedSearch();
              }}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-sky-600 hover:bg-sky-50"
            >
              <span>{t('search.advancedGuide')}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
