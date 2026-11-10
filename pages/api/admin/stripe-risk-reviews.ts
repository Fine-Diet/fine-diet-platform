import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) return;
  try {
    const { data, error } = await supabaseAdmin.from('stripe_risk_reviews')
      .select('id, stripe_event_id, stripe_account_id, livemode, risk_kind, source_ref, instance_id, person_id, status, created_at')
      .eq('status', 'open').order('created_at', { ascending: true }).limit(100);
    if (error) throw error;
    return res.status(200).json({ reviews: data ?? [] });
  } catch {
    console.error('[stripe risk reviews] read failed');
    return res.status(503).json({ error: 'Risk review queue unavailable' });
  }
}
