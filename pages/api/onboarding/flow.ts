/**
 * API: /api/onboarding/flow
 *
 * GET — resolve the LIVE onboarding flow config for the calling entitled user.
 *   - Returns the published flow when one exists.
 *   - Otherwise returns the code-owned default config (source: 'default').
 *
 * Requires journal auth (consistent with /api/journal/*). Never mutates
 * `people.metadata`; never writes onboarding_started_at / onboarding_completed_at.
 * The live onboarding route consumes this to render admin-authored copy while
 * still writing completion through POST /api/journal/profile.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAuth } from '@/lib/access/requireJournalAccess';
import { resolveLiveOnboardingFlow } from '@/lib/onboarding/onboardingFlowServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const resolved = await resolveLiveOnboardingFlow();
  return res.status(200).json({ ...resolved });
}
