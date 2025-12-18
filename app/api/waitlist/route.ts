import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

// Validation schema
const waitlistSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().optional().nullable(),
  goal: z.enum(['Energy', 'Digestion', 'Weight', 'Clarity', 'Sleep', 'Other']).optional().nullable(),
});

type WaitlistData = z.infer<typeof waitlistSchema>;

/**
 * POST /api/waitlist
 * 
 * Handles waitlist submissions for The Fine Diet Journal.
 * Writes directly to public.waitlist table using server-only env vars.
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validationResult = waitlistSchema.safeParse(body);

    if (!validationResult.success) {
      // Extract the first validation error message
      const firstError = validationResult.error.issues[0];
      const errorMessage = firstError?.message === 'Invalid email address' 
        ? 'Invalid email' 
        : 'Invalid payload';
      
      return NextResponse.json(
        { ok: false, error: errorMessage },
        { status: 400 }
      );
    }

    const data: WaitlistData = validationResult.data;

    // Get Supabase credentials from server-only env vars
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      console.error('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL environment variable');
      return NextResponse.json(
        { ok: false, error: 'Missing SUPABASE_URL' },
        { status: 500 }
      );
    }

    if (!supabaseServiceRoleKey) {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
      return NextResponse.json(
        { ok: false, error: 'Missing SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 }
      );
    }

    // Create Supabase admin client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Insert into waitlist table
    const { error: insertError } = await supabase
      .from('waitlist')
      .insert({
        email: data.email.trim().toLowerCase(),
        name: data.name?.trim() || null,
        goal: data.goal || null,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('Waitlist insert error:', insertError);
      return NextResponse.json(
        { ok: false, error: 'Supabase insert failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Waitlist API error:', error);
    return NextResponse.json(
      { ok: false, error: 'Server error' },
      { status: 500 }
    );
  }
}

