import { useEffect, useRef } from 'react';

/** Closes a fullscreen drawer/overlay on browser Back instead of navigating out of the app. */
export function useBackClose(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const pushedRef = useRef(false);
  const closedByPopRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      if (pushedRef.current && !closedByPopRef.current) {
        pushedRef.current = false;
        window.history.back();
      }
      closedByPopRef.current = false;
      return;
    }

    pushedRef.current = true;
    closedByPopRef.current = false;
    window.history.pushState({ ...(window.history.state ?? {}), __linktiveOverlay: true }, '');

    const onPopState = () => {
      if (!pushedRef.current) return;
      pushedRef.current = false;
      closedByPopRef.current = true;
      onCloseRef.current();
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [isOpen]);
}
