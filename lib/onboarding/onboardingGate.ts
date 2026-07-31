/**
 * Onboarding first-run gate — pure routing helpers
 *
 * Keeps the middleware thin: the middleware only decides can-enter / must-
 * onboard / must-login / must-waitlist. All the "which paths are exempt",
 * "is this returnTo safe", and "where does the user go after onboarding"
 * logic lives here so it is unit-testable without spinning up Next.js
 * middleware.
 *
 * Package 2 durable state (people.metadata):
 *   - onboarding_completed_at — required setup finished
 *   - onboarding_skipped_at — explicit skip; app entry allowed; resumable
 * Completion and skip are distinct. Profile must not write completion.
 */

import { isSafeRedirectTarget } from '@/lib/redirectHelpers';
import {
  APP_ROUTES,
  isCanonicalAppRoute,
  isLegacyJournalRoute,
} from '@/lib/routes/appRoutes';
import {
  deriveOnboardingState,
  type OnboardingLifecycleState,
} from '@/lib/onboarding/onboardingState';

export const ONBOARDING_PATH = APP_ROUTES.onboarding; // '/app/onboarding'
export const LEGACY_ONBOARDING_PATH = '/journal/onboarding';

/**
 * App/legacy-journal paths that an entitled-but-not-yet-onboarded user may
 * still reach without being bounced to onboarding:
 *   - the onboarding routes themselves (otherwise an infinite redirect loop)
 *   - profile + settings so users can manage their account mid-onboarding
 *
 * Routes outside the signed-in app surface (/login, /create-account,
 * /journal-waitlist, /admin/*, API, static files) are never seen by the gate
 * because the middleware only runs the gate inside the signed-in app block.
 */
const GATE_EXEMPT_PATHS = new Set<string>([
  ONBOARDING_PATH,
  LEGACY_ONBOARDING_PATH,
  `${APP_ROUTES.profile}`, // /app/profile
  `${APP_ROUTES.settings}`, // /app/settings
  '/journal/profile',
  '/journal/settings',
]);

/** True when `pathname` may be reached mid-onboarding without a redirect. */
export function isOnboardingGateExempt(pathname: string): boolean {
  const p = pathname.split('?')[0];
  return GATE_EXEMPT_PATHS.has(p);
}

/**
 * Validate and normalize a `returnTo` candidate (an original path+query the
 * user was trying to reach). Returns the safe string, or null when the value
 * is missing, unsafe, points off-app, or would cause a loop.
 *
 * Safety rules:
 *   - Must be a relative path (rejects http(s)://, protocol-relative //).
 *   - Must be a canonical /app route or a legacy /journal route.
 *   - Must NOT be an onboarding route (loop avoidance).
 */
export function getSafeOnboardingReturnTo(raw: string | null | undefined): string | null {
  if (!isSafeRedirectTarget(raw)) return null;
  const trimmed = raw.trim();
  const path = trimmed.split('?')[0];
  if (path === ONBOARDING_PATH || path === LEGACY_ONBOARDING_PATH) return null;
  if (!(isCanonicalAppRoute(path) || isLegacyJournalRoute(path))) return null;
  return trimmed;
}

/**
 * Build the middleware redirect destination for an entitled-but-incomplete
 * user trying to reach `pathname` + `search`. Returns `/app/onboarding` plus
 * a `?returnTo=` query only when the original destination is safe and worth
 * preserving.
 */
export function buildOnboardingRedirectDestination(pathname: string, search: string): string {
  const candidate = search ? `${pathname}${search}` : pathname;
  const returnTo = getSafeOnboardingReturnTo(candidate);
  if (!returnTo) return ONBOARDING_PATH;
  const qs = new URLSearchParams({ returnTo });
  return `${ONBOARDING_PATH}?${qs.toString()}`;
}

/**
 * Where the live onboarding route should send the user after a successful
 * finish. Honors a safe `returnTo`; otherwise falls back to the existing
 * `/app?onboarded=1` celebration URL.
 */
export function resolveOnboardingFinishDestination(
  rawReturnTo: string | null | undefined,
): string {
  const safe = getSafeOnboardingReturnTo(rawReturnTo);
  return safe ?? `${APP_ROUTES.home}?onboarded=1`;
}

/**
 * Where to send a user who already has `onboarding_completed_at` but is
 * visiting `/app/onboarding`. Honors a safe `returnTo` when appropriate;
 * otherwise sends them to `/app`. Never returns an onboarding route, so this
 * cannot cause a redirect loop.
 */
export function resolveCompletedUserDestination(
  rawReturnTo: string | null | undefined,
): string {
  const safe = getSafeOnboardingReturnTo(rawReturnTo);
  return safe ?? APP_ROUTES.home;
}

/** True when required onboarding was completed (not merely skipped). */
export function isOnboardingComplete(metadata: Record<string, unknown> | null | undefined): boolean {
  return deriveOnboardingState(metadata).phase === 'completed';
}

/** True when the user may enter normal app routes (completed OR skipped). */
export function mayEnterAppWithoutOnboarding(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return deriveOnboardingState(metadata).mayEnterApp;
}

/** True when middleware must redirect into onboarding. */
export function mustEnterOnboarding(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return deriveOnboardingState(metadata).mustEnterOnboarding;
}

export function getOnboardingLifecycle(
  metadata: Record<string, unknown> | null | undefined,
): OnboardingLifecycleState {
  return deriveOnboardingState(metadata);
}

/**
 * Where to send a skipped (not completed) user who revisits onboarding.
 * Honors safe returnTo; otherwise /app. Never loops to onboarding.
 */
export function resolveSkippedUserDestination(
  rawReturnTo: string | null | undefined,
): string {
  const safe = getSafeOnboardingReturnTo(rawReturnTo);
  return safe ?? APP_ROUTES.home;
}

const LEGACY_JOURNAL_HOME = '/journal/home';

/**
 * Discoverable resume link for skipped / in-progress users.
 * Always includes `resume=1` so skipped users are not bounced away.
 * Optionally preserves a safe first-party return destination.
 */
export function buildOnboardingResumeHref(
  rawReturnTo?: string | null,
): string {
  const params = new URLSearchParams({ resume: '1' });
  const safe = getSafeOnboardingReturnTo(rawReturnTo);
  if (safe) params.set('returnTo', safe);
  return `${ONBOARDING_PATH}?${params.toString()}`;
}

/** Canonical + legacy home paths where the shell Finish Setup notice may render. */
export function isAppHomePathForFinishSetup(pathname: string): boolean {
  const path = pathname.split('?')[0].split('#')[0];
  return (
    path === APP_ROUTES.home ||
    path === '/journal' ||
    path === LEGACY_JOURNAL_HOME
  );
}
