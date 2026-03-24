/**
 * GET /api/admin/off-promotions
 *
 * List OFF promotion candidates with optional status filter.
 * GET ?id=<uuid> returns a single candidate with audit log + OFF mirror snapshot.
 *
 * Role: editor or admin (read-only; actions handled by off-promotion-action.ts)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { normalizeOffRow } from '@/lib/food/offNormalization';

/** OFF mirror row for admin detail (Supabase client typing uses a broad union). */
interface OffMirrorDetailRow {
  product_name: string | null;
  generic_name: string | null;
  brands: string | null;
  barcode: string | null;
  serving_size: string | null;
  quantity: string | null;
  energy_kcal_100g: number | null;
  protein_g_100g: number | null;
  carbs_g_100g: number | null;
  fat_g_100g: number | null;
  fiber_g_100g: number | null;
  sugars_g_100g: number | null;
  sodium_mg_100g: number | null;
  image_front_url: string | null;
  image_url: string | null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  const { id, status } = req.query;

  // ── Single candidate detail ───────────────────────────────────────────────
  if (typeof id === 'string') {
    const { data: candidate, error: candErr } = await supabaseAdmin
      .from('off_promotion_candidates')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (candErr || !candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    // OFF mirror snapshot for detail panel
    const { data: mirrorRowRaw } = await supabaseAdmin
      .from('off_products_mirror')
      .select(
        'product_name,generic_name,brands,barcode,serving_size,quantity,' +
          'energy_kcal_100g,protein_g_100g,carbs_g_100g,fat_g_100g,' +
          'fiber_g_100g,sugars_g_100g,sodium_mg_100g,image_front_url,image_url'
      )
      .eq('off_product_id', candidate.off_product_id)
      .maybeSingle();

    const mirrorRow = mirrorRowRaw as unknown as OffMirrorDetailRow | null;

    const offNormalization = mirrorRow ? normalizeOffRow(mirrorRow) : null;

    // Audit log for this candidate
    const { data: auditRows } = await supabaseAdmin
      .from('off_promotion_audit')
      .select('id,action,from_status,to_status,actor_email,actor_role,note,created_at')
      .eq('candidate_id', id)
      .order('created_at', { ascending: false });

    // Promoted snapshot if promoted
    let promotedSnapshot = null;
    if (candidate.status === 'promoted') {
      const { data: snap } = await supabaseAdmin
        .from('promoted_off_foods')
        .select('*')
        .eq('candidate_id', id)
        .order('promoted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      promotedSnapshot = snap ?? null;
    }

    return res.status(200).json({
      candidate,
      offMirror: mirrorRow ?? null,
      offNormalization,
      auditLog: auditRows ?? [],
      promotedSnapshot,
    });
  }

  // ── List ──────────────────────────────────────────────────────────────────
  let query = supabaseAdmin
    .from('off_promotion_candidates')
    .select(
      'id,off_product_id,product_name,brands,status,selection_count,' +
        'distinct_session_count,flag_normalization,deferred,admin_flagged,' +
        'reviewed_by_email,reviewed_at,reviewer_role,review_notes,' +
        'first_selected_at,last_selected_at,updated_at'
    )
    .order('last_selected_at', { ascending: false });

  if (typeof status === 'string' && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data: candidates, error: listErr } = await query;
  if (listErr) {
    console.error('[off-promotions] list error:', listErr.message);
    return res.status(500).json({ error: listErr.message });
  }

  return res.status(200).json({ candidates: candidates ?? [] });
}
