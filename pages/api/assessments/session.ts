/**
 * API Route: Update Assessment Session
 * 
 * POST /api/assessments/session
 * 
 * Responsibilities:
 * - Upsert session record (started/progress/abandoned/completed)
 * - Non-blocking, best-effort
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface SessionPayload {
  assessmentType: string;
  assessmentVersion: number;
  sessionId: string;
  status: 'started' | 'abandoned' | 'completed';
  lastQuestionIndex?: number;
}

interface SessionResponse {
  success: boolean;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SessionResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const payload = req.body as SessionPayload;

    // Validate required fields
    if (!payload.assessmentType || !payload.sessionId || !payload.status) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: assessmentType, sessionId, status',
      });
    }

    // Validate status
    const validStatuses = ['started', 'abandoned', 'completed'];
    if (!validStatuses.includes(payload.status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    // Upsert session record
    // Production uniqueness is (session_id, assessment_type, assessment_version)
    const { error: upsertError } = await supabaseAdmin
      .from('assessment_sessions')
      .upsert(
        {
          assessment_type: payload.assessmentType,
          assessment_version: payload.assessmentVersion || 1,
          session_id: payload.sessionId,
          status: payload.status,
          last_question_index: payload.lastQuestionIndex ?? 0,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'session_id,assessment_type,assessment_version',
        }
      );

    if (upsertError) {
      console.error('Error upserting assessment_session:', upsertError);
      return res.status(500).json({
        success: false,
        error: `Database error: ${upsertError.message}`,
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Session update error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

