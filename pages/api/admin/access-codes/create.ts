/**
 * POST /api/admin/access-codes/create
 *
 * Create an access code from a raw code submitted by an authenticated
 * admin/editor.
 *
 * Server responsibilities:
 *   - normalize the raw code with trim + uppercase
 *   - hash using ACCESS_CODE_HASH_SECRET (HMAC-SHA-256)
 *   - store ONLY the hash/digest and non-secret metadata
 *   - NEVER persist the raw code
 *   - NEVER return the digest
 *
 * The response is admin-safe metadata only (no `code_hash`). The raw code is
 * never echoed back — it is only known at creation time.
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

const createSchema = z.object({
  code: z.string().min(1, 'code is required'),
  code_key: z.string().min(1).optional().nullable(),
  label: z.string().optional().nullable(),
  status: z.enum(STATUS_VALUES).default('draft'),
  scope: z.enum(SCOPE_VALUES).default('global'),
  start_page_slug: z.string().optional().nullable(),
  program_slug: z.string().optional().nullable(),
  product_slug: z.string().optional().nullable(),
  offer_key: z.string().optional().nullable(),
  max_redemptions: z.number().int().positive().optional().nullable(),
  valid_from: z.string().optional().nullable(),
  expires_at: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Admin-safe columns to return after insert. `code_hash` is never selected.
 */
const RETURN_SELECT =
  'id, code_key, label, status, scope, start_page_slug, program_slug, product_slug, offer_key, max_redemptions, redemption_count, valid_from, expires_at, metadata, created_at, updated_at';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
  }
  const data = parsed.data;

  let codeHash: string;
  try {
    codeHash = digestAccessCode(data.code);
  } catch (err) {
    console.error('[access-codes/create] hash configuration error:', err);
    return res.status(500).json({ error: 'Code hashing is not configured on the server.' });
  }

  const normalized = normalizeAccessCode(data.code);

  const row: Record<string, unknown> = {
    code_hash: codeHash,
    status: data.status,
    scope: data.scope,
  };
  if (data.code_key) row.code_key = data.code_key.trim();
  if (data.label) row.label = data.label.trim();
  if (data.start_page_slug) row.start_page_slug = data.start_page_slug.trim();
  if (data.program_slug) row.program_slug = data.program_slug.trim();
  if (data.product_slug) row.product_slug = data.product_slug.trim();
  if (data.offer_key) row.offer_key = data.offer_key.trim().toLowerCase();
  if (data.max_redemptions !== undefined) row.max_redemptions = data.max_redemptions;
  if (data.valid_from !== undefined) row.valid_from = data.valid_from || null;
  if (data.expires_at !== undefined) row.expires_at = data.expires_at || null;

  // Audit provenance without a schema change: record who created the code in
  // the existing metadata jsonb column. Never put the raw code here.
  const metadata: Record<string, unknown> = {
    ...(data.metadata ?? {}),
    created_by_user_id: user.id,
    created_by_email: user.email ?? null,
    normalized_length: normalized.length,
  };
  row.metadata = metadata;

  try {
    const { data: inserted, error } = await supabaseAdmin
      .from('access_codes')
      .insert(row)
      .select(RETURN_SELECT)
      .single();

    if (error) {
      // 23505 = unique violation (duplicate code_hash or code_key).
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'duplicate',
          message:
            'That access code (or code_key) already exists. Use a different code, or edit the existing code.',
        });
      }
      console.error('[access-codes/create] insert error:', error);
      return res.status(500).json({ error: 'Failed to create access code' });
    }

    return res.status(201).json({ code: inserted });
  } catch (err) {
    console.error('[access-codes/create] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
