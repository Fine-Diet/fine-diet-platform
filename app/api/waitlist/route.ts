import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Validation schema
const waitlistSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().optional().nullable(),
  goal: z.enum(['Energy', 'Digestion', 'Weight', 'Clarity', 'Sleep', 'Other', '']).optional().nullable(),
});

type WaitlistData = z.infer<typeof waitlistSchema>;

/**
 * POST /api/waitlist
 * 
 * Handles waitlist submissions:
 * 1. Validates input
 * 2. Inserts into Supabase waitlist table
 * 3. Optionally sends to Google Sheets webhook
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validationResult = waitlistSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const data: WaitlistData = validationResult.data;

    // Get Supabase admin client (server-side only)
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    // Insert into Supabase waitlist table
    const { error: supabaseError } = await supabaseAdmin
      .from('waitlist')
      .insert({
        email: data.email,
        name: data.name || null,
        goal: data.goal || null,
        source: 'journal',
        created_at: new Date().toISOString(),
      });

    if (supabaseError) {
      // Check if it's a duplicate email error
      if (supabaseError.code === '23505' || supabaseError.message.includes('duplicate')) {
        return NextResponse.json(
          { error: 'This email is already on the waitlist.' },
          { status: 409 }
        );
      }

      console.error('Supabase error:', supabaseError);
      return NextResponse.json(
        { error: 'Failed to add to waitlist. Please try again.' },
        { status: 500 }
      );
    }

    // Optionally send to Google Sheets webhook
    const sheetsWebhookUrl = process.env.SHEETS_WEBHOOK_URL;
    if (sheetsWebhookUrl) {
      try {
        await fetch(sheetsWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: data.email,
            name: data.name || '',
            goal: data.goal || '',
            source: 'journal',
            timestamp: new Date().toISOString(),
          }),
        });
      } catch (webhookError) {
        // Log but don't fail the request if webhook fails
        console.warn('Google Sheets webhook failed:', webhookError);
      }
    }

    return NextResponse.json(
      { success: true, message: 'Successfully added to waitlist' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Waitlist API error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}

