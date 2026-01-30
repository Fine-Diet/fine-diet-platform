/**
 * GET /api/foods/[id]
 * 
 * Get a single food by ID.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getFoodById } from '@/lib/food/foodServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const id = req.query.id as string;
    if (!id) {
      return res.status(400).json({ error: 'Missing food ID' });
    }

    const food = await getFoodById(id);
    if (!food) {
      return res.status(404).json({ error: 'Food not found' });
    }

    return res.status(200).json({ food });
  } catch (error) {
    console.error('[API /api/foods/[id]] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
