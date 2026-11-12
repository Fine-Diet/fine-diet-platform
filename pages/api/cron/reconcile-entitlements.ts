import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

function authorized(header: string | string[] | undefined, secret: string | undefined): boolean {
  if (!secret || !secret.trim() || secret.length > 512 || typeof header !== 'string' || header.length > 1024 || !header.startsWith('Bearer ')) return false;
  const expected = createHash('sha256').update(`Bearer ${secret}`, 'utf8').digest();
  const received = createHash('sha256').update(header, 'utf8').digest();
  return timingSafeEqual(expected, received);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!authorized(req.headers.authorization, process.env.CRON_SECRET)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const { data, error } = await supabaseAdmin.rpc('fd_expire_stripe_fulfillment', { p_limit: 100 });
    if (error || !data || data.bounded !== true ||
        !Number.isSafeInteger(data.expired_purchases) || data.expired_purchases < 0 || data.expired_purchases > 100 ||
        !Number.isSafeInteger(data.revoked_grants) || data.revoked_grants < 0 || data.revoked_grants > 10000 ||
        !Number.isSafeInteger(data.suspended_assignments) || data.suspended_assignments < 0 || data.suspended_assignments > 100) {
      console.error('[payments expiry cron] bounded reconciliation RPC failed');
      return res.status(503).json({ success: false, error: 'Reconciliation unavailable' });
    }
    return res.status(200).json({ success: true,
      expired_purchases: data.expired_purchases,
      revoked_grants: data.revoked_grants,
      suspended_assignments: data.suspended_assignments,
      bounded: true,
      git_sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'unknown' });
  } catch {
    console.error('[payments expiry cron] bounded reconciliation failed');
    return res.status(503).json({ success: false, error: 'Reconciliation unavailable' });
  }
}
