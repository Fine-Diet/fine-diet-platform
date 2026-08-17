/**
 * Browser helper for Packet 8 repeat events. Fire-and-forget.
 */

import type { PlanRepeatDecisionEvent } from './events';

export function emitPlanRepeatEvent(event: PlanRepeatDecisionEvent): void {
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
