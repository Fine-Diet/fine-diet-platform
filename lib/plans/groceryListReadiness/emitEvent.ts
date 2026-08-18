/**
 * Browser helper for Packet 10 grocery-list-readiness events. Fire-and-forget.
 */

import type { GroceryListReadinessDecisionEvent } from './events';

export function emitGroceryListReadinessEvent(event: GroceryListReadinessDecisionEvent): void {
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
