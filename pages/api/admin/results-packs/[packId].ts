/**
 * API Route: Get Results Pack Detail
 * 
 * GET /api/admin/results-packs/:packId
 * 
 * Returns results pack identity, pointers, and full revision list.
 * Requires editor or admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface ResultsPackDetail {
  id: string;
  assessmentType: string;
  resultsVersion: string;
  levelId: string;
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
  changeSummary: string | null;
  validationErrors: any | null;
}

interface DetailResponse {
  ok: true;
  resultsPack: ResultsPackDetail;
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
    const { packId } = req.query;

    if (!packId || typeof packId !== 'string') {
      return res.status(400).json({ error: 'Results pack ID is required' });
    }

    // Fetch results pack
    const { data: resultsPack, error: packError } = await supabaseAdmin
      .from('results_packs')
      .select('id, assessment_type, results_version, level_id, created_at, updated_at')
      .eq('id', packId)
      .single();

    if (packError || !resultsPack) {
      if (packError?.code === 'PGRST116') {
        return res.status(404).json({ error: 'Results pack not found' });
      }
      console.error('Error fetching results pack:', packError);
      return res.status(500).json({ error: packError?.message || 'Failed to fetch results pack' });
    }

    // Fetch pointer
    const { data: pointer, error: ptrError } = await supabaseAdmin
      .from('results_pack_pointers')
      .select('published_revision_id, preview_revision_id, updated_at')
      .eq('pack_id', packId)
      .maybeSingle();

    if (ptrError) {
      console.error('Error fetching pointer:', ptrError);
      return res.status(500).json({ error: ptrError.message });
    }

    // Fetch all revisions (editor/admin can see all statuses)
    const { data: revisions, error: revError } = await supabaseAdmin
      .from('results_pack_revisions')
      .select('id, revision_number, status, content_hash, created_at, change_summary, validation_errors')
      .eq('pack_id', packId)
      .order('revision_number', { ascending: false });

    if (revError) {
      console.error('Error fetching revisions:', revError);
      return res.status(500).json({ error: revError.message });
    }

    return res.status(200).json({
      ok: true,
      resultsPack: {
        id: resultsPack.id,
        assessmentType: resultsPack.assessment_type,
        resultsVersion: resultsPack.results_version,
        levelId: resultsPack.level_id,
        createdAt: resultsPack.created_at,
        updatedAt: resultsPack.updated_at,
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
        changeSummary: rev.change_summary || null,
        validationErrors: rev.validation_errors || null,
      })),
    });
  } catch (error) {
    console.error('Get results pack detail error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

