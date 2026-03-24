/**
 * POST /api/admin/off-promotion-action
 *
 * Perform a review action on an OFF promotion candidate.
 *
 * Body: { id: string; action: ActionType; note?: string }
 *
 * Role boundaries:
 *   editor  → mark_reviewed, defer, flag_normalization, add_notes
 *   admin   → all of the above + reject + promote
 *
 * On promote:
 *   - Fetches OFF mirror snapshot
 *   - Inserts into promoted_off_foods
 *   - Updates candidate status → 'promoted'
 *   - Writes audit row
 *
 * On reject / mark_reviewed / defer / flag_normalization / add_notes:
 *   - Updates candidate fields
 *   - Writes audit row
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { normalizeOffRow, computeCompletenessScore } from '@/lib/food/offNormalization';

/** OFF mirror row for promote path (Supabase client typing uses a broad union). */
interface OffMirrorPromoteRow {
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
}

type ActionType =
  | 'mark_reviewed'
  | 'defer'
  | 'flag_normalization'
  | 'add_notes'
  | 'reject'
  | 'promote';

const REVIEWER_ACTIONS: ActionType[] = [
  'mark_reviewed',
  'defer',
  'flag_normalization',
  'add_notes',
];
const ADMIN_ACTIONS: ActionType[] = [...REVIEWER_ACTIONS, 'reject', 'promote'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  const { id, action, note } = req.body ?? {};

  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'id is required' });
  }
  if (!action) {
    return res.status(400).json({ error: 'action is required' });
  }

  // Role-gate: editors only get reviewer actions
  const allowed = user.role === 'admin' ? ADMIN_ACTIONS : REVIEWER_ACTIONS;
  if (!allowed.includes(action as ActionType)) {
    return res.status(403).json({
      error: `Action '${action}' requires admin role`,
    });
  }

  // Fetch current candidate
  const { data: candidate, error: fetchErr } = await supabaseAdmin
    .from('off_promotion_candidates')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !candidate) {
    return res.status(404).json({ error: 'Candidate not found' });
  }

  const fromStatus: string = candidate.status;
  const now = new Date().toISOString();
  const noteStr = typeof note === 'string' && note.trim() ? note.trim() : null;

  // ── Compute new state per action ─────────────────────────────────────────
  let toStatus: string = fromStatus;
  const candidateUpdate: Record<string, unknown> = {
    updated_at: now,
  };

  if (action === 'mark_reviewed') {
    // Advance to normalized_off if still in an un-reviewed state
    if (fromStatus === 'raw_off' || fromStatus === 'review_needed') {
      toStatus = 'normalized_off';
      candidateUpdate.status = 'normalized_off';
    }
    candidateUpdate.reviewed_by_user_id = user.id;
    candidateUpdate.reviewed_by_email = user.email;
    candidateUpdate.reviewed_at = now;
    candidateUpdate.reviewer_role = user.role;
    if (noteStr) candidateUpdate.review_notes = noteStr;
  }

  if (action === 'defer') {
    candidateUpdate.deferred = true;
    if (noteStr) candidateUpdate.review_notes = noteStr;
  }

  if (action === 'flag_normalization') {
    candidateUpdate.flag_normalization = true;
    if (noteStr) candidateUpdate.review_notes = noteStr;
  }

  if (action === 'add_notes') {
    if (!noteStr) {
      return res.status(400).json({ error: 'note is required for add_notes action' });
    }
    candidateUpdate.review_notes = noteStr;
  }

  if (action === 'reject') {
    toStatus = 'rejected';
    candidateUpdate.status = 'rejected';
    candidateUpdate.reviewed_by_user_id = user.id;
    candidateUpdate.reviewed_by_email = user.email;
    candidateUpdate.reviewed_at = now;
    candidateUpdate.reviewer_role = user.role;
    if (noteStr) candidateUpdate.review_notes = noteStr;
  }

  if (action === 'promote') {
    // Must be in a reviewable state — not already promoted or rejected
    if (fromStatus === 'promoted' || fromStatus === 'rejected') {
      return res.status(400).json({
        error: `Cannot promote a candidate that is already '${fromStatus}'`,
      });
    }

    // Fetch OFF mirror snapshot for the promoted_off_foods row
    const { data: mirrorRowRaw } = await supabaseAdmin
      .from('off_products_mirror')
      .select(
        'product_name,generic_name,brands,barcode,serving_size,quantity,' +
          'energy_kcal_100g,protein_g_100g,carbs_g_100g,fat_g_100g,' +
          'fiber_g_100g,sugars_g_100g,sodium_mg_100g'
      )
      .eq('off_product_id', candidate.off_product_id)
      .maybeSingle();

    const mirrorRow = mirrorRowRaw as unknown as OffMirrorPromoteRow | null;

    const norm = mirrorRow ? normalizeOffRow(mirrorRow) : null;
    const completeness = mirrorRow ? computeCompletenessScore(mirrorRow) : 0;
    const productName =
      mirrorRow?.product_name ||
      mirrorRow?.generic_name ||
      candidate.product_name ||
      'Unknown Product';

    // Insert promoted snapshot
    const { error: promoteInsertErr } = await supabaseAdmin
      .from('promoted_off_foods')
      .insert({
        candidate_id: id,
        off_product_id: candidate.off_product_id,
        product_name: productName,
        brands: mirrorRow?.brands ?? candidate.brands ?? null,
        barcode: mirrorRow?.barcode ?? null,
        serving_size_text: norm?.serving_size_text ?? null,
        serving_size_g: norm?.serving_size_g ?? null,
        calories_per_100g: mirrorRow?.energy_kcal_100g ?? null,
        protein_g_100g: mirrorRow?.protein_g_100g ?? null,
        carbs_g_100g: mirrorRow?.carbs_g_100g ?? null,
        fat_g_100g: mirrorRow?.fat_g_100g ?? null,
        fiber_g_100g: mirrorRow?.fiber_g_100g ?? null,
        sugars_g_100g: mirrorRow?.sugars_g_100g ?? null,
        sodium_mg_100g: mirrorRow?.sodium_mg_100g ?? null,
        completeness_score: completeness,
        promoted_by_user_id: user.id,
        promoted_by_email: user.email,
        promoted_at: now,
        notes: noteStr,
        status: 'active',
      });

    if (promoteInsertErr) {
      console.error('[off-promotion-action] promoted_off_foods insert error:', promoteInsertErr.message);
      return res.status(500).json({ error: 'Failed to write promoted snapshot' });
    }

    toStatus = 'promoted';
    candidateUpdate.status = 'promoted';
    candidateUpdate.reviewed_by_user_id = user.id;
    candidateUpdate.reviewed_by_email = user.email;
    candidateUpdate.reviewed_at = now;
    candidateUpdate.reviewer_role = user.role;
    if (noteStr) candidateUpdate.review_notes = noteStr;
  }

  // ── Update candidate ──────────────────────────────────────────────────────
  const { error: updateErr } = await supabaseAdmin
    .from('off_promotion_candidates')
    .update(candidateUpdate)
    .eq('id', id);

  if (updateErr) {
    console.error('[off-promotion-action] candidate update error:', updateErr.message);
    return res.status(500).json({ error: updateErr.message });
  }

  // ── Append audit row ──────────────────────────────────────────────────────
  await supabaseAdmin.from('off_promotion_audit').insert({
    candidate_id: id,
    action,
    from_status: fromStatus,
    to_status: toStatus,
    actor_user_id: user.id,
    actor_email: user.email,
    actor_role: user.role,
    note: noteStr,
    created_at: now,
  });

  return res.status(200).json({ ok: true, toStatus });
}
