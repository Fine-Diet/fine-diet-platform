/**
 * API Route: Grant Journal Access (temporary, for testing)
 *
 * POST /api/admin/grant-journal-access
 * Body: { email: string }
 *
 * Protected by:
 * - GRANT_JOURNAL_ACCESS_SECRET env var (header Authorization: Bearer <secret> or X-Grant-Journal-Access-Secret: <secret>), or
 * - requireRoleFromApi(['admin'])
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { ensureSubscription } from '@/lib/peopleService';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

function hasValidSecret(req: NextApiRequest): boolean {
  const secret = process.env.GRANT_JOURNAL_ACCESS_SECRET;
  if (!secret) return false;
  const auth = req.headers.authorization;
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  const headerSecret = req.headers['x-grant-journal-access-secret'] as string | undefined;
  return (!!bearer && bearer === secret) || (!!headerSecret && headerSecret === secret);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ ok: boolean; error?: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const allowed = hasValidSecret(req);
  if (!allowed) {
    const user = await requireRoleFromApi(req, res, ['admin']);
    if (!user) return; // 401/403 already sent
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : null;
  if (!email) {
    return res.status(400).json({ ok: false, error: 'Body must include { email: string }' });
  }

  try {
    const { data: person, error: personError } = await supabaseAdmin
      .from('people')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (personError) {
      console.error('[grant-journal-access] people lookup error:', personError);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    if (!person?.id) {
      return res.status(404).json({ ok: false, error: 'Person not found for this email' });
    }

    await ensureSubscription({
      personId: person.id,
      type: 'journal_access',
      programSlug: 'journal',
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[grant-journal-access] error:', err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
