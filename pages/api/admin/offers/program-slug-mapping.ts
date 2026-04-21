/**
 * Admin API: Offer → program_slug mapping (Plans Phase 9)
 *
 * GET  /api/admin/offers/program-slug-mapping
 *   Returns all offers with their assigns_program_slug (null if unset)
 *   plus an `is_active` flag. Used by the automation admin UI to show a
 *   single table of "which offers opt into program assignment".
 *
 * PUT  /api/admin/offers/program-slug-mapping
 *   Body: { offer_key: string, assigns_program_slug: string | null }
 *   Sets or clears the mapping for a single offer. Empty string is
 *   normalised to null so admins can clear the mapping from the UI.
 *
 * Protected: admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface MappingRow {
  offer_key: string;
  name: string;
  is_active: boolean;
  assigns_program_slug: string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | { rows: MappingRow[] }
    | { offer_key: string; assigns_program_slug: string | null }
    | { error: string }
  >,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('offers')
      .select('offer_key, name, is_active, assigns_program_slug')
      .order('offer_key', { ascending: true });
    if (error) {
      console.error('[offers/program-slug-mapping GET] error:', error);
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({
      rows: ((data ?? []) as unknown as MappingRow[]).map((r) => ({
        offer_key: r.offer_key,
        name: r.name,
        is_active: r.is_active,
        assigns_program_slug: r.assigns_program_slug ?? null,
      })),
    });
  }

  if (req.method === 'PUT') {
    const body = req.body ?? {};
    const offerKey = typeof body.offer_key === 'string' ? body.offer_key : '';
    if (!offerKey) {
      return res.status(400).json({ error: 'offer_key is required.' });
    }
    const raw = body.assigns_program_slug;
    if (raw !== null && typeof raw !== 'string') {
      return res.status(400).json({
        error: 'assigns_program_slug must be string or null.',
      });
    }
    const slug = raw === null ? null : raw.trim();
    const normalized = slug === '' ? null : slug;
    if (normalized && !/^[a-z0-9][a-z0-9-]{0,119}$/i.test(normalized)) {
      return res.status(400).json({
        error: 'Slug must be 1-120 chars, alphanumeric + hyphens.',
      });
    }

    const { data, error } = await supabaseAdmin
      .from('offers')
      .update({ assigns_program_slug: normalized, updated_by: user.id })
      .eq('offer_key', offerKey)
      .select('offer_key, assigns_program_slug')
      .single();
    if (error) {
      console.error('[offers/program-slug-mapping PUT] error:', error);
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({
      offer_key: (data as { offer_key: string }).offer_key,
      assigns_program_slug:
        (data as { assigns_program_slug: string | null }).assigns_program_slug
          ?? null,
    });
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}
