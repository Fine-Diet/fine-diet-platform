/**
 * useSearchSession — Phase 3
 *
 * Returns a stable session ID for the current browser tab.
 * Stored in sessionStorage so it persists across navigation within the tab
 * but resets on new tabs / new browser sessions.
 *
 * Used to:
 * - identify distinct sessions in food_search_events
 * - count distinct sessions in off_promotion_candidates
 */

import { useState } from 'react';

const SESSION_KEY = 'fd_search_session_id';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = generateId();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    // sessionStorage blocked (private mode, etc.) — use in-memory fallback
    return generateId();
  }
}

/**
 * Returns a stable session ID for the current tab.
 * Empty string during SSR (never sent server-side).
 */
export function useSearchSession(): string {
  const [sessionId] = useState<string>(getOrCreateSessionId);
  return sessionId;
}
