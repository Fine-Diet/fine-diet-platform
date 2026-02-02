/**
 * GET /api/foods/upc/[code]
 * 
 * Look up food by UPC barcode.
 * Creates provisional record if not found (for immediate logging).
 * 
 * Supports various UPC formats:
 * - UPC-A (12 digits)
 * - EAN-13 (13 digits)
 * - GTIN-14 (14 digits)
 * - Short codes (11 digits, missing leading zero)
 * - Codes with dashes/spaces (automatically stripped)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';
import { getPersonIdFromAuthUserId } from '@/lib/journal/journalServerService';
import { lookupByUpc } from '@/lib/food/foodServerService';
import {
  normalizeUpcToDigits,
  validateUpcLength,
  buildUpcCandidates,
  logUpcDebug,
} from '@/lib/food/upcNormalization';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const code = req.query.code as string;
    if (!code) {
      return res.status(400).json({ error: 'UPC code is required' });
    }

    // Normalize to digits only
    const raw = normalizeUpcToDigits(code);
    
    // Validate length
    const validationError = validateUpcLength(raw);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Build candidate UPCs to search
    const candidates = buildUpcCandidates(raw);
    
    // Debug logging (dev only)
    logUpcDebug(code, raw, candidates);

    // Try to get authenticated user
    let personId: string | null = null;
    try {
      const user = await getCurrentUserWithRoleFromApi(req, res);
      if (user) {
        personId = await getPersonIdFromAuthUserId(user.id);
      }
    } catch {
      // Anonymous user - continue without personId
    }

    const createProvisional = req.query.provisional !== 'false';
    
    // Pass candidates to lookup function
    const result = await lookupByUpc(candidates, personId, { 
      createProvisional,
      originalCode: code, // Keep original for provisional record
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('[API /api/foods/upc] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
