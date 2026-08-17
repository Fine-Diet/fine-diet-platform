/**
 * Browser helper for Pantry Quick Start events. Fire-and-forget.
 */

import type { PantryQuickStartDecisionEvent } from './events';

export function emitPantryQuickStartEvent(event: PantryQuickStartDecisionEvent): void {
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
