import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyEmailToken } from '@/lib/emailLinks';
import { upsertEmailPreferences } from '@/lib/peopleService';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const unsubscribeSchema = z.object({
  token: z.string().min(1),
  /**
   * 'all' — sets unsubscribe_all_at, disabling all sends for this person.
   * More granular scopes can be added here in the next pass (topic-level).
   */
  scope: z.enum(['all']).default('all'),
});

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/**
 * POST /api/people/unsubscribe
 *
 * Accepts a signed email-management token and unsubscribes the person.
 *
 * Body: { token: string, scope?: 'all' }
 *
 * On success: updates email_preferences.unsubscribe_all_at and deactivates
 * all email_marketing subscriptions for the person.
 *
 * Used by the /unsubscribe page and can be called programmatically.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = unsubscribeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { token } = parsed.data;

    // Verify the signed token
    const result = verifyEmailToken(token);
    if (!result.ok) {
      const status = result.reason === 'expired' ? 410 : 400;
      return NextResponse.json(
        { error: result.reason === 'expired' ? 'This link has expired.' : 'Invalid unsubscribe link.' },
        { status },
      );
    }

    const { personId, email } = result.payload;

    // Confirm the person still exists and the email matches (basic sanity guard)
    const { data: person, error: personError } = await supabaseAdmin
      .from('people')
      .select('id, email')
      .eq('id', personId)
      .maybeSingle();

    if (personError || !person) {
      return NextResponse.json({ error: 'Person not found.' }, { status: 404 });
    }

    if (person.email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ error: 'Invalid unsubscribe link.' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Set global unsubscribe timestamp
    await upsertEmailPreferences({
      personId,
      unsubscribeAllAt: now,
    });

    // Deactivate all email_marketing subscriptions for this person
    await supabaseAdmin
      .from('subscriptions')
      .update({ is_active: false, updated_at: now })
      .eq('person_id', personId)
      .eq('subscription_type', 'email_marketing');

    // Update people.status to 'unsubscribed' (only if not already blocked)
    const { data: currentPerson } = await supabaseAdmin
      .from('people')
      .select('status')
      .eq('id', personId)
      .single();

    if (currentPerson && currentPerson.status !== 'blocked') {
      await supabaseAdmin
        .from('people')
        .update({ status: 'unsubscribed', updated_at: now })
        .eq('id', personId);
    }

    // Audit log
    await supabaseAdmin.from('people_events').insert({
      person_id: personId,
      event_type: 'unsubscribed',
      source: 'email_link',
      channel: 'email',
      metadata: { scope: 'all', via: 'unsubscribe_link' },
      created_at: now,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('Unsubscribe API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
