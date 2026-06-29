/**
 * API: /api/admin/onboarding/publish
 *
 * POST body: { action: 'publish' | 'unpublish' }
 *   publish   — strictly validate the current draft, then copy draft -> published.
 *   unpublish — remove the published row (live onboarding falls back to default).
 *
 * Protected: editor | admin. Never mutates `people.metadata`. Invalid config
 * cannot publish.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  publishDraftFlow,
  unpublishFlow,
} from '@/lib/onboarding/onboardingFlowServerService';

type Action = 'publish' | 'unpublish';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const action = req.body?.action as Action | undefined;
  if (action !== 'publish' && action !== 'unpublish') {
    return res.status(400).json({
      success: false,
      error: 'action must be "publish" or "unpublish"',
    });
  }

  if (action === 'publish') {
    const outcome = await publishDraftFlow(undefined, user.id);
    if (!outcome.success) {
      return res.status(422).json({ success: false, error: outcome.error });
    }
    return res.status(200).json({ success: true, status: 'published', record: outcome.record });
  }

  // unpublish
  const { success, error } = await unpublishFlow();
  if (!success) return res.status(500).json({ success: false, error });
  return res.status(200).json({ success: true, status: 'draft' });
}
