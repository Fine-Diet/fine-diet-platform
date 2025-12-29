/**
 * API Route: Scaffold Questions Set
 * 
 * POST /api/admin/assessments/scaffold-questions
 * 
 * Ensures question set identity + pointers exist.
 * If missing, creates them. Otherwise returns existing.
 * Requires editor or admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface ScaffoldQuestionsRequest {
  assessmentType: string;
  assessmentVersion: string | number;
  locale?: string | null;
}

interface ScaffoldQuestionsResponse {
  questionSetId: string;
  created: boolean;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ScaffoldQuestionsResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) {
    return; // Response already sent by requireRoleFromApi
  }

  try {
    const { assessmentType, assessmentVersion, locale } = req.body as ScaffoldQuestionsRequest;

    if (!assessmentType || assessmentVersion === undefined) {
      return res.status(400).json({ error: 'assessmentType and assessmentVersion are required' });
    }

    const versionStr = String(assessmentVersion);
    const localeValue = locale === null || locale === undefined || locale === '' ? null : locale;

    // Check if question set identity exists
    let query = supabaseAdmin
      .from('question_sets')
      .select('id')
      .eq('assessment_type', assessmentType)
      .eq('assessment_version', versionStr);

    if (localeValue === null) {
      query = query.is('locale', null);
    } else {
      query = query.eq('locale', localeValue);
    }

    const { data: existing, error: checkError } = await query.maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking question set:', checkError);
      return res.status(500).json({ error: checkError.message });
    }

    let questionSetId: string;
    let created = false;

    if (existing) {
      // Already exists
      questionSetId = existing.id;
    } else {
      // Create identity
      const { data: newSet, error: createError } = await supabaseAdmin
        .from('question_sets')
        .insert({
          assessment_type: assessmentType,
          assessment_version: versionStr,
          locale: localeValue,
        })
        .select('id')
        .single();

      if (createError) {
        console.error('Error creating question set:', createError);
        return res.status(500).json({ error: createError.message });
      }

      questionSetId = newSet.id;
      created = true;

      // Ensure pointers row exists (may be created by trigger, but ensure it exists)
      const { error: ptrError } = await supabaseAdmin
        .from('question_set_pointers')
        .upsert(
          { question_set_id: questionSetId },
          { onConflict: 'question_set_id' }
        );

      if (ptrError) {
        console.warn('Error ensuring pointers row (non-blocking):', ptrError);
      }
    }

    // Log to audit log
    try {
      await supabaseAdmin.from('content_audit_log').insert({
        actor_id: user.id,
        action: 'assessments.scaffold_questions',
        entity_type: 'question_set',
        entity_id: questionSetId,
        metadata: {
          assessment_type: assessmentType,
          assessment_version: versionStr,
          locale: localeValue,
          created,
        },
      });
    } catch (auditError) {
      // Non-blocking audit log error
      console.warn('Failed to write audit log:', auditError);
    }

    return res.status(200).json({ questionSetId, created });
  } catch (error) {
    console.error('Scaffold questions error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

