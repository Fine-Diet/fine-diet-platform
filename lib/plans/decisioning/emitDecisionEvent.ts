/**
 * Browser helper for Plans NBA events. Fire-and-forget; never blocks UI.
 */

import type { PlansDecisionEvent } from './types';

export function emitPlansDecisionEvent(event: PlansDecisionEvent): void {
  if (typeof window === 'undefined') return;
  try {
    void fetch('/api/journal/decision-events', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
    }).catch(() => {
      /* best-effort */
    });
  } catch {
    /* best-effort */
  }
}
