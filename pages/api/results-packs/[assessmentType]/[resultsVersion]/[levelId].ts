/**
 * API Route: Get Published Results Pack (Public)
 * 
 * GET /api/results-packs/[assessmentType]/[resultsVersion]/[levelId]
 * 
 * Returns the published revision content for a results pack.
 * Public endpoint - no authentication required.
 * Only returns published revisions (enforced by RLS).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface GetPackResponse {
  source: 'cms';
  schema_version: string;
  content_hash: string;
  content_json: any;
  published_at: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetPackResponse | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const assessmentType = String(req.query.assessmentType);
    const resultsVersion = String(req.query.resultsVersion);
    const levelId = String(req.query.levelId);

    // Find pack identity
    const { data: pack } = await supabaseAdmin
      .from('results_packs')
      .select('id')
      .eq('assessment_type', assessmentType)
      .eq('results_version', resultsVersion)
      .eq('level_id', levelId)
      .maybeSingle();

    if (!pack) {
      return res.status(404).json({ error: 'Pack not found in CMS' });
    }

    // Get published pointer
    const { data: ptr } = await supabaseAdmin
      .from('results_pack_pointers')
      .select('published_revision_id')
      .eq('pack_id', pack.id)
      .maybeSingle();

    if (!ptr?.published_revision_id) {
      return res.status(404).json({ error: 'No published revision' });
    }

    // Fetch published revision content
    const { data: rev, error } = await supabaseAdmin
      .from('results_pack_revisions')
      .select('content_json, content_hash, schema_version, created_at')
      .eq('id', ptr.published_revision_id)
      .single();

    if (error || !rev) {
      console.error('Error loading published revision:', error);
      return res.status(500).json({ error: 'Failed to load published revision' });
    }

    return res.status(200).json({
      source: 'cms',
      schema_version: rev.schema_version,
      content_hash: rev.content_hash,
      content_json: rev.content_json,
      published_at: rev.created_at,
    });
  } catch (error) {
    console.error('Get pack error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

