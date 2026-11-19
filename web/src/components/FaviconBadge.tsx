import { useState } from 'react';

export function FaviconBadge({
  faviconUrl,
  domain,
  size = 'md',
}: {
  faviconUrl?: string;
  domain: string;
  size?: 'sm' | 'md';
}) {
  const [failed, setFailed] = useState(false);
  const boxClass = size === 'sm' ? 'h-5 w-5 rounded' : 'h-9 w-9 rounded-lg';

  if (faviconUrl && !failed) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden bg-slate-100 ${boxClass}`}
      >
        <img
          src={faviconUrl}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className={size === 'sm' ? 'h-4 w-4 object-contain' : 'h-5 w-5 object-contain'}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-slate-100 text-xs font-semibold uppercase text-slate-500 ${boxClass}`}
    >
      {domain.slice(0, 2)}
    </div>
  );
}
