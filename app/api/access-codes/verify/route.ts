import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { normalizeAccessCode, hashAccessCode } from '@/lib/access/accessCodeHash';
import { createAccessCodeClaim } from '@/lib/access/accessCodeClaims';

/**
 * POST /api/access-codes/verify
 *
 * Frontend-safe access-code verification for the `access.code-gate.v1` module.
 *
 * Hard rules:
 *   - Codes are NEVER stored or compared as plaintext. The submitted code is
 *     normalized (trim + uppercase) and HMAC-SHA-256'd with
 *     `ACCESS_CODE_HASH_SECRET`, then matched against `access_codes.code_hash`.
 *   - Responses are frontend-safe ONLY: no internal code IDs, hashes,
 *     redemption counts, or sensitive metadata are ever returned.
 *   - On success: increment `redemption_count`, insert an
 *     `access_code_redemptions` row, and link `person_id` ONLY if the supplied
 *     email already matches an existing person. People rows are NEVER created
 *     silently here.
 *   - This endpoint does NOT grant entitlements, mutate access, call checkout,
 *     or alter billing/offer truth. For offer-attached codes it MAY create a
 *     short-lived `access_code_claims` intent and return an opaque, one-time
 *     `claimToken` (a bearer credential — NOT the access code). Entitlements
 *     are granted only later, by the authenticated claim endpoint, once a
 *     known person is resolved.
 */

type VerifyStatus = 'valid' | 'invalid' | 'expired' | 'paused' | 'limit_reached';

interface VerifySuccess {
  ok: true;
  status: 'valid';
  message?: string;
  redirectPath?: string;
  /** Opaque one-time bearer token for offer-attached codes. NOT the access code. */
  claimToken?: string;
}

interface VerifyFailure {
  ok: false;
  status: Exclude<VerifyStatus, 'valid'>;
  message: string;
}

const verifySchema = z.object({
  code: z.string().min(1, 'Code is required'),
  email: z.string().email().optional(),
  source: z.string().optional(),
  source_path: z.string().optional().nullable(),
  redirect_path: z.string().optional().nullable(),
  startPageSlug: z.string().optional().nullable(),
  programSlug: z.string().optional().nullable(),
  productSlug: z.string().optional().nullable(),
  offerKey: z.string().optional().nullable(),
  campaignKey: z.string().optional().nullable(),
  codeKey: z.string().optional().nullable(),
});

/**
 * Normalize a submitted code exactly the same way code creation does: trim +
 * uppercase. Delegated to the shared server-only helper so verification and
 * creation can never drift.
 */
function normalizeCode(raw: string): string {
  return normalizeAccessCode(raw);
}

/**
 * Deterministic server-side digest of a normalized code. Delegated to the
 * shared helper so the digest computation stays in one place.
 */
function hashCode(normalizedCode: string): string {
  return hashAccessCode(normalizedCode);
}

/** Validate that a redirect path is a safe relative path (no external URLs). */
function isSafeRelativePath(path: string | null | undefined): boolean {
  if (!path) return true;
  if (path.startsWith('http://') || path.startsWith('https://')) return false;
  if (path.startsWith('//')) return false;
  // Allow hash fragments and root-relative paths.
  return path.startsWith('/') || path.startsWith('#');
}

function fail(status: Exclude<VerifyStatus, 'valid'>, message: string): VerifyFailure {
  return { ok: false, status, message };
}

