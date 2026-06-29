/**
 * API: /api/admin/onboarding
 *
 * GET  — return the default flow's draft + published state for the authoring
 *        UI, plus a per-flow summary list.
 * POST — create or update the DRAFT config for the default flow. Strictly
 *        validates (structural + semantic) so malformed drafts are rejected.
 *
 * Protected: editor | admin. Presentation/authoring only — never touches
 * `people.metadata`, Stripe, offers, billing, or entitlements.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  getDraftFlow,
  getPublishedFlow,
  listOnboardingFlows,
  saveDraftFlow,
} from '@/lib/onboarding/onboardingFlowServerService';
import {
  DEFAULT_ONBOARDING_FLOW_CONFIG,
  DEFAULT_ONBOARDING_FLOW_KEY,
  DEFAULT_ONBOARDING_FLOW_TITLE,
} from '@/lib/onboarding/onboardingFlowTypes';
import { validateOnboardingFlowConfig } from '@/lib/onboarding/onboardingFlowValidation';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const [draft, published, flows] = await Promise.all([
      getDraftFlow(DEFAULT_ONBOARDING_FLOW_KEY),
      getPublishedFlow(DEFAULT_ONBOARDING_FLOW_KEY),
      listOnboardingFlows(),
    ]);

    return res.status(200).json({
      flows,
      draft,
      published,
      hasDraft: Boolean(draft),
      hasPublished: Boolean(published),
      // Seed for a new draft when none exists.
      seed: {
        flowKey: DEFAULT_ONBOARDING_FLOW_KEY,
        title: DEFAULT_ONBOARDING_FLOW_TITLE,
        config: DEFAULT_ONBOARDING_FLOW_CONFIG,
      },
    });
  }

  // ── POST: save draft ───────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body ?? {};
    const title = typeof body.title === 'string' ? body.title : '';
    const config = body.config;

    const validation = validateOnboardingFlowConfig(config);
    if (!validation.ok) {
      return res.status(422).json({
        success: false,
        error: 'Validation failed — resolve the issues before saving.',
        validation,
      });
    }

    const outcome = await saveDraftFlow(
      DEFAULT_ONBOARDING_FLOW_KEY,
      title || DEFAULT_ONBOARDING_FLOW_TITLE,
      config,
      user.id,
    );
    if (!outcome.success) {
      return res.status(500).json({ success: false, error: outcome.error });
    }

    return res.status(200).json({ success: true, record: outcome.record, validation });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
