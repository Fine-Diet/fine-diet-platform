/**
 * API Route: Create Question Set Revision
 * 
 * POST /api/admin/question-set-revisions/create
 * 
 * Creates a new immutable revision (draft snapshot) of a question set.
 * Requires editor or admin role.
 * Validates content and computes revision number safely.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { validateQuestionSet, hashQuestionSetJson } from '@/lib/questionSet/validateQuestionSet';

interface CreateRevisionRequest {
  questionSetId: string;
  content_json: any;
  notes?: string;
}

interface CreateRevisionResponse {
  revision?: {
    id: string;
    question_set_id: string;
    revision_number: number;
    status: string;
    schema_version: string;
    content_hash: string;
    created_at: string;
  };
  validation?: {
    ok: boolean;
    errors: string[];
    warnings: string[];
  };
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateRevisionResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) {
    return; // Response already sent by requireRoleFromApi
  }

  try {
    const { questionSetId, content_json, notes } = req.body as CreateRevisionRequest;

    if (!questionSetId || !content_json) {
      return res.status(400).json({
        error: 'questionSetId and content_json are required',
      });
    }

    // Validate question set content
    const validation = validateQuestionSet(content_json);
    if (!validation.ok) {
      return res.status(400).json({
        error: 'Validation failed',
        validation: {
          ok: false,
          errors: validation.errors,
          warnings: validation.warnings,
        },
      });
    }

    const content_hash = hashQuestionSetJson(validation.normalized);

    // Determine next revision number safely (with transaction-like behavior)
    // Use a SELECT FOR UPDATE if PostgreSQL supports it, or handle race conditions
    // For now, we'll use a simple SELECT and increment (race condition is unlikely in practice)
    const { data: lastRev } = await supabaseAdmin
      .from('question_set_revisions')
      .select('revision_number')
      .eq('question_set_id', questionSetId)
      .order('revision_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextRevNumber = (lastRev?.revision_number ?? 0) + 1;

    // Insert new revision
    const { data: rev, error } = await supabaseAdmin
      .from('question_set_revisions')
      .insert({
        question_set_id: questionSetId,
        revision_number: nextRevNumber,
        status: 'draft',
        schema_version: 'v2_question_schema_1',
        content_json: validation.normalized,
        content_hash,
        notes: notes ?? null,
        validation_errors: null, // Validation passed
        created_by: user.id,
      })
      .select('*')
      .single();

    if (error) {
      // Check for duplicate revision number (race condition)
      if (error.code === '23505') {
        // Unique constraint violation - retry with next number
        const { data: lastRevRetry } = await supabaseAdmin
          .from('question_set_revisions')
          .select('revision_number')
          .eq('question_set_id', questionSetId)
          .order('revision_number', { ascending: false })
          .limit(1)
          .maybeSingle();

        const retryRevNumber = (lastRevRetry?.revision_number ?? 0) + 1;

        const { data: revRetry, error: retryError } = await supabaseAdmin
          .from('question_set_revisions')
          .insert({
            question_set_id: questionSetId,
            revision_number: retryRevNumber,
            status: 'draft',
            schema_version: 'v2_question_schema_1',
            content_json: validation.normalized,
            content_hash,
            notes: notes ?? null,
            validation_errors: null,
            created_by: user.id,
          })
          .select('*')
          .single();

        if (retryError) {
          console.error('Error creating revision (retry):', retryError);
          return res.status(500).json({ error: retryError.message });
        }

        // Log to audit log
        try {
          await supabaseAdmin.from('content_audit_log').insert({
            actor_id: user.id,
            action: 'questions.create_draft',
            entity_type: 'question_set_revision',
            entity_id: revRetry.id,
            metadata: {
              question_set_id: questionSetId,
              revision_number: retryRevNumber,
              content_hash,
            },
          });
        } catch (auditError) {
          console.warn('Failed to write audit log:', auditError);
        }

        return res.status(200).json({
          revision: revRetry,
          validation: {
            ok: true,
            errors: [],
            warnings: validation.warnings,
          },
        });
      }

      console.error('Error creating revision:', error);
      return res.status(500).json({ error: error.message });
    }

    // Log to audit log
    try {
      await supabaseAdmin.from('content_audit_log').insert({
        actor_id: user.id,
        action: 'questions.create_draft',
        entity_type: 'question_set_revision',
        entity_id: rev.id,
        metadata: {
          question_set_id: questionSetId,
          revision_number: nextRevNumber,
          content_hash,
        },
      });
    } catch (auditError) {
      // Non-blocking audit log error
      console.warn('Failed to write audit log:', auditError);
    }

    return res.status(200).json({
      revision: rev,
      validation: {
        ok: true,
        errors: [],
        warnings: validation.warnings,
      },
    });
  } catch (error) {
    console.error('Create revision error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

