/**
 * POST /api/admin/access-codes/update
 *
 * Update an access code's metadata, status, scope, scoped slugs, redemption
 * limits, dates, and offer attachment. Optionally accepts a new `code` to
 * re-key the code (re-hash). The raw code is never persisted or returned.
 *
 * Body: { id: string, ...fields }
 *
 * The digest (`code_hash`) is never returned. When re-keying, the new code is
 * normalized + hashed server-side and only the new digest is stored.
 *
 * Protected: admin | editor
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { digestAccessCode, normalizeAccessCode } from '@/lib/access/accessCodeHash';

const SCOPE_VALUES = ['global', 'start_page', 'program', 'integrative_care', 'offer'] as const;
const STATUS_VALUES = ['draft', 'active', 'paused', 'expired', 'archived'] as const;

const updateSchema = z.object({
  id: z.string().uuid('id is required'),
  code: z.string().min(1).optional(),
  code_key: z.string().min(1).optional().nullable(),
  label: z.string().optional().nullable(),
  status: z.enum(STATUS_VALUES).optional(),
  scope: z.enum(SCOPE_VALUES).optional(),
  start_page_slug: z.string().optional().nullable(),
  program_slug: z.string().optional().nullable(),
  product_slug: z.string().optional().nullable(),
  offer_key: z.string().optional().nullable(),
  max_redemptions: z.number().int().positive().optional().nullable(),
  valid_from: z.string().optional().nullable(),
  expires_at: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const RETURN_SELECT =
  'id, code_key, label, status, scope, start_page_slug, program_slug, product_slug, offer_key, max_redemptions, redemption_count, valid_from, expires_at, metadata, created_at, updated_at';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const parsed = updateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
  }
  const data = parsed.data;

  const { id, code, metadata, ...rest } = data;

  const row: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue;
    if (key === 'code_key' && value) row.code_key = (value as string).trim();
    else if (key === 'label' && value) row.label = (value as string).trim();
    else if (key === 'start_page_slug' && value) row.start_page_slug = (value as string).trim();
    else if (key === 'program_slug' && value) row.program_slug = (value as string).trim();
    else if (key === 'product_slug' && value) row.product_slug = (value as string).trim();
    else if (key === 'offer_key' && value) row.offer_key = (value as string).trim().toLowerCase();
    else if (key === 'valid_from') row.valid_from = value || null;
    else if (key === 'expires_at') row.expires_at = value || null;
    else if (key === 'max_redemptions') row.max_redemptions = value;
    else row[key] = value;
  }

  // Re-key: hash a new raw code without persisting or returning it.
  if (code) {
    try {
      row.code_hash = digestAccessCode(code);
      row.metadata = {
        ...(metadata ?? {}),
        rekeyed_by_user_id: user.id,
        rekeyed_by_email: user.email ?? null,
        rekeyed_normalized_length: normalizeAccessCode(code).length,
      };
    } catch (err) {
      console.error('[access-codes/update] hash configuration error:', err);
      return res.status(500).json({ error: 'Code hashing is not configured on the server.' });
    }
  } else if (metadata !== undefined) {
    // Merge metadata so existing audit fields are preserved.
    row.metadata = metadata;
  }

  if (Object.keys(row).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  try {
    const { data: updated, error } = await supabaseAdmin
      .from('access_codes')
      .update(row)
      .eq('id', id)
      .select(RETURN_SELECT)
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'duplicate',
          message: 'That code (or code_key) already exists. Use a different value.',
        });
      }
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Access code not found' });
      }
      console.error('[access-codes/update] error:', error);
      return res.status(500).json({ error: 'Failed to update access code' });
    }

    return res.status(200).json({ code: updated });
  } catch (err) {
    console.error('[access-codes/update] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
