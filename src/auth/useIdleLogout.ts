import { useEffect, useRef } from 'react';

const EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;

/**
 * Calls onTimeout once after `minutes` without activity. Also checks when the
 * page becomes visible again, because a sleeping tablet does not run timers.
 * minutes <= 0 disables it.
 */
export function useIdleLogout(minutes: number, onTimeout: () => void): void {
  const last = useRef(Date.now());
  const fired = useRef(false);
  const cb = useRef(onTimeout);
  cb.current = onTimeout;

  useEffect(() => {
    if (minutes <= 0) return;
    const limit = minutes * 60_000;
    last.current = Date.now();
    fired.current = false;

    const check = () => {
      if (!fired.current && Date.now() - last.current >= limit) {
        fired.current = true;
        cb.current();
      }
    };
    const touch = () => {
      if (!fired.current) last.current = Date.now();
    };
    const onVisible = () => {
      if (document.visibilityState !== 'hidden') check();
    };

    EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);
    const id = window.setInterval(check, 15_000);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(id);
    };
  }, [minutes]);
}
