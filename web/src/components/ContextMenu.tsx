import { useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';

export interface ContextMenuItem {
  label: string;
  Icon?: LucideIcon;
  danger?: boolean;
  dividerBefore?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  useEscapeKey(onClose);

  useEffect(() => {
    const onMouseDown = () => onClose();
    const onScroll = () => onClose();

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  // Keep menu inside the viewport bounds.
  const estimatedWidth = 188;
  const estimatedHeight = items.length * 34 + 16;
  const left = Math.min(x, Math.max(8, window.innerWidth - estimatedWidth - 8));
  const top = Math.min(y, Math.max(8, window.innerHeight - estimatedHeight - 8));

  return (
    <div
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-50 w-44 rounded-xl border border-slate-200 bg-white p-1.5 text-xs shadow-xl"
    >
      {items.map((item, idx) => {
        const Icon = item.Icon;
        return (
          <div key={`${item.label}-${idx}`}>
            {item.dividerBefore && <div className="my-1 border-t border-slate-100" />}
            <button
              type="button"
              onClick={() => {
                onClose();
                item.onClick();
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left ${
                item.danger
                  ? 'text-rose-600 hover:bg-rose-50'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {Icon && (
                <Icon className={`h-3.5 w-3.5 ${item.danger ? '' : 'text-slate-500'}`} />
              )}
              <span>{item.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
