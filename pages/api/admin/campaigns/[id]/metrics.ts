/**
 * API Route: Campaign Metrics
 *
 * GET /api/admin/campaigns/[id]/metrics
 *
 * Returns aggregated delivery/engagement stats for a single campaign plus
 * a recent activity feed of the last 50 email events.
 *
 * Requires editor or admin role.
 *
 * Metrics:
 *   sent       — from people_events (fine_print_editorial_sent | product_update_sent)
 *   delivered  — from email_events
 *   opened     — unique persons who opened (unique resend_message_id where opened)
 *   clicked    — unique persons who clicked (unique resend_message_id where clicked)
 *   bounced    — from email_events
 *   open_rate  — opened / delivered
 *   click_rate — clicked / delivered
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { EmailCampaign } from '@/lib/emailCampaignTypes';

export interface CampaignMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  open_rate: number;
  click_rate: number;
}

export interface EmailEventRow {
  id: string;
  email: string;
  event_type: string;
  url: string | null;
  created_at: string;
  person_id: string | null;
}

export interface MetricsResponse {
  metrics: CampaignMetrics;
  recentEvents: EmailEventRow[];
  topUrls: { url: string; clicks: number }[];
  campaignSlug: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  const { id } = req.query as { id: string };

  // Load campaign to get its slug
  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from('email_campaigns')
    .select('id, slug, campaign_type')
    .eq('id', id)
    .single();

  if (campaignError || !campaign) {
    return res.status(404).json({ error: 'Campaign not found.' });
  }

  const c = campaign as Pick<EmailCampaign, 'id' | 'slug' | 'campaign_type'>;
  const slug = c.slug;

  // Determine which sent event type(s) to count
  const sentEventTypes =
    c.campaign_type === 'product_update'
      ? ['product_update_sent']
      : ['fine_print_editorial_sent'];

  // ── Sent count (from people_events) ──────────────────────────────────────
  const { count: sentCount } = await supabaseAdmin
    .from('people_events')
    .select('id', { count: 'exact', head: true })
    .in('event_type', sentEventTypes)
    .filter('metadata->>campaignSlug', 'eq', slug);

  // ── email_events aggregates ───────────────────────────────────────────────
  const { data: eventCounts } = await supabaseAdmin
    .from('email_events')
    .select('event_type, resend_message_id')
    .eq('campaign_slug', slug);

  const rows = (eventCounts ?? []) as { event_type: string; resend_message_id: string }[];

  const delivered = rows.filter((r) => r.event_type === 'delivered').length;
  const bounced   = rows.filter((r) => r.event_type === 'bounced').length;

  // Unique opens/clicks by resend_message_id (one per recipient per campaign)
  const openedMsgIds  = new Set(rows.filter((r) => r.event_type === 'opened').map((r) => r.resend_message_id));
  const clickedMsgIds = new Set(rows.filter((r) => r.event_type === 'clicked').map((r) => r.resend_message_id));
  const opened  = openedMsgIds.size;
  const clicked = clickedMsgIds.size;

  const openRate  = delivered > 0 ? opened  / delivered : 0;
  const clickRate = delivered > 0 ? clicked / delivered : 0;

  // ── Recent activity feed ─────────────────────────────────────────────────
  const { data: recentEvents } = await supabaseAdmin
    .from('email_events')
    .select('id, email, event_type, url, created_at, person_id')
    .eq('campaign_slug', slug)
    .order('created_at', { ascending: false })
    .limit(50);

  // ── Top clicked URLs ──────────────────────────────────────────────────────
  const urlClickMap: Record<string, number> = {};
  rows
    .filter((r) => r.event_type === 'clicked')
    .forEach((r) => {
      const url = (r as unknown as { url?: string }).url;
      if (url) urlClickMap[url] = (urlClickMap[url] ?? 0) + 1;
    });

  // To get URL in the aggregation we need the url field too
  const { data: clickRows } = await supabaseAdmin
    .from('email_events')
    .select('url')
    .eq('campaign_slug', slug)
    .eq('event_type', 'clicked')
    .not('url', 'is', null);

  const topUrlMap: Record<string, number> = {};
  ((clickRows ?? []) as { url: string }[]).forEach(({ url }) => {
    topUrlMap[url] = (topUrlMap[url] ?? 0) + 1;
  });
  const topUrls = Object.entries(topUrlMap)
    .map(([url, clicks]) => ({ url, clicks }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  return res.status(200).json({
    metrics: {
      sent:       sentCount ?? 0,
      delivered,
      opened,
      clicked,
      bounced,
      open_rate:  openRate,
      click_rate: clickRate,
    },
    recentEvents: (recentEvents ?? []) as EmailEventRow[],
    topUrls,
    campaignSlug: slug,
  } satisfies MetricsResponse);
}
