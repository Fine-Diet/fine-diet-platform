/**
 * API Route: Batch Insert Assessment Events
 * 
 * POST /api/assessments/events
 * 
 * Responsibilities:
 * - Batch insert analytics events
 * - Best-effort (failures don't block UX)
 * - Non-blocking
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface EventPayload {
  assessmentType: string;
  assessmentVersion: number;
  sessionId: string;
  eventType: string;
  primaryAvatar?: string;
  metadata?: Record<string, unknown>;
}

interface EventsPayload {
  events: EventPayload[];
}

interface EventsResponse {
  success: boolean;
  inserted?: number;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EventsResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const payload = req.body as EventsPayload;

    // Validate required fields
    if (!payload.events || !Array.isArray(payload.events) || payload.events.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'events must be a non-empty array',
      });
    }

    // Validate each event
    for (const event of payload.events) {
      if (!event.assessmentType || !event.sessionId || !event.eventType) {
        return res.status(400).json({
          success: false,
          error: 'Each event must have: assessmentType, sessionId, eventType',
        });
      }
    }

    // Prepare insert data
    // Map to schema: event_name (NOT event_type), properties (NOT metadata)
    const insertData = payload.events.map((event) => ({
      assessment_type: event.assessmentType,
      assessment_version: event.assessmentVersion || 1,
      session_id: event.sessionId,
      event_name: event.eventType,
      primary_avatar: event.primaryAvatar || null,
      properties: event.metadata || {},
    }));

    // Batch insert (best-effort)
    const { data, error: insertError } = await supabaseAdmin
      .from('assessment_events')
      .insert(insertData)
      .select('id');

    if (insertError) {
      console.error('Error inserting assessment_events:', insertError);
      // Return success anyway (best-effort)
      return res.status(200).json({
        success: true,
        inserted: 0,
        error: insertError.message,
      });
    }

    return res.status(200).json({
      success: true,
      inserted: data?.length || 0,
    });
  } catch (error) {
    console.error('Events insert error:', error);
    // Return success anyway (best-effort)
    return res.status(200).json({
      success: true,
      inserted: 0,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

