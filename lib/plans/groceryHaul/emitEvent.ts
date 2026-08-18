/**
 * Browser helper for Packet 11B grocery-haul events. Fire-and-forget.
 */

import type { GroceryHaulDecisionEvent } from './events';

export function emitGroceryHaulEvent(event: GroceryHaulDecisionEvent): void {
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
