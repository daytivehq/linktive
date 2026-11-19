import { useMemo } from 'react';

const OPERATOR_PREFIXES = [
  'tags:',
  'tag:',
  '-tags:',
  '-tag:',
  'site:',
  'in:',
  'date:',
  'after:',
  'before:',
  'is:',
];

export function extractHighlightTerms(rawQuery: string): string[] {
  if (!rawQuery.trim()) return [];
  const terms: string[] = [];
  for (const token of rawQuery.trim().split(/\s+/)) {
    const lower = token.toLowerCase();
    if (OPERATOR_PREFIXES.some((p) => lower.startsWith(p))) {
      const colonIdx = token.indexOf(':');
      const val = colonIdx >= 0 ? token.slice(colonIdx + 1) : '';
      if (val && !lower.startsWith('-')) {
        terms.push(val);
      }
      continue;
    }
    terms.push(token);
  }
  return Array.from(new Set(terms.filter(Boolean))).sort((a, b) => b.length - a.length);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function HighlightText({ text, query }: { text: string; query: string }) {
  const regex = useMemo(() => {
    const terms = extractHighlightTerms(query);
    if (terms.length === 0) return null;
    const patterns = terms.map((term) =>
      Array.from(term)
        .map((ch) => escapeRegExp(ch))
        .join('\\s*'),
    );
    return new RegExp(`(${patterns.join('|')})`, 'gi');
  }, [query]);

  if (!regex || !text) {
    return <>{text}</>;
  }

  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, idx) => {
        if (!part) return null;
        regex.lastIndex = 0;
        const matched = regex.test(part);
        regex.lastIndex = 0;
        return matched ? (
          <strong key={idx} className="rounded-xs bg-yellow-100 px-0.5 font-bold text-slate-950">
            {part}
          </strong>
        ) : (
          <span key={idx}>{part}</span>
        );
      })}
    </>
  );
}
