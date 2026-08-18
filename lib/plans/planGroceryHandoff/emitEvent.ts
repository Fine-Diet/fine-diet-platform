/**
 * Browser helper for Packet 9 grocery-handoff events. Fire-and-forget.
 */

import type { PlanGroceryHandoffDecisionEvent } from './events';

export function emitPlanGroceryHandoffEvent(event: PlanGroceryHandoffDecisionEvent): void {
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
