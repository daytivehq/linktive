import { useEffect, useRef, useState, type RefObject } from 'react';
import { Calendar, Folder, Globe, Hash, Search, SlidersHorizontal, Star, ArrowRight } from 'lucide-react';

interface SearchBarProps {
  value: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onChange: (next: string) => void;
  onOpenAdvancedSearch: () => void;
}

const FILTER_SUGGESTIONS = [
  { token: 'tags:', label: '태그 포함', desc: '예: tags:세금', Icon: Hash },
  { token: '-tags:', label: '태그 제외', desc: '예: -tags:임시', Icon: Hash },
  { token: 'site:', label: '사이트 도메인', desc: '예: site:github.com', Icon: Globe },
  { token: 'in:', label: '컬렉션 이름', desc: '예: in:개발', Icon: Folder },
  { token: 'date:', label: '특정 날짜', desc: '예: date:2026-11-19', Icon: Calendar },
  { token: 'after:', label: '날짜 이후', desc: '예: after:2026-11-01', Icon: Calendar },
  { token: 'before:', label: '날짜 이전', desc: '예: before:2026-11-30', Icon: Calendar },
  { token: 'is:favorite ', label: '즐겨찾기만', desc: '즐겨찾기 필터', Icon: Star },
];

export function SearchBar({ value, inputRef: externalRef, onChange, onOpenAdvancedSearch }: SearchBarProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = externalRef ?? internalRef;

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
        placeholder="북마크 검색..."
        className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-10 text-sm outline-none transition focus:border-sky-500 focus:bg-white"
      />
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="검색 필터 연산자"
        aria-label="검색 필터 연산자"
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 transition ${
          open ? 'bg-sky-50 text-sky-600' : 'text-slate-400 hover:bg-slate-200/70 hover:text-slate-700'
        }`}
      >
        <SlidersHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <div className="px-2 py-1 text-xs font-semibold text-slate-400">검색 연산자 추가</div>
          <div className="mt-1 space-y-0.5">
            {FILTER_SUGGESTIONS.map((item) => {
              const Icon = item.Icon;
              return (
                <button
                  key={item.token}
                  type="button"
                  onClick={() => appendOperator(item.token)}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-slate-100"
                >
                  <span className="flex items-center gap-2 font-medium text-slate-700">
                    <Icon className="h-3.5 w-3.5 text-slate-400" />
                    <span>{item.label}</span>
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">{item.desc}</span>
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
              <span>Advanced Search 가이드</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
