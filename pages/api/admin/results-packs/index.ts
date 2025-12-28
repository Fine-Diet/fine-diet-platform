/**
 * API Route: List Results Packs
 * 
 * GET /api/admin/results-packs
 * 
 * Returns a list of all results packs with their pointer information.
 * Requires editor or admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface ResultsPackListItem {
  id: string;
  assessmentType: string;
  resultsVersion: string;
  levelId: string;
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
  resultsPacks: ResultsPackListItem[];
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
    // Check if we should include archived packs
    const includeArchived = req.query.includeArchived === 'true';

    // Fetch all results packs
    const { data: resultsPacks, error: packsError } = await supabaseAdmin
      .from('results_packs')
      .select('id, assessment_type, results_version, level_id, updated_at')
      .order('updated_at', { ascending: false });

    if (packsError) {
      console.error('Error fetching results packs:', packsError);
      return res.status(500).json({ error: packsError.message });
    }

    if (!resultsPacks || resultsPacks.length === 0) {
      return res.status(200).json({ ok: true, resultsPacks: [] });
    }

    // Fetch all pointers
    const packIds = resultsPacks.map((pack) => pack.id);
    const { data: pointers, error: ptrError } = await supabaseAdmin
      .from('results_pack_pointers')
      .select('pack_id, published_revision_id, preview_revision_id, updated_at')
      .in('pack_id', packIds);

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
        .from('results_pack_revisions')
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
      pointerMap.set(ptr.pack_id, ptr);
    });

    // Combine data
    const resultsPacksWithPointers: ResultsPackListItem[] = resultsPacks.map((pack) => {
      const ptr = pointerMap.get(pack.id);
      const publishedRev = ptr?.published_revision_id
        ? revisionMap.get(ptr.published_revision_id)
        : null;
      const previewRev = ptr?.preview_revision_id
        ? revisionMap.get(ptr.preview_revision_id)
        : null;

      return {
        id: pack.id,
        assessmentType: pack.assessment_type,
        resultsVersion: pack.results_version,
        levelId: pack.level_id,
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
        updatedAt: ptr?.updated_at || pack.updated_at,
      };
    });

    return res.status(200).json({ ok: true, resultsPacks: resultsPacksWithPointers });
  } catch (error) {
    console.error('List results packs error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

