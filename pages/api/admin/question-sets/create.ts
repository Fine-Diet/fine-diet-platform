/**
 * API Route: Create Question Set Identity
 * 
 * POST /api/admin/question-sets/create
 * 
 * Creates or updates a question set identity record.
 * Requires editor or admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface CreateQuestionSetRequest {
  assessment_type: string;
  assessment_version: string;
  locale?: string | null;
}

interface CreateQuestionSetResponse {
  questionSet?: {
    id: string;
    assessment_type: string;
    assessment_version: string;
    locale: string | null;
    slug: string;
    created_at: string;
    updated_at: string;
  };
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateQuestionSetResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) {
    return; // Response already sent by requireRoleFromApi
  }

  try {
    const { assessment_type, assessment_version, locale } = req.body as CreateQuestionSetRequest;

    if (!assessment_type || !assessment_version) {
      return res.status(400).json({
        error: 'assessment_type and assessment_version are required',
      });
    }

    // Upsert question set identity (idempotent)
    // Handle NULL locale: use null in DB if locale is null/undefined/empty string
    const insertData: { assessment_type: string; assessment_version: string; locale?: string | null } = {
      assessment_type,
      assessment_version,
      locale: locale === null || locale === undefined || locale === '' ? null : locale,
    };

    const { data, error } = await supabaseAdmin
      .from('question_sets')
      .upsert(
        insertData,
        { onConflict: 'assessment_type,assessment_version,locale' }
      )
      .select('*')
      .single();

    if (error) {
      console.error('Error creating/updating question set:', error);
      return res.status(500).json({ error: error.message });
    }

    // Log to audit log
    try {
      await supabaseAdmin.from('content_audit_log').insert({
        actor_id: user.id,
        action: 'questions.create_set',
        entity_type: 'question_set',
        entity_id: data.id,
        metadata: {
          assessment_type,
          assessment_version,
          locale: insertData.locale,
        },
      });
    } catch (auditError) {
      // Non-blocking audit log error
      console.warn('Failed to write audit log:', auditError);
    }

    return res.status(200).json({ questionSet: data });
  } catch (error) {
    console.error('Create question set error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

