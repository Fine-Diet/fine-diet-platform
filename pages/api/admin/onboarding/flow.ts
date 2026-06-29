/**
 * API: /api/admin/onboarding/flow?source=draft|published|default
 *
 * GET — resolve the onboarding flow config for the admin PREVIEW by source.
 *   - draft     → current draft (falls back to published → default)
 *   - published → current published (falls back to default)
 *   - default   → code-owned default config
 *
 * Protected: editor | admin. Never calls `/api/journal/profile` and never
 * mutates `people.metadata`. Used only by the admin preview toolbar.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  resolveOnboardingFlowForPreview,
  type OnboardingFlowSource,
} from '@/lib/onboarding/onboardingFlowServerService';

const VALID_SOURCES: readonly OnboardingFlowSource[] = ['draft', 'published', 'default'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const raw = String(req.query.source ?? 'draft').toLowerCase();
  const source: OnboardingFlowSource = (VALID_SOURCES as readonly string[]).includes(raw)
    ? (raw as OnboardingFlowSource)
    : 'draft';

  const resolved = await resolveOnboardingFlowForPreview(source);
  return res.status(200).json({ success: true, ...resolved });
}
