/**
 * API Route: Personal Dashboard
 *
 * GET /api/account/dashboard
 *
 * Returns user info, person record, access status, and recommendations
 * for the authenticated user's personal home page (/home).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { hasJournalAccess } from '@/lib/access/accessService';

interface DashboardPerson {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface JournalAccess {
  hasAccess: boolean;
  source: 'subscription' | 'entitlement' | null;
  endsAt: string | null;
}

interface Recommendation {
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}

interface DashboardResponse {
  user: { email: string | null; role: string };
  person: DashboardPerson | null;
  access: { journal: JournalAccess };
  recommendations: Recommendation[];
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DashboardResponse | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getCurrentUserWithRoleFromApi(req, res);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Resolve person record
    const { data: personRow } = await supabaseAdmin
      .from('people')
      .select('id, first_name, last_name')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    const person: DashboardPerson | null = personRow
      ? { id: personRow.id, first_name: personRow.first_name, last_name: personRow.last_name }
      : null;

    // Journal access check
    let journalAccess: JournalAccess = { hasAccess: false, source: null, endsAt: null };

    if (person) {
      const hasAccess = await hasJournalAccess(person.id);

      if (hasAccess) {
        // Determine source: check subscriptions first (legacy), then entitlements
        const { data: subs } = await supabaseAdmin
          .from('subscriptions')
          .select('id')
          .eq('person_id', person.id)
          .eq('subscription_type', 'journal_access')
          .eq('is_active', true)
          .limit(1);

        if (subs && subs.length > 0) {
          journalAccess = { hasAccess: true, source: 'subscription', endsAt: null };
        } else {
          // Must be via entitlement — fetch ends_at.
          // Order: perpetual (null ends_at) first, then latest ends_at,
          // so the "best" row wins when multiple active rows exist.
          const now = new Date().toISOString();
          const { data: ents } = await supabaseAdmin
            .from('person_entitlements')
            .select('ends_at')
            .eq('person_id', person.id)
            .eq('entitlement_key', 'journal')
            .eq('is_active', true)
            .lte('starts_at', now)
            .or(`ends_at.is.null,ends_at.gt.${now}`)
            .order('ends_at', { ascending: false, nullsFirst: true })
            .limit(1);

          const bestEnt = ents?.[0] ?? null;
          journalAccess = {
            hasAccess: true,
            source: 'entitlement',
            endsAt: bestEnt?.ends_at ?? null,
          };
        }
      }
    }

    // Build recommendations (v1 rules-based, no new data model)
    const recommendations: Recommendation[] = [];

    if (!journalAccess.hasAccess) {
      recommendations.push({
        title: 'Start Your Journal',
        description: 'Track meals, monitor nutrition density, and build better habits.',
        ctaLabel: 'Get Journal Access',
        ctaHref: '/journal-waitlist',
      });
    }

    recommendations.push({
      title: 'Take an Assessment',
      description: 'Discover your patterns in under 5 minutes with a free assessment.',
      ctaLabel: 'Browse Assessments',
      ctaHref: '/assessments',
    });

    if (journalAccess.hasAccess) {
      recommendations.push({
        title: 'Explore Programs',
        description: 'Personalized nutrition and wellness programs designed for you.',
        ctaLabel: 'View Programs',
        ctaHref: '/programs',
      });
    }

    return res.status(200).json({
      user: { email: user.email, role: user.role },
      person,
      access: { journal: journalAccess },
      recommendations,
    });
  } catch (err) {
    console.error('[Dashboard API] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
