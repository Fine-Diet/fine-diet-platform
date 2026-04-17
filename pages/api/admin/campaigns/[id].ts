/**
 * API Route: Email Campaign — Get, Update, Delete
 *
 * GET    /api/admin/campaigns/[id]  — fetch single campaign
 * PATCH  /api/admin/campaigns/[id]  — update editable fields
 * DELETE /api/admin/campaigns/[id]  — archive (soft delete)
 *
 * Requires editor or admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { EmailCampaign } from '@/lib/emailCampaignTypes';
import { TEMPLATE_OPTIONS } from '@/lib/emailCampaignTypes';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  const { id } = req.query as { id: string };
  if (!id) return res.status(400).json({ error: 'Missing campaign id.' });

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('email_campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Campaign not found.' });
    return res.status(200).json({ campaign: data as EmailCampaign });
  }

  if (req.method === 'PATCH') {
    const {
      name,
      slug,
      campaign_type,
      subject,
      preview_text,
      content_json,
      hero_image_url,
      hero_image_asset_id,
      audience_key,
      template_key,
      scheduled_for,
    } = req.body;

    // If template_key is being updated, resolve the template_id
    let template_id: string | undefined;
    if (template_key) {
      const opt = TEMPLATE_OPTIONS.find((t) => t.key === template_key);
      template_id = opt?.templateId;
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updates.name = name;
    if (slug !== undefined) updates.slug = slug;
    if (campaign_type !== undefined) updates.campaign_type = campaign_type;
    if (subject !== undefined) updates.subject = subject;
    if (preview_text !== undefined) updates.preview_text = preview_text;
    if (content_json !== undefined) updates.content_json = content_json;
    if (hero_image_url !== undefined) updates.hero_image_url = hero_image_url;
    if (hero_image_asset_id !== undefined) updates.hero_image_asset_id = hero_image_asset_id || null;
    if (audience_key !== undefined) updates.audience_key = audience_key;
    if (template_key !== undefined) {
      updates.template_key = template_key;
      if (template_id) updates.template_id = template_id;
    }
    if (scheduled_for !== undefined) updates.scheduled_for = scheduled_for || null;

    const { data, error } = await supabaseAdmin
      .from('email_campaigns')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ campaign: data as EmailCampaign });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('email_campaigns')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
