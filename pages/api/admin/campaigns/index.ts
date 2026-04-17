/**
 * API Route: Email Campaigns — List & Create
 *
 * GET  /api/admin/campaigns          — list all campaigns
 * POST /api/admin/campaigns          — create a new draft campaign
 *
 * Requires editor or admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { EmailCampaign, CampaignType, AudienceKey, TemplateKey } from '@/lib/emailCampaignTypes';
import { TEMPLATE_OPTIONS } from '@/lib/emailCampaignTypes';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  if (req.method === 'GET') {
    const { status } = req.query;

    let query = supabaseAdmin
      .from('email_campaigns')
      .select('*')
      .order('updated_at', { ascending: false });

    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ campaigns: data as EmailCampaign[] });
  }

  if (req.method === 'POST') {
    const { name, campaign_type, audience_key, template_key } = req.body as {
      name: string;
      campaign_type?: CampaignType;
      audience_key?: AudienceKey;
      template_key?: TemplateKey;
    };

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Campaign name is required.' });
    }

    const resolvedTemplateKey: TemplateKey = template_key || 'fine_print_weekly';
    const templateOption = TEMPLATE_OPTIONS.find((t) => t.key === resolvedTemplateKey);

    // Auto-generate slug from name + timestamp
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const slug = `${baseSlug}-${Date.now()}`.slice(0, 80);

    const { data, error } = await supabaseAdmin
      .from('email_campaigns')
      .insert({
        slug,
        name: name.trim(),
        campaign_type: campaign_type || 'editorial',
        status: 'draft',
        template_key: resolvedTemplateKey,
        template_id: templateOption?.templateId ?? null,
        subject: '',
        preview_text: '',
        content_json: { headline: '', body: '', ctaText: '', ctaUrl: '' },
        audience_key: audience_key || 'fine_print_post_nurture',
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ campaign: data as EmailCampaign });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
