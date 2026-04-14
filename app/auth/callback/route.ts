import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * GET /auth/callback
 *
 * Handles the OAuth redirect from Supabase after Apple/Google sign-in.
 *
 * Flow:
 * 1. Supabase redirects here with ?code=... (PKCE code exchange)
 * 2. We exchange the code for a session and write it to cookies
 * 3. We call /api/account/link-person to link the auth user to the people system
 * 4. We redirect to ?next= or the homepage
 *
 * This route must be registered as an allowed redirect URL in the Supabase
 * project dashboard under Authentication → URL Configuration.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get('next') ?? '/';

  // Check for an upstream provider/Supabase error first.
  // When the OAuth exchange fails on the provider side, Supabase redirects here
  // with ?error=...&error_code=...&error_description=... and NO ?code=.
  // Without this guard the route would incorrectly surface `missing_code`
  // instead of the actual upstream failure.
  const providerError = searchParams.get('error');
  const providerErrorCode = searchParams.get('error_code');
  const providerErrorDescription = searchParams.get('error_description');

  if (providerError) {
    console.error('[auth/callback] Upstream provider/Supabase error:', {
      error: providerError,
      error_code: providerErrorCode,
      error_description: providerErrorDescription,
    });
    return NextResponse.redirect(`${origin}/?auth_error=exchange_failed`);
  }

  const code = searchParams.get('code');

  if (!code) {
    // No code and no provider error — user cancelled or the link expired.
    console.warn('[auth/callback] No code and no provider error — user may have cancelled.');
    return NextResponse.redirect(`${origin}/?auth_error=missing_code`);
  }

  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll may throw in middleware contexts — safe to ignore here
          }
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    console.error('[auth/callback] Code exchange failed:', error?.message);
    return NextResponse.redirect(`${origin}/?auth_error=exchange_failed`);
  }

  const { user, session } = data;

  // Link auth user to the people/profiles system — same as email login path
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin;
    const linkResponse = await fetch(`${siteUrl}/api/account/link-person`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authUserId: user.id,
        email: user.email,
      }),
    });

    if (!linkResponse.ok) {
      console.warn('[auth/callback] link-person response not OK:', linkResponse.status);
    }
  } catch (linkError) {
    // Non-fatal — user is authenticated even if linking fails
    console.warn('[auth/callback] Error calling link-person:', linkError);
  }

  // Validate and sanitise the redirect target
  const safeNext =
    next.startsWith('/') && !next.startsWith('//') ? next : '/';

  return NextResponse.redirect(`${origin}${safeNext}`);
}
