import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  upsertPerson,
  ensureSubscription,
  logEvent,
  emitN8nWebhook,
} from '@/lib/peopleService';

// Validation schema
const newsletterSchema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z.string().optional().nullable(),
  source: z.string().optional().default('footer_newsletter'),
  utmSource: z.string().optional().nullable(),
  utmMedium: z.string().optional().nullable(),
  utmCampaign: z.string().optional().nullable(),
});

type NewsletterData = z.infer<typeof newsletterSchema>;

/**
 * POST /api/people/newsletter
 * 
 * Handles newsletter signups (typically from footer)
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validationResult = newsletterSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data: NewsletterData = validationResult.data;

    // Upsert person
    const person = await upsertPerson({
      email: data.email,
      firstName: data.firstName || null,
      status: 'marketing_only',
      source: data.source,
      emailOptIn: true,
      utmSource: data.utmSource || null,
      utmMedium: data.utmMedium || null,
      utmCampaign: data.utmCampaign || null,
    });

    // Ensure subscription
    await ensureSubscription({
      personId: person.id,
      type: 'email_marketing',
    });

    // Log event
    await logEvent({
      personId: person.id,
      eventType: 'newsletter_signup',
      source: data.source,
      channel: 'web',
      metadata: {
        utmSource: data.utmSource || null,
        utmMedium: data.utmMedium || null,
        utmCampaign: data.utmCampaign || null,
      },
    });

    // Emit n8n webhook
    await emitN8nWebhook({
      kind: 'newsletter_signup',
      person: {
        id: person.id,
        email: person.email,
        firstName: person.first_name,
        lastName: person.last_name,
      },
      source: data.source,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('Newsletter API error:', error);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}

