import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { grantAccessCodeClaimByToken } from '@/lib/access/accessCodeClaims';

/**
 * POST /api/access-codes/claim
 *
 * Authenticated redemption of an access-code offer claim.
 *
 * Flow:
 *   1. Authenticate the caller via the Supabase session cookie (no service-
 *      role trust of client-supplied ids).
 *   2. Resolve the known `people` row for that auth user (by auth_user_id,
 *      falling back to email). If no person exists, refuse — entitlements are
 *      never granted without a known person.
 *   3. Hash the submitted `claimToken` and look up the pending claim.
 *   4. Enforce email binding when the claim captured an email at the gate.
 *   5. Grant the attached offer's entitlements to the resolved person via the
 *      shared offer-grant service (creates person_entitlements + runs program
 *      assignment automation). Idempotent: an already-granted claim succeeds
 *      without re-granting.
 *
 * Hard rules:
 *   - Never creates People rows (link-person already did at signup/login).
 *   - Never grants entitlements without an authenticated, known person.
 *   - Never exposes claim-token hashes, internal grant errors, or offer
 *     internals to the client. Public responses are minimal and safe.
 *   - Never touches pricing, checkout, or Stripe.
 */

const claimSchema = z.object({
  claimToken: z.string().min(1, 'claimToken is required'),
});

function publicFail(status: number): NextResponse {
  return NextResponse.json({ ok: false, status: 'error' }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return publicFail(400);
  }

  const parsed = claimSchema.safeParse(body);
  if (!parsed.success) {
    return publicFail(400);
  }

  // ── Authenticate via session cookie ─────────────────────────────────────
  const cookieStore = cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[access-codes/claim] missing Supabase env');
    return publicFail(500);
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // Read-only route — no cookie writes needed.
      },
    },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return publicFail(401);
  }

  const authEmail = user.email ?? null;

  // ── Resolve the known person (never create here) ────────────────────────
  let person: { id: string; email: string | null } | null = null;

  const { data: byAuthId } = await supabaseAdmin
    .from('people')
    .select('id, email')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (byAuthId) {
    person = byAuthId as { id: string; email: string | null };
  } else if (authEmail) {
    const { data: byEmail } = await supabaseAdmin
      .from('people')
      .select('id, email')
      .eq('email', authEmail.trim().toLowerCase())
      .maybeSingle();
    person = (byEmail as { id: string; email: string | null } | null) ?? null;
  }

  if (!person) {
    // No known person — refuse to grant. Client may retry once link-person
    // has run; surface a neutral error.
    return publicFail(404);
  }

  // ── Grant (idempotent) ──────────────────────────────────────────────────
  try {
    const result = await grantAccessCodeClaimByToken(
      parsed.data.claimToken,
      person.id,
      person.email ?? authEmail ?? '',
    );

    switch (result.status) {
      case 'granted':
      case 'already_granted':
        return NextResponse.json(
          { ok: true, status: 'granted' },
          { status: 200 },
        );
      case 'expired':
        return publicFail(410);
      case 'not_found':
        return publicFail(404);
      case 'email_mismatch':
        return publicFail(403);
      case 'no_mappings':
        // Offer has no active entitlements — nothing to grant. Treat as a
        // non-retryable completion so the client drops the token.
        return NextResponse.json(
          { ok: true, status: 'nothing_to_grant' },
          { status: 200 },
        );
      case 'failed':
      default:
        console.error('[access-codes/claim] grant failed:', result.reason);
        return publicFail(500);
    }
  } catch (err) {
    console.error('[access-codes/claim] unexpected error:', err);
    return publicFail(500);
  }
}
