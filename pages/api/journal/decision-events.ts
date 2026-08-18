/**
 * POST /api/journal/decision-events
 *
 * Packet 1 instrumentation. Writes structured Plans NBA events to existing
 * people_events (event_type `other`) without schema changes.
 *
 * Body: PlansDecisionEvent (identifiers only; meal/health free text rejected).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import { logEvent } from '@/lib/peopleService';
import {
  DECISION_EVENT_CHANNEL,
  DECISION_EVENT_SOURCE,
  PEOPLE_EVENTS_COMPAT_TYPE,
  parsePlansDecisionEvent,
  toPeopleEventMetadata,
} from '@/lib/plans/decisioning/events';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;

    const event = parsePlansDecisionEvent(req.body);
    if (!event) {
      return res.status(400).json({ error: 'Invalid decision event payload.' });
    }

    await logEvent({
      personId: ctx.personId,
      eventType: PEOPLE_EVENTS_COMPAT_TYPE,
      source: DECISION_EVENT_SOURCE,
      channel: DECISION_EVENT_CHANNEL,
      metadata: toPeopleEventMetadata(event),
    });

    return res.status(204).end();
  } catch (err) {
    console.error('[API /journal/decision-events] error:', err);
    return res.status(204).end();
  }
}
