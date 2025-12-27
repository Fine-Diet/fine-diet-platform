/**
 * API Route: List Question Sets
 * 
 * GET /api/admin/question-sets
 * 
 * Returns a list of all question sets with their pointer information.
 * Requires editor or admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface QuestionSetListItem {
  id: string;
  assessmentType: string;
  assessmentVersion: string;
  locale: string | null;
  published: {
    revisionId: string;
    revisionNumber: number;
    publishedAt: string;
  } | null;
  preview: {
    revisionId: string;
    revisionNumber: number;
  } | null;
  updatedAt: string;
}

interface ListResponse {
  ok: true;
  questionSets: QuestionSetListItem[];
}

interface ErrorResponse {
  ok?: false;
  error: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListResponse | ErrorResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) {
    return; // Response already sent by requireRoleFromApi
  }

  try {
    // Fetch all question sets
    const { data: questionSets, error: setsError } = await supabaseAdmin
      .from('question_sets')
      .select('id, assessment_type, assessment_version, locale, updated_at')
      .order('updated_at', { ascending: false });

    if (setsError) {
      console.error('Error fetching question sets:', setsError);
      return res.status(500).json({ error: setsError.message });
    }

    if (!questionSets || questionSets.length === 0) {
      return res.status(200).json({ ok: true, questionSets: [] });
    }

    // Fetch all pointers
    const questionSetIds = questionSets.map((qs) => qs.id);
    const { data: pointers, error: ptrError } = await supabaseAdmin
      .from('question_set_pointers')
      .select('question_set_id, published_revision_id, preview_revision_id, updated_at')
      .in('question_set_id', questionSetIds);

    if (ptrError) {
      console.error('Error fetching pointers:', ptrError);
      return res.status(500).json({ error: ptrError.message });
    }

    // Build a map of revision IDs to revision numbers
    const revisionIds = new Set<string>();
    pointers?.forEach((ptr) => {
      if (ptr.published_revision_id) {
        revisionIds.add(ptr.published_revision_id);
      }
      if (ptr.preview_revision_id) {
        revisionIds.add(ptr.preview_revision_id);
      }
    });

    const revisionMap = new Map<string, { revisionNumber: number; createdAt: string }>();
    
    // Only fetch revisions if we have revision IDs
    if (revisionIds.size > 0) {
      const { data: revisions, error: revError } = await supabaseAdmin
        .from('question_set_revisions')
        .select('id, revision_number, created_at')
        .in('id', Array.from(revisionIds));

      if (revError) {
        console.error('Error fetching revisions:', revError);
        return res.status(500).json({ error: revError.message });
      }

      revisions?.forEach((rev) => {
        revisionMap.set(rev.id, {
          revisionNumber: rev.revision_number,
          createdAt: rev.created_at,
        });
      });
    }

    // Build pointer map
    const pointerMap = new Map<string, typeof pointers[0]>();
    pointers?.forEach((ptr) => {
      pointerMap.set(ptr.question_set_id, ptr);
    });

    // Combine data
    const questionSetsWithPointers: QuestionSetListItem[] = questionSets.map((qs) => {
      const ptr = pointerMap.get(qs.id);
      const publishedRev = ptr?.published_revision_id
        ? revisionMap.get(ptr.published_revision_id)
        : null;
      const previewRev = ptr?.preview_revision_id
        ? revisionMap.get(ptr.preview_revision_id)
        : null;

      return {
        id: qs.id,
        assessmentType: qs.assessment_type,
        assessmentVersion: qs.assessment_version,
        locale: qs.locale,
        published: publishedRev
          ? {
              revisionId: ptr!.published_revision_id!,
              revisionNumber: publishedRev.revisionNumber,
              publishedAt: publishedRev.createdAt,
            }
          : null,
        preview: previewRev
          ? {
              revisionId: ptr!.preview_revision_id!,
              revisionNumber: previewRev.revisionNumber,
            }
          : null,
        updatedAt: ptr?.updated_at || qs.updated_at,
      };
    });

    return res.status(200).json({ ok: true, questionSets: questionSetsWithPointers });
  } catch (error) {
    console.error('List question sets error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

