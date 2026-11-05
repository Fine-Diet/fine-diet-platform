import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { linkPersonForVerifiedUser } from '@/lib/account/linkPersonForVerifiedUser';

/**
 * GET /auth/callback
 *
 * Handles the OAuth redirect from Supabase after Apple/Google sign-in.
 *
 * Flow:
 * 1. Supabase redirects here with ?code=... (PKCE code exchange)
 * 2. We exchange the code for a session and write it to cookies
 * 3. We link the exchanged, server-verified Auth user to the people system
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

  const { user } = data;

  // This identity comes from the successful server-side PKCE exchange. Call
  // the trusted linker directly; the public API route requires its own session.
  try {
    await linkPersonForVerifiedUser(user);
  } catch (linkError) {
    console.error('[auth/callback] Verified identity could not be linked:', linkError);
    return NextResponse.redirect(`${origin}/?auth_error=link_failed`);
  }

  // Validate and sanitise the redirect target
  const safeNext =
    next.startsWith('/') && !next.startsWith('//') ? next : '/';

  return NextResponse.redirect(`${origin}${safeNext}`);
}
