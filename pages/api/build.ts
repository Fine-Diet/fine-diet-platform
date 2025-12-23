/**
 * API Route: Build Fingerprint
 * 
 * GET /api/build
 * 
 * Returns the current build fingerprint for verification
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const BUILD_FINGERPRINT = 'gc_v2_ssr_diag_001';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ build: string; ssr: boolean }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ build: '', ssr: false });
  }

  return res.status(200).json({
    build: BUILD_FINGERPRINT,
    ssr: true,
  });
}

