/**
 * Browser helper for Meal Rhythm events. Fire-and-forget.
 */

import type { MealRhythmDecisionEvent } from './events';

export function emitMealRhythmEvent(event: MealRhythmDecisionEvent): void {
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
