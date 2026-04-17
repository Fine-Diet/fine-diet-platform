/**
 * API Route: Campaign Proof Send
 *
 * POST /api/admin/campaigns/[id]/proof
 * Body: { testEmail: string }
 *
 * Sends the campaign to a single test address using the real send stack.
 * Does NOT send to the production audience and does NOT log a people_event.
 * Requires editor or admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { EmailCampaign, CampaignContentJson } from '@/lib/emailCampaignTypes';
import { renderCampaignEmail } from '@/lib/emailTemplates';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  const { id } = req.query as { id: string };
  const { testEmail } = req.body as { testEmail: string };

  if (!testEmail?.trim()) {
    return res.status(400).json({ error: 'testEmail is required.' });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured.' });
  }

  // Load campaign
  const { data: campaign, error: fetchError } = await supabaseAdmin
    .from('email_campaigns')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !campaign) {
    return res.status(404).json({ error: 'Campaign not found.' });
  }

  const c = campaign as EmailCampaign;
  const content = (c.content_json || {}) as CampaignContentJson;

  if (!c.subject?.trim()) {
    return res.status(400).json({ error: 'Campaign subject is required before sending a proof.' });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://myfinediet.com';
  const unsubscribeUrl = `${siteUrl}/unsubscribe?preview=true`;

  const { html, text } = renderCampaignEmail(c.template_key, {
    firstName: 'Preview',
    headline: content.headline || '(No headline set)',
    body: content.body || '(No body set)',
    ctaUrl: content.ctaUrl || siteUrl,
    ctaText: content.ctaText || 'Learn More',
    unsubscribeUrl,
    heroImageUrl: c.hero_image_url ?? undefined,
  });

  const resendPayload = {
    from: 'Fine Diet <hi@myfinediet.com>',
    reply_to: 'hi@myfinediet.com',
    to: testEmail.trim(),
    subject: `[PROOF] ${c.subject}`,
    html,
    text,
  };

  const sendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(resendPayload),
  });

  if (!sendRes.ok) {
    const errBody = await sendRes.text();
    return res.status(502).json({ error: `Resend error: ${errBody}` });
  }

  const json = await sendRes.json();

  return res.status(200).json({
    ok: true,
    resendId: json.id,
    sentTo: testEmail.trim(),
    campaignId: id,
    campaignName: c.name,
  });
}