export async function POST(request: Request): Promise<NextResponse<VerifySuccess | VerifyFailure>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(fail('invalid', 'That code does not look valid. Check it and try again.'), {
      status: 400,
    });
  }

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(fail('invalid', 'That code does not look valid. Check it and try again.'), {
      status: 400,
    });
  }
  const data = parsed.data;

  if (!isSafeRelativePath(data.redirect_path)) {
    return NextResponse.json(fail('invalid', 'That code does not look valid. Check it and try again.'), {
      status: 400,
    });
  }

  let codeHash: string;
  try {
    codeHash = hashCode(normalizeCode(data.code));
  } catch (err) {
    // Missing secret / misconfiguration — never leak internals to the client.
    console.error('[access-codes/verify] hash configuration error:', err);
    return NextResponse.json(
      fail('invalid', 'That code does not look valid. Check it and try again.'),
      { status: 500 },
    );
  }

  try {
    const { data: codeRow, error } = await supabaseAdmin
      .from('access_codes')
      .select(
        'id, status, code_key, scope, start_page_slug, program_slug, product_slug, offer_key, max_redemptions, redemption_count, valid_from, expires_at',
      )
      .eq('code_hash', codeHash)
      .maybeSingle();

    if (error) {
      console.error('[access-codes/verify] lookup error:', error.message);
      return NextResponse.json(
        fail('invalid', 'That code does not look valid. Check it and try again.'),
        { status: 500 },
      );
    }

    if (!codeRow) {
      return NextResponse.json(
        fail('invalid', 'That code does not look valid. Check it and try again.'),
        { status: 200 },
      );
    }

    // ── Status / window checks ────────────────────────────────────────────
    if (codeRow.status !== 'active') {
      const message =
        codeRow.status === 'expired'
          ? 'That code is no longer active.'
          : 'That code does not look valid. Check it and try again.';
      return NextResponse.json(fail(codeRow.status === 'expired' ? 'expired' : 'paused', message), {
        status: 200,
      });
    }

    const now = new Date();
    if (codeRow.valid_from && new Date(codeRow.valid_from) > now) {
      return NextResponse.json(
        fail('invalid', 'That code does not look valid. Check it and try again.'),
        { status: 200 },
      );
    }
    if (codeRow.expires_at && new Date(codeRow.expires_at) <= now) {
      return NextResponse.json(fail('expired', 'That code is no longer active.'), { status: 200 });
    }

    // ── Scope / context matching ──────────────────────────────────────────
    // A non-null scoped field on the code constrains where it may be used; a
    // null scoped field is a wildcard for that dimension. Comparison is case-
    // sensitive on slugs/keys (they are authored identifiers).
    //
    // `codeRow.offer_key` is the GRANT ATTACHMENT source, not a required
    // mirror of the module's `offerKey` field. The module builder selector
    // only writes `codeKey`; editors are not required to also fill `offerKey`
    // to match the access code's attached offer. We therefore treat offer as
    // a scope constraint ONLY when the access-code row is explicitly scoped to
    // offer (scope === 'offer'). In every other scope the access code's
    // offer_key is used purely as the grant attachment at claim time.
    const offerScopeMismatch =
      codeRow.scope === 'offer' &&
      codeRow.offer_key !== null &&
      codeRow.offer_key !== (data.offerKey ?? null);

    const scopeMismatch =
      (codeRow.start_page_slug !== null && codeRow.start_page_slug !== (data.startPageSlug ?? null)) ||
      (codeRow.program_slug !== null && codeRow.program_slug !== (data.programSlug ?? null)) ||
      (codeRow.product_slug !== null && codeRow.product_slug !== (data.productSlug ?? null)) ||
      offerScopeMismatch ||
      (codeRow.code_key !== null && codeRow.code_key !== (data.codeKey ?? null));

    if (scopeMismatch) {
      return NextResponse.json(
        fail('invalid', 'That code does not look valid. Check it and try again.'),
        { status: 200 },
      );
    }

    // ── Redemption limit check ────────────────────────────────────────────
    if (
      codeRow.max_redemptions !== null &&
      codeRow.redemption_count >= codeRow.max_redemptions
    ) {
      return NextResponse.json(
        fail('limit_reached', 'That code does not look valid. Check it and try again.'),
        { status: 200 },
      );
    }

    // ── Link person_id ONLY if the email already matches a person ─────────
    // People rows are never created silently by this endpoint.
    let personId: string | null = null;
    if (data.email) {
      const { data: existingPerson, error: personError } = await supabaseAdmin
        .from('people')
        .select('id')
        .eq('email', data.email.trim().toLowerCase())
        .maybeSingle();

      if (personError) {
        console.error('[access-codes/verify] person lookup error:', personError.message);
        // Do not block redemption on a person-lookup failure; proceed unlinked.
      } else if (existingPerson?.id) {
        personId = existingPerson.id;
      }
    }

    // ── Record redemption + increment count ───────────────────────────────
    // Note: this increment is guarded by the limit check above but is not
    // fully atomic under concurrent redemptions. Hardened atomic redemption
    // (e.g. a Postgres function with row lock) is future work; no real codes
    // are seeded yet so the race window is not exploitable today.
    const { error: incrementError } = await supabaseAdmin
      .from('access_codes')
      .update({ redemption_count: codeRow.redemption_count + 1 })
      .eq('id', codeRow.id);

    if (incrementError) {
      console.error('[access-codes/verify] increment error:', incrementError.message);
      return NextResponse.json(
        fail('invalid', 'That code does not look valid. Check it and try again.'),
        { status: 500 },
      );
    }

    const redemptionContext = {
      source_path: data.source_path ?? null,
      redirect_path: data.redirect_path ?? null,
      startPageSlug: data.startPageSlug ?? null,
      programSlug: data.programSlug ?? null,
      productSlug: data.productSlug ?? null,
      // Disambiguate: moduleOfferKey is the module's optional context field;
      // accessCodeOfferKey is the offer attached to the access-code row and is
      // the source of any grant at claim time.
      moduleOfferKey: data.offerKey ?? null,
      accessCodeOfferKey: codeRow.offer_key ?? null,
      campaignKey: data.campaignKey ?? null,
      codeKey: data.codeKey ?? null,
    };

    const { data: redemptionRow, error: redemptionError } = await supabaseAdmin
      .from('access_code_redemptions')
      .insert({
        access_code_id: codeRow.id,
        person_id: personId,
        email: data.email ? data.email.trim().toLowerCase() : null,
        source: data.source ?? null,
        context: redemptionContext,
      })
      .select('id')
      .single();

    if (redemptionError) {
      console.error('[access-codes/verify] redemption insert error:', redemptionError.message);
      // The code was already incremented; do not surface internals. Treat as
      // a soft success since validation itself passed.
    }

    const success: VerifySuccess = {
      ok: true,
      status: 'valid',
    };
    if (data.redirect_path) {
      success.redirectPath = data.redirect_path;
    }

    // ── Offer-attached codes: create a short-lived claim/intent ──────────
    // Anonymous-safe: this only records intent + a hashed bearer token. It
    // does NOT create a person and does NOT grant entitlements. The raw
    // claim token is returned once so the client can later redeem it after
    // authenticating. Claim creation failure is non-fatal — the redemption
    // already succeeded, so we surface a plain valid response without a
    // claimToken rather than failing the whole verification.
    if (codeRow.offer_key) {
      try {
        const claim = await createAccessCodeClaim({
          accessCodeId: codeRow.id,
          redemptionId: redemptionRow?.id ?? null,
          offerKey: codeRow.offer_key,
          email: data.email ? data.email.trim().toLowerCase() : null,
          redirectPath: data.redirect_path ?? null,
          source: data.source ?? null,
          context: redemptionContext,
        });
        success.claimToken = claim.claimToken;
      } catch (claimErr) {
        console.error('[access-codes/verify] claim creation error:', claimErr);
      }
    }

    return NextResponse.json(success, { status: 200 });
  } catch (err) {
    console.error('[access-codes/verify] unexpected error:', err);
    return NextResponse.json(
      fail('invalid', 'That code does not look valid. Check it and try again.'),
      { status: 500 },
    );
  }
}
