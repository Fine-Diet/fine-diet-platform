/**
 * Browser helper for Packet 7 structure-ensure events. Fire-and-forget.
 */

import type { PlanStructureDecisionEvent } from './events';

export function emitPlanStructureEvent(event: PlanStructureDecisionEvent): void {
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
