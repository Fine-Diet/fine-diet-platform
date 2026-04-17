/**
 * API Route: Campaign Status Transition
 *
 * POST /api/admin/campaigns/[id]/status
 * Body: { status: CampaignStatus }
 *
 * Validates the transition is allowed, updates the record.
 * Requires editor or admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { CampaignStatus } from '@/lib/emailCampaignTypes';
import { STATUS_TRANSITIONS } from '@/lib/emailCampaignTypes';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  const { id } = req.query as { id: string };
  const { status: nextStatus } = req.body as { status: CampaignStatus };

  if (!nextStatus) return res.status(400).json({ error: 'status is required.' });

  // Load current campaign
  const { data: campaign, error: fetchError } = await supabaseAdmin
    .from('email_campaigns')
    .select('id, status')
    .eq('id', id)
    .single();

  if (fetchError || !campaign) return res.status(404).json({ error: 'Campaign not found.' });

  const currentStatus = campaign.status as CampaignStatus;
  const allowed = STATUS_TRANSITIONS[currentStatus] || [];

  if (!allowed.includes(nextStatus)) {
    return res.status(400).json({
      error: `Cannot transition from "${currentStatus}" to "${nextStatus}".`,
      allowedTransitions: allowed,
    });
  }

  const updates: Record<string, unknown> = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };

  // Record approval metadata
  if (nextStatus === 'approved') {
    updates.approved_by_person_id = null; // would be user.id if people table linked to auth
  }

  const { data, error } = await supabaseAdmin
    .from('email_campaigns')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ campaign: data });
}
