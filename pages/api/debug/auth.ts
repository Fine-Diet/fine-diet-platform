/**
 * Debug Auth Endpoint
 * 
 * Returns the current user's authentication status and role from the server's perspective.
 * Useful for debugging authentication issues.
 * 
 * WARNING: This is a debug endpoint. Remove or lock it down in production.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await getCurrentUserWithRoleFromApi(req, res);

    if (!user) {
      return res.status(200).json({
        user: null,
        raw: {
          hasSession: false,
          profileFound: false,
        },
      });
    }

    return res.status(200).json({
      user,
      raw: {
        hasSession: true,
        profileFound: true,
      },
    });
  } catch (error) {
    console.error('Debug auth endpoint error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

