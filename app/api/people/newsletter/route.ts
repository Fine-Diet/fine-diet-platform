import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  upsertPerson,
  ensureSubscription,
  logEvent,
  emitN8nWebhook,
  upsertEmailPreferences,
  type EventType,
  type SubscriptionType,
} from '@/lib/peopleService';
import { buildUnsubscribeUrl } from '@/lib/emailLinks';

// ============================================================================
// Validation schema
// ============================================================================

const newsletterSchema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),

  /**
   * Where the opt-in originated.
   * Determines which subscriptions and preferences are activated.
   * Defaults to 'footer_newsletter' for backward compat with existing footer form.
   */
  source: z
    .enum([
      'footer_newsletter',
      'home_fine_print',
      'landing_the_fine_print',
      'checkout_opt_in',
      'journal_onboarding_opt_in',
    ])
    .default('footer_newsletter'),

  /**
   * Explicit intent override.
   * 'product_updates' → platform/company comms (footer-style)
   * 'nurture_marketing' → nutrition insights, nurture content, offers
   * When absent, intent is inferred from `source`.
   */
  intent: z.enum(['product_updates', 'nurture_marketing']).optional(),

  /**
   * Explicit per-topic preference overrides.
   * When absent, sensible defaults are inferred from source + intent.
   */
  preferences: z
    .object({
      productUpdates: z.boolean().optional(),
      nutritionInsights: z.boolean().optional(),
      programOffers: z.boolean().optional(),
      earlyAccess: z.boolean().optional(),
    })
    .optional(),

  // Attribution
  utmSource: z.string().optional().nullable(),
  utmMedium: z.string().optional().nullable(),
  utmCampaign: z.string().optional().nullable(),
});

type NewsletterData = z.infer<typeof newsletterSchema>;

// ============================================================================
// Source → subscription + preference mapping
// ============================================================================

interface SourceConfig {
  subscriptions: SubscriptionType[];
  resolvedPrefs: {
    productUpdates: boolean;
    nutritionInsights: boolean;
    programOffers: boolean;
    earlyAccess: boolean;
  };
  eventType: EventType;
}

function resolveSourceConfig(data: NewsletterData): SourceConfig {
  const { source, intent, preferences } = data;

  const isNurture =
    intent === 'nurture_marketing' ||
    source === 'home_fine_print' ||
    source === 'landing_the_fine_print';

  // Subscription mapping
  // Footer / product-update sources get both for backward compat.
  // Nurture / Fine Print sources get email_marketing only.
  const subscriptions: SubscriptionType[] = isNurture
    ? ['email_marketing']
    : ['email_marketing', 'product_updates'];

  // Preference defaults inferred from intent, then overridden by explicit payload
  const resolvedPrefs = {
    productUpdates: preferences?.productUpdates ?? !isNurture,
    nutritionInsights: preferences?.nutritionInsights ?? isNurture,
    programOffers: preferences?.programOffers ?? isNurture,
    earlyAccess: preferences?.earlyAccess ?? isNurture,
  };

  const eventType: EventType = isNurture ? 'fine_print_signup' : 'newsletter_signup';

  return { subscriptions, resolvedPrefs, eventType };
}

// ============================================================================
// Route handler
// ============================================================================

/**
 * POST /api/people/newsletter
 *
 * Unified newsletter / marketing opt-in handler.
 *
 * Sources:
 *   footer_newsletter        → product_updates + email_marketing subscriptions
 *   home_fine_print          → email_marketing + nurture preferences
 *   landing_the_fine_print   → email_marketing + nurture preferences
 *   checkout_opt_in          → respects explicit `preferences` payload
 *   journal_onboarding_opt_in → respects explicit `preferences` payload
 *
 * Backward compat: existing footer callers only send { email, source }
 * and continue to work without modification.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validationResult = newsletterSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: validationResult.error.issues },
        { status: 400 },
      );
    }

    const data: NewsletterData = validationResult.data;
    const { subscriptions, resolvedPrefs, eventType } = resolveSourceConfig(data);

    // Upsert person (never downgrades status)
    const person = await upsertPerson({
      email: data.email,
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      status: 'marketing_only',
      source: data.source,
      emailOptIn: true,
      utmSource: data.utmSource || null,
      utmMedium: data.utmMedium || null,
      utmCampaign: data.utmCampaign || null,
    });

    // Ensure all resolved subscriptions are active
    for (const type of subscriptions) {
      await ensureSubscription({ personId: person.id, type });
    }

    // Write fine-grained email preferences
    await upsertEmailPreferences({
      personId: person.id,
      productUpdates: resolvedPrefs.productUpdates,
      nutritionInsights: resolvedPrefs.nutritionInsights,
      programOffers: resolvedPrefs.programOffers,
      earlyAccess: resolvedPrefs.earlyAccess,
    });

    // Audit log
    await logEvent({
      personId: person.id,
      eventType,
      source: data.source,
      channel: 'web',
      metadata: {
        intent: data.intent ?? null,
        preferences: resolvedPrefs,
        utmSource: data.utmSource ?? null,
        utmMedium: data.utmMedium ?? null,
        utmCampaign: data.utmCampaign ?? null,
      },
    });

    // n8n webhook
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://myfinediet.com';
    const unsubscribeUrl = buildUnsubscribeUrl(siteUrl, person.id, person.email);

    await emitN8nWebhook({
      kind: eventType,
      person: {
        id: person.id,
        email: person.email,
        firstName: person.first_name,
        lastName: person.last_name,
        status: person.status,
        unsubscribeUrl,
      },
      subscriptions: subscriptions.map((type) => ({
        subscription_type: type,
        program_slug: null,
        is_active: true,
      })),
      preferences: resolvedPrefs,
      event: {
        event_type: eventType,
        source: data.source,
        metadata: { intent: data.intent ?? null },
      },
      context: {
        source_path: null,
        redirect_path: null,
        utm_source: data.utmSource ?? null,
        utm_medium: data.utmMedium ?? null,
        utm_campaign: data.utmCampaign ?? null,
      },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('Newsletter API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
