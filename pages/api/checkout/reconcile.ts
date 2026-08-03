/**
 * GET /api/checkout/reconcile?session_id=cs_...
 *
 * Package 2 bounded checkout-success reconciliation.
 * Verifies the Stripe Checkout Session server-side and reports whether
 * effective journal access is visible yet. Never trusts checkout=success alone.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { stripe } from '@/lib/stripe/stripeServer';
import { resolveJournalGrant } from '@/lib/access/effectiveAccess';
import { getSafeRedirectTarget, isSafeRedirectTarget } from '@/lib/redirectHelpers';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { deriveOnboardingState } from '@/lib/onboarding/onboardingState';

const MAX_ATTEMPTS_HINT = 8;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getCurrentUserWithRoleFromApi(req, res);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sessionIdRaw = Array.isArray(req.query.session_id)
    ? req.query.session_id[0]
    : req.query.session_id;
  const returnToRaw = Array.isArray(req.query.returnTo)
    ? req.query.returnTo[0]
    : req.query.returnTo;

  if (!sessionIdRaw || typeof sessionIdRaw !== 'string' || !sessionIdRaw.startsWith('cs_')) {
    return res.status(400).json({ error: 'invalid_session', status: 'error' });
  }

  const safeReturnTo = isSafeRedirectTarget(returnToRaw)
    ? getSafeRedirectTarget(returnToRaw, APP_ROUTES.home)
    : APP_ROUTES.home;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionIdRaw);
    const metaPersonId = session.metadata?.person_id ?? null;

    const { data: person } = await supabaseAdmin
      .from('people')
      .select('id, metadata')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!person?.id) {
      return res.status(200).json({
        status: 'error',
        reason: 'person_unresolved',
        returnTo: safeReturnTo,
      });
    }

    if (metaPersonId && metaPersonId !== person.id) {
      return res.status(403).json({
        status: 'error',
        reason: 'session_person_mismatch',
        returnTo: safeReturnTo,
      });
    }

    if (session.status === 'expired') {
      return res.status(200).json({
        status: 'failed',
        reason: 'session_expired',
        returnTo: safeReturnTo,
      });
    }

    if (session.payment_status === 'unpaid' && session.status !== 'complete') {
      return res.status(200).json({
        status: 'pending',
        reason: 'payment_incomplete',
        returnTo: safeReturnTo,
        maxAttemptsHint: MAX_ATTEMPTS_HINT,
      });
    }

    const grant = await resolveJournalGrant(person.id);
    if (!grant.allowed) {
      return res.status(200).json({
        status: 'pending',
        reason: 'entitlement_not_visible',
        paymentStatus: session.payment_status,
        sessionStatus: session.status,
        returnTo: safeReturnTo,
        maxAttemptsHint: MAX_ATTEMPTS_HINT,
      });
    }

    const onboarding = deriveOnboardingState(
      (person.metadata as Record<string, unknown> | null) ?? null,
    );

    let nextPath = safeReturnTo;
    if (onboarding.mustEnterOnboarding) {
      const qs = new URLSearchParams({ returnTo: safeReturnTo });
      nextPath = `${APP_ROUTES.onboarding}?${qs.toString()}`;
    }

    return res.status(200).json({
      status: 'ready',
      grantSource: grant.grantSource,
      onboardingPhase: onboarding.phase,
      nextPath,
      returnTo: safeReturnTo,
    });
  } catch (err) {
    console.error('[API /checkout/reconcile] error:', err);
    return res.status(200).json({
      status: 'error',
      reason: 'reconcile_failed',
      returnTo: safeReturnTo,
    });
  }
}
