/**
 * Operator API Authentication
 *
 * Machine-to-machine auth for the Operator API.
 * Validates a Bearer API key from the Authorization header against
 * the OPERATOR_API_KEY environment variable.
 *
 * Intentionally separate from the human session auth path
 * (requireRoleFromApi / Supabase SSR cookies).
 *
 * Usage:
 *   const operator = requireOperatorAuth(req, res);
 *   if (!operator) return; // 401 already sent
 */

import type { NextApiRequest, NextApiResponse } from 'next';

export interface OperatorIdentity {
  /** Always 'operator' — used for audit log actor identification */
  kind: 'operator';
  /** Identifies which key was used (first 8 chars of the key, for logging) */
  keyHint: string;
}

/**
 * Extract and validate the Operator API key from the Authorization header.
 * Returns the key string if valid, null otherwise.
 */
function extractOperatorKey(req: NextApiRequest): string | null {
  const secret = process.env.OPERATOR_API_KEY;
  if (!secret) return null;

  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;

  const provided = auth.slice(7).trim();
  if (!provided) return null;

  // Constant-time comparison to avoid timing attacks
  if (provided.length !== secret.length) return null;
  let mismatch = 0;
  for (let i = 0; i < provided.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return mismatch === 0 ? provided : null;
}

/**
 * Require valid Operator API key authentication.
 * Sends 401 and returns null if auth fails.
 */
export function requireOperatorAuth(
  req: NextApiRequest,
  res: NextApiResponse
): OperatorIdentity | null {
  if (!process.env.OPERATOR_API_KEY) {
    console.error('[OperatorAuth] OPERATOR_API_KEY env var is not set');
    res.status(500).json({ error: 'Operator API is not configured' });
    return null;
  }

  const key = extractOperatorKey(req);
  if (!key) {
    res.status(401).json({ error: 'Unauthorized: valid Operator API key required' });
    return null;
  }

  return {
    kind: 'operator',
    keyHint: key.slice(0, 8) + '...',
  };
}
