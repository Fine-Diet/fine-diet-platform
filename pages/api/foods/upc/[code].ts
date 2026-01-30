/**
 * GET /api/foods/upc/[code]
 * 
 * Look up food by UPC barcode.
 * Creates provisional record if not found (for immediate logging).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';
import { getPersonIdFromAuthUserId } from '@/lib/journal/journalServerService';
import { lookupByUpc } from '@/lib/food/foodServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const code = req.query.code as string;
    if (!code || code.length < 8) {
      return res.status(400).json({ error: 'Invalid UPC code' });
    }

    // Try to get authenticated user
    let personId: string | null = null;
    try {
      const user = await getCurrentUserWithRoleFromApi(req, res);
      if (user) {
        personId = await getPersonIdFromAuthUserId(user.id);
      }
    } catch {
      // Anonymous user
    }

    const createProvisional = req.query.provisional !== 'false';
    const result = await lookupByUpc(code, personId, { createProvisional });

    return res.status(200).json(result);
  } catch (error) {
    console.error('[API /api/foods/upc] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
