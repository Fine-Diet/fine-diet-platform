/**
 * Social auth provider availability flags.
 *
 * A provider must be set to `true` here only when it is fully configured in:
 *   1. The provider's developer console (authorized redirect URIs, credentials)
 *   2. The Supabase project dashboard (Authentication → Providers)
 *
 * These flags control UI visibility only — they hide or show buttons.
 * Backend enforcement is Supabase's responsibility: a provider disabled here
 * but still enabled in Supabase can still be triggered by direct URL manipulation.
 * Disable in both places for complete enforcement.
 *
 * ─── Current state ───────────────────────────────────────────────────────────
 * google : true   — configured and working
 * apple  : false  — not yet configured; re-enable when Apple Developer account,
 *                   Service ID, private key, and Supabase provider are all set up
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ─── Same-account continuity contract ───────────────────────────────────────
 * When an existing email/password user signs in with Google (same email):
 *
 *   • If Supabase "Link identity to existing account" is ENABLED (recommended):
 *     Supabase merges the Google identity into the existing auth.users record.
 *     Same auth UUID → link-person finds existing person by auth_user_id → ✅
 *
 *   • If that Supabase setting is DISABLED:
 *     Supabase will typically block or create a duplicate auth.users record.
 *     link-person will find the person by email but will NOT overwrite the
 *     existing auth_user_id — intentional safety guard, not a bug.
 *     Continuity breaks in this case. Fix: enable the Supabase setting.
 *
 * The link-person route is correct for all cases where Supabase identity
 * linking is enabled. No code change is needed on our side for that scenario.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const SOCIAL_PROVIDERS = {
  google: true,
  apple: false,
} as const;

/** True when at least one social provider is enabled. Used by LoginForm and SignupForm
 *  to conditionally render the divider and social buttons block. */
export const HAS_ACTIVE_SOCIAL_PROVIDERS = (
  Object.values(SOCIAL_PROVIDERS) as boolean[]
).some(Boolean);
