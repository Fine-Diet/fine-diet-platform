/**
 * API Route: Create Results Pack Identity
 * 
 * POST /api/admin/results-packs/create
 * 
 * Creates or updates a results pack identity record.
 * Requires editor or admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRole, supabaseAdmin } from '@/lib/resultsPack/requireRole';

interface CreatePackRequest {
  assessment_type: string;
  results_version: string;
  level_id: string;
}

interface CreatePackResponse {
  pack?: {
    id: string;
    assessment_type: string;
    results_version: string;
    level_id: string;
    slug: string;
    created_at: string;
    updated_at: string;
  };
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreatePackResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireRole(req, res, ['editor', 'admin']);
  if (!auth) {
    return; // Response already sent by requireRole
  }

  try {
    const { assessment_type, results_version, level_id } = req.body as CreatePackRequest;

    if (!assessment_type || !results_version || !level_id) {
      return res.status(400).json({
        error: 'assessment_type, results_version, level_id are required',
      });
    }

    // Upsert pack identity (idempotent)
    const { data, error } = await supabaseAdmin
      .from('results_packs')
      .upsert(
        { assessment_type, results_version, level_id },
        { onConflict: 'assessment_type,results_version,level_id' }
      )
      .select('*')
      .single();

    if (error) {
      console.error('Error creating/updating results pack:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ pack: data });
  } catch (error) {
    console.error('Create pack error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

