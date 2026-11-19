import { useEffect, useRef } from 'react';

type EscapeHandler = () => void;

const escapeStack: EscapeHandler[] = [];
let escapeListenerAttached = false;

function handleGlobalEscape(e: KeyboardEvent) {
  if (e.key !== 'Escape' || escapeStack.length === 0) return;
  const top = escapeStack[escapeStack.length - 1];
  e.preventDefault();
  top();
}

/** Runs only the topmost registered handler when Escape is pressed. */
export function useEscapeKey(handler: EscapeHandler, enabled = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    if (!escapeListenerAttached) {
      window.addEventListener('keydown', handleGlobalEscape);
      escapeListenerAttached = true;
    }
    const wrapped: EscapeHandler = () => handlerRef.current();
    escapeStack.push(wrapped);
    return () => {
      const idx = escapeStack.lastIndexOf(wrapped);
      if (idx !== -1) escapeStack.splice(idx, 1);
    };
  }, [enabled]);
}
