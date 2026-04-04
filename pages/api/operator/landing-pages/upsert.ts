/**
 * Operator API: Upsert Assessment Landing Page
 *
 * POST /api/operator/landing-pages/upsert
 *
 * Machine-to-machine endpoint. Authenticated by Bearer API key
 * (Authorization: Bearer <OPERATOR_API_KEY>).
 *
 * Creates or replaces the draft landing page content for a given
 * assessment slug. Content is stored in the site_content table under
 * key `assessment-landing:{slug}` with status='draft'.
 *
 * Publishing (draft → published) remains a human action in the Admin UI.
 * All operations are idempotent — safe to retry.
 *
 * Request body:
 * {
 *   slug: string;                 // assessment slug, e.g. "gut-check"
 *   content: AssessmentLandingPageContent;
 *   brief?: string;               // stored as a note, not persisted to DB
 * }
 *
 * Response:
 * {
 *   ok: true;
 *   slug: string;
 *   key: string;                  // site_content key used
 *   created: boolean;             // true if row was inserted, false if updated
 *   reviewLink: string;
 * }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireOperatorAuth } from '@/lib/operator/auth';
import { assessmentLandingPageContentSchema } from '@/lib/contentValidators';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { sendOperatorReviewNotifications } from '@/lib/operator/notifications';

// ============================================================================
// Types
// ============================================================================

interface UpsertLandingPageRequest {
  slug: string;
  content: Record<string, unknown>;
  brief?: string;
}

interface UpsertLandingPageResponse {
  ok: true;
  slug: string;
  key: string;
  created: boolean;
  reviewLink: string;
}

// ============================================================================
// Handler
// ============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpsertLandingPageResponse | { ok: false; error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const operator = requireOperatorAuth(req, res);
  if (!operator) return;

  const body = req.body as Partial<UpsertLandingPageRequest>;

  if (!body.slug || typeof body.slug !== 'string') {
    return res.status(400).json({ ok: false, error: 'slug is required' });
  }
  if (!body.content || typeof body.content !== 'object' || Array.isArray(body.content)) {
    return res.status(400).json({ ok: false, error: 'content must be a non-null object' });
  }

  // Validate content shape
  const validation = assessmentLandingPageContentSchema.safeParse(body.content);
  if (!validation.success) {
    return res.status(400).json({
      ok: false,
      error: `Invalid landing page content: ${validation.error.issues.map((i) => i.message).join('; ')}`,
    });
  }

  const slug = body.slug.trim().toLowerCase();
  const key = `assessment-landing:${slug}`;
  const actorId = `operator:${operator.keyHint}`;

  try {
    // Check if a row already exists (any status) so we can report created vs updated
    const { data: existing } = await supabaseAdmin
      .from('site_content')
      .select('id')
      .eq('key', key)
      .maybeSingle();

    const { error: upsertError } = await supabaseAdmin
      .from('site_content')
      .upsert(
        {
          key,
          data: validation.data,
          status: 'draft',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

    if (upsertError) {
      throw new Error(`Failed to upsert landing page: ${upsertError.message}`);
    }

    // Audit log
    try {
      await supabaseAdmin.from('content_audit_log').insert({
        actor_id: null,
        action: 'operator.landing_pages.upsert',
        entity_type: 'site_content',
        entity_id: null,
        metadata: {
          key,
          slug,
          operator_key_hint: actorId,
          created: !existing,
          brief: body.brief ?? null,
        },
      });
    } catch (auditErr) {
      console.warn('[OperatorLandingPagesUpsert] Audit log error (non-blocking):', auditErr);
    }

    const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://myfinediet.com';
    const reviewLink = `${base}/lp/${slug}`;

    // Fire review notification (non-blocking)
    const notes = [
      `Slug: ${slug}`,
      `Key: ${key}`,
      `Action: ${existing ? 'updated' : 'created'}`,
      body.brief ? `Brief: ${body.brief}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    sendOperatorReviewNotifications({
      idempotencyKey: `operator-landing-page-${slug}-${Date.now()}`,
      title: `[Operator] Landing page ${existing ? 'updated' : 'created'}: ${slug}`,
      notes,
      primaryReviewUrl: reviewLink,
      metadata: { slug, key, created: !existing },
    }).catch((err) => {
      console.warn('[OperatorLandingPagesUpsert] Notification error (non-blocking):', err);
    });

    return res.status(200).json({
      ok: true,
      slug,
      key,
      created: !existing,
      reviewLink,
    });
  } catch (err) {
    console.error('[OperatorLandingPagesUpsert] Error:', err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Unexpected error',
    });
  }
}
