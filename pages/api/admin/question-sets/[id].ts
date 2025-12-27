/**
 * API Route: Get Question Set Detail
 * 
 * GET /api/admin/question-sets/:id
 * 
 * Returns question set identity, pointers, and full revision list.
 * Requires editor or admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface QuestionSetDetail {
  id: string;
  assessmentType: string;
  assessmentVersion: string;
  locale: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PointerInfo {
  publishedRevisionId: string | null;
  previewRevisionId: string | null;
  updatedAt: string | null;
}

interface RevisionItem {
  id: string;
  revisionNumber: number;
  status: 'draft' | 'published' | 'archived';
  contentHash: string;
  createdAt: string;
  notes: string | null;
}

interface DetailResponse {
  ok: true;
  questionSet: QuestionSetDetail;
  pointers: PointerInfo;
  revisions: RevisionItem[];
}

interface ErrorResponse {
  ok?: false;
  error: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DetailResponse | ErrorResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) {
    return; // Response already sent by requireRoleFromApi
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Question set ID is required' });
    }

    // Fetch question set
    const { data: questionSet, error: setError } = await supabaseAdmin
      .from('question_sets')
      .select('id, assessment_type, assessment_version, locale, created_at, updated_at')
      .eq('id', id)
      .single();

    if (setError || !questionSet) {
      if (setError?.code === 'PGRST116') {
        return res.status(404).json({ error: 'Question set not found' });
      }
      console.error('Error fetching question set:', setError);
      return res.status(500).json({ error: setError?.message || 'Failed to fetch question set' });
    }

    // Fetch pointer
    const { data: pointer, error: ptrError } = await supabaseAdmin
      .from('question_set_pointers')
      .select('published_revision_id, preview_revision_id, updated_at')
      .eq('question_set_id', id)
      .maybeSingle();

    if (ptrError) {
      console.error('Error fetching pointer:', ptrError);
      return res.status(500).json({ error: ptrError.message });
    }

    // Fetch all revisions (editor/admin can see all statuses)
    const { data: revisions, error: revError } = await supabaseAdmin
      .from('question_set_revisions')
      .select('id, revision_number, status, content_hash, created_at, notes')
      .eq('question_set_id', id)
      .order('revision_number', { ascending: false });

    if (revError) {
      console.error('Error fetching revisions:', revError);
      return res.status(500).json({ error: revError.message });
    }

    return res.status(200).json({
      ok: true,
      questionSet: {
        id: questionSet.id,
        assessmentType: questionSet.assessment_type,
        assessmentVersion: questionSet.assessment_version,
        locale: questionSet.locale,
        createdAt: questionSet.created_at,
        updatedAt: questionSet.updated_at,
      },
      pointers: {
        publishedRevisionId: pointer?.published_revision_id || null,
        previewRevisionId: pointer?.preview_revision_id || null,
        updatedAt: pointer?.updated_at || null,
      },
      revisions: (revisions || []).map((rev) => ({
        id: rev.id,
        revisionNumber: rev.revision_number,
        status: rev.status as 'draft' | 'published' | 'archived',
        contentHash: rev.content_hash,
        createdAt: rev.created_at,
        notes: rev.notes || null,
      })),
    });
  } catch (error) {
    console.error('Get question set detail error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

