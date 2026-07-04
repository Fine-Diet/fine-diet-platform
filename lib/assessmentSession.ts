/**
 * Session Management for Assessments
 * Uses localStorage to generate and persist session IDs
 */

const SESSION_ID_KEY = 'fd_assessment_session_id';
/**
 * Separate key for runtime preview sessions so preview runs never collide with
 * or pollute a user's real assessment session. Preview IDs are prefixed with
 * `fd-preview-` so they are clearly distinguishable in the `assessment_sessions`
 * table (the sessions table has no is_preview column — the prefix is the marker).
 */
const PREVIEW_SESSION_ID_KEY = 'fd_assessment_preview_session_id';
const PREVIEW_SESSION_PREFIX = 'fd-preview-';

/**
 * Get or create a session ID
 * Returns existing session ID from localStorage, or creates a new one
 */
export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') {
    // Server-side: generate a temporary ID (shouldn't happen in practice)
    return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  let sessionId = localStorage.getItem(SESSION_ID_KEY);

  if (!sessionId) {
    // Generate a new UUID-like session ID
    sessionId = generateSessionId();
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  }

  return sessionId;
}

/**
 * Get or create a PREVIEW session ID. Stored under a dedicated localStorage key
 * and prefixed so preview sessions are isolated from production sessions and
 * identifiable in analytics/session data.
 */
export function getOrCreatePreviewSessionId(): string {
  if (typeof window === 'undefined') {
    return `${PREVIEW_SESSION_PREFIX}temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  let sessionId = localStorage.getItem(PREVIEW_SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = `${PREVIEW_SESSION_PREFIX}${generateSessionId()}`;
    localStorage.setItem(PREVIEW_SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

/** True when a session ID was produced by the preview session helper. */
export function isPreviewSessionId(sessionId: string | null | undefined): boolean {
  return !!sessionId && sessionId.startsWith(PREVIEW_SESSION_PREFIX);
}

/**
 * Generate a UUID-like session ID
 */
function generateSessionId(): string {
  return `fd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a UUID v4 (for submissionId)
 */
export function generateUUID(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    // Use crypto API if available
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    
    // Set version (4) and variant bits
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10
    
    // Convert to UUID string format
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join('-');
  }
  
  // Fallback for environments without crypto API
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Clear session ID (useful for testing or reset)
 */
export function clearSessionId(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_ID_KEY);
  }
}

