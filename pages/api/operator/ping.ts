/**
 * Operator API: Ping / Connection Test
 *
 * GET /api/operator/ping
 *
 * Zero-side-effect endpoint for verifying agent connectivity and auth.
 * Returns the actor key hint so the caller can confirm which key was used.
 * Safe to call on a schedule or from a health-check routine.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireOperatorAuth } from '@/lib/operator/auth';

interface PingResponse {
  ok: true;
  actor: string;
  timestamp: string;
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<PingResponse | { ok: false; error: string }>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const operator = requireOperatorAuth(req, res);
  if (!operator) return;

  return res.status(200).json({
    ok: true,
    actor: operator.keyHint,
    timestamp: new Date().toISOString(),
  });
}
