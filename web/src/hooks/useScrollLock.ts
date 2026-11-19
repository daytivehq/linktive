import { useEffect } from 'react';

let activeScrollLocks = 0;

/** Locks background page and split-pane scrolling while any modal or drawer is open. */
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    activeScrollLocks += 1;
    if (activeScrollLocks === 1) {
      document.documentElement.classList.add('scroll-locked');
    }
    return () => {
      activeScrollLocks = Math.max(0, activeScrollLocks - 1);
      if (activeScrollLocks === 0) {
        document.documentElement.classList.remove('scroll-locked');
      }
    };
  }, [active]);
}
