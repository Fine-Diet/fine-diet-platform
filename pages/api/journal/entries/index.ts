/**
 * API Route: /api/journal/entries
 * 
 * GET: List entries for a day (requires ?date=YYYY-MM-DD)
 * POST: Create a new entry
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAuth, resolveJournalTargetPerson, requireCallerJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  createEntry,
  listEntriesByDay,
  listEntriesByDayAndBlock,
} from '@/lib/journal/journalServerService';
import type { TimeBlock } from '@/lib/journal/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Authenticate user (journal access checked per-branch below)
  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return; // 401 or 403 already sent

  try {
    if (req.method === 'GET') {
      // Resolve target person (checks journal access for self or client)
      const targetPersonId = await resolveJournalTargetPerson(req, res, ctx);
      if (!targetPersonId) return; // 403 already sent

      // GET /api/journal/entries?date=YYYY-MM-DD&block=morning|midday|evening
      const { date, block } = req.query;

      if (!date || typeof date !== 'string') {
        return res.status(400).json({ error: 'Missing required query param: date (YYYY-MM-DD)' });
      }

      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
      }

      let entries;
      if (block && typeof block === 'string') {
        const validBlocks: TimeBlock[] = ['morning', 'midday', 'evening'];
        if (!validBlocks.includes(block as TimeBlock)) {
          return res.status(400).json({ error: 'Invalid block. Use: morning, midday, or evening.' });
        }
        entries = await listEntriesByDayAndBlock(targetPersonId, date, block as TimeBlock);
      } else {
        entries = await listEntriesByDay(targetPersonId, date);
      }

      return res.status(200).json({ entries });
    }

    if (req.method === 'POST') {
      // Writes are always self-only — require caller journal access
      if (!(await requireCallerJournalAccess(res, ctx))) return;
      const { personId } = ctx;

      // POST /api/journal/entries
      // Body: { occurredAt: ISO string, entryType?: string, payload?: { name, quantity, unit } }
      const { occurredAt, entryType, payload } = req.body;

      if (!occurredAt) {
        return res.status(400).json({ error: 'Missing required field: occurredAt' });
      }

      const occurredAtDate = new Date(occurredAt);
      if (isNaN(occurredAtDate.getTime())) {
        return res.status(400).json({ error: 'Invalid occurredAt: must be a valid ISO date string' });
      }

      const entry = await createEntry({
        personId,
        entryType: entryType || 'intake',
        occurredAt: occurredAtDate,
        payload: payload || {},
      });

      return res.status(201).json({ entry });
    }

    // Method not allowed
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (error) {
    console.error('[API /journal/entries] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
