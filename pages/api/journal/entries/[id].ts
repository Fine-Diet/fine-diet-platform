/**
 * API Route: /api/journal/entries/[id]
 * 
 * GET: Get a single entry by ID
 * PATCH: Update an entry
 * DELETE: Delete an entry
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';
import {
  getPersonIdFromAuthUserId,
  getEntry,
  updateEntry,
  deleteEntry,
} from '@/lib/journal/journalServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Authenticate user
  const user = await getCurrentUserWithRoleFromApi(req, res);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Get person_id from auth user
  const personId = await getPersonIdFromAuthUserId(user.id);
  if (!personId) {
    return res.status(403).json({ error: 'No person record found. Please contact support.' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing entry ID' });
  }

  try {
    if (req.method === 'GET') {
      const entry = await getEntry(personId, id);
      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      return res.status(200).json({ entry });
    }

    if (req.method === 'PATCH') {
      // Body: { occurredAt?: ISO string, payload?: { name, quantity, unit } }
      const { occurredAt, payload } = req.body;

      const updates: { occurredAt?: Date; payload?: any } = {};

      if (occurredAt !== undefined) {
        const occurredAtDate = new Date(occurredAt);
        if (isNaN(occurredAtDate.getTime())) {
          return res.status(400).json({ error: 'Invalid occurredAt: must be a valid ISO date string' });
        }
        updates.occurredAt = occurredAtDate;
      }

      if (payload !== undefined) {
        updates.payload = payload;
      }

      const entry = await updateEntry({
        personId,
        entryId: id,
        ...updates,
      });

      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }

      return res.status(200).json({ entry });
    }

    if (req.method === 'DELETE') {
      await deleteEntry(personId, id);
      return res.status(200).json({ success: true });
    }

    // Method not allowed
    res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (error) {
    console.error('[API /journal/entries/[id]] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
