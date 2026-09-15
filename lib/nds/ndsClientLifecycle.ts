/**
 * Browser lifecycle wiring for the shared NDS day store.
 *
 * Focus/visibility, reconnect, cross-tab invalidation, and local midnight
 * revalidate dirty-or-subscribed days. Token refresh is handled by the auth
 * binder and must not reset the store.
 */

import { advanceNdsTodayLocal, notifyNdsSourceChanged } from './ndsDayStore';

const CROSS_TAB_KEY = 'fd_nds_invalidate';

function todayLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Other tabs pick this up via the storage event. Same-tab writes do not loop. */
export function broadcastNdsInvalidation(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CROSS_TAB_KEY, String(Date.now()));
  } catch {
    // Private mode or disabled storage is not a reason to skip local invalidation.
  }
}

export function startNdsClientLifecycle(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined;
  }

  const onVisible = (): void => {
    if (document.visibilityState === 'visible') notifyNdsSourceChanged();
  };
  const onOnline = (): void => {
    notifyNdsSourceChanged();
  };
  const onStorage = (event: StorageEvent): void => {
    if (event.key === CROSS_TAB_KEY) notifyNdsSourceChanged();
  };

  let lastDate = todayLocal();
  const midnightTimer = window.setInterval(() => {
    const today = todayLocal();
    if (today === lastDate) return;
    lastDate = today;
    advanceNdsTodayLocal(today);
    notifyNdsSourceChanged();
  }, 30_000);

  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  window.addEventListener('online', onOnline);
  window.addEventListener('storage', onStorage);

  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('storage', onStorage);
    window.clearInterval(midnightTimer);
  };
}
