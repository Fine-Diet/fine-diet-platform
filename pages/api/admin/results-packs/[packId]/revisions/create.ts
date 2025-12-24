/**
 * API Route: Create Results Pack Revision
 * 
 * POST /api/admin/results-packs/[packId]/revisions/create
 * 
 * Creates a new immutable revision (draft snapshot) of a results pack.
 * Requires editor or admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRole, supabaseAdmin } from '@/lib/resultsPack/requireRole';
import { validateResultsPack, hashPackJson } from '@/lib/resultsPack/validateResultsPack';

interface CreateRevisionRequest {
  content_json: any;
  change_summary?: string;
}

interface CreateRevisionResponse {
  revision?: {
    id: string;
    pack_id: string;
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

  const auth = await requireRole(req, res, ['editor', 'admin']);
  if (!auth) {
    return; // Response already sent by requireRole
  }

  try {
    const packId = String(req.query.packId);
    const { content_json, change_summary } = req.body as CreateRevisionRequest;

    if (!content_json) {
      return res.status(400).json({ error: 'content_json is required' });
    }

    // Validate pack content
    const validation = validateResultsPack(content_json);
    const content_hash = hashPackJson(validation.normalized);

    // Determine next revision number
    const { data: lastRev } = await supabaseAdmin
      .from('results_pack_revisions')
      .select('revision_number')
      .eq('pack_id', packId)
      .order('revision_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextRevNumber = (lastRev?.revision_number ?? 0) + 1;

    // Insert new revision
    const { data: rev, error } = await supabaseAdmin
      .from('results_pack_revisions')
      .insert({
        pack_id: packId,
        revision_number: nextRevNumber,
        status: 'draft',
        schema_version: 'v2_pack_schema_1',
        content_json: validation.normalized,
        content_hash,
        change_summary: change_summary ?? null,
        validation_errors: validation.ok ? null : { errors: validation.errors, warnings: validation.warnings },
        created_by: auth.user.id,
      })
      .select('*')
      .single();

    if (error) {
      console.error('Error creating revision:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      revision: rev,
      validation: {
        ok: validation.ok,
        errors: validation.errors,
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

