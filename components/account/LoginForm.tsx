'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@/lib/supabaseBrowser';
import { Button } from '@/components/ui/Button';
import { getSafeRedirectTarget } from '@/lib/redirectHelpers';
import { type AuthContext, getAuthCopy, clearPersistedAuthContext } from '@/lib/auth/authContext';
import { SocialLoginButtons } from './SocialLoginButtons';
import { HAS_ACTIVE_SOCIAL_PROVIDERS } from '@/lib/config/auth';
import { claimPendingAccessCodeOffer } from '@/lib/access/claimAccessCodeOffer';

interface LoginFormProps {
  onSwitchToSignup: () => void;
  onSuccess: () => void;
  onForgotPassword: (email: string) => void;
  /** After login, navigate here if valid relative path (e.g. from ?redirect=). */
  redirectTo?: string;
  /**
   * When true, hides the inline "Create account" switcher button.
   * Use in contexts where a tab or external link already handles that path
   * (e.g. AccountDrawer tab switcher, mobile utility link).
   */
  hideSwitchToSignup?: boolean;
  /** Full auth context — used for prefill and OAuth context preservation. */
  context?: AuthContext;
  /** Convenience prefill when no full context is supplied. */
  initialEmail?: string;
  /** Render a context-driven copy header above the form (dedicated pages). */
  showHeader?: boolean;
}

/**
 * LoginForm Component
 *
 * Handles user login with email and password plus Apple/Google OAuth.
 * After successful email login, calls /api/account/link-person to link auth user to people record.
 * OAuth flow is handled via the /auth/callback route.
 */
export const LoginForm = ({
  onSwitchToSignup,
  onSuccess,
  onForgotPassword,
  redirectTo,
  hideSwitchToSignup = false,
  context,
  initialEmail,
  showHeader = false,
}: LoginFormProps) => {
  const router = useRouter();
  const postAuthRedirect = context?.redirectTo || redirectTo || '';
  const copy = getAuthCopy({ source: context?.source ?? 'generic', intent: 'login' });
  const [email, setEmail] = useState(context?.email ?? initialEmail ?? '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleForgotPassword = () => {
    onForgotPassword(email);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!email || !password) {
        setError('Please enter both email and password.');
        setLoading(false);
        return;
      }

      const supabase = createClient();

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        let errorMessage = signInError.message || 'Invalid email or password.';

        if (
          signInError.message?.includes('Email not confirmed') ||
          signInError.message?.includes('email_not_confirmed')
        ) {
          errorMessage =
            'Please check your email and click the confirmation link before logging in.';
        } else if (
          signInError.message?.includes('Invalid login credentials') ||
          signInError.message?.includes('invalid_credentials')
        ) {
          errorMessage =
            'Invalid email or password. Please check your credentials and try again.';
        }

        setError(errorMessage);
        setLoading(false);
        return;
      }

      if (!data?.user) {
        setError('Login failed. Please try again.');
        setLoading(false);
        return;
      }

      if (data.user && !data.user.email_confirmed_at && !data.session) {
        setError(
          'Please check your email and click the confirmation link before logging in.'
        );
        setLoading(false);
        return;
      }

      if (!data?.session) {
        setError('Login failed. Please check your email confirmation or try again.');
        setLoading(false);
        return;
      }

      // Link auth user to people record
      try {
        const linkResponse = await fetch('/api/account/link-person', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            authUserId: data.user.id,
            email: data.user.email,
          }),
        });

        if (!linkResponse.ok) {
          console.warn('[LoginForm] link-person response not OK:', linkResponse.status);
        } else {
          const linkData = await linkResponse.json();
          if (linkData.profileCreated === false && linkData.profileError) {
            console.warn('[LoginForm] Profile creation failed:', linkData.profileError);
          }
        }
      } catch (linkError) {
        console.warn('[LoginForm] Error calling link-person:', linkError);
      }

      // Claim any guest assessment submissions (non-blocking)
      try {
        const claimToken = localStorage.getItem('fd_gc_claimToken:last');
        if (claimToken) {
          const claimResponse = await fetch('/api/assessments/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ claimToken }),
          });

          if (claimResponse.ok || claimResponse.status === 204) {
            localStorage.removeItem('fd_gc_claimToken:last');
            // Context has served its purpose — drop the persisted fallback so it
            // can't create a stale redirect/prefill on a later visit.
            clearPersistedAuthContext();
          } else {
            console.warn('[LoginForm] Failed to claim assessment submission:', claimResponse.status);
          }
        }
      } catch (claimError) {
        console.warn('[LoginForm] Error claiming assessment submission:', claimError);
      }

      // Claim any pending access-code offer grant now that a known person
      // exists. Returns a safe status so the form does NOT silently fail open
      // into a protected/unlocked path when the claim is terminal-but-failed.
      let accessCodeClaimStatus:
        | 'no_claim'
        | 'granted'
        | 'nothing_to_grant'
        | 'expired'
        | 'email_mismatch'
        | 'claim_not_found'
        | 'person_not_ready'
        | 'retryable_error'
        | 'failed' = 'no_claim';
      try {
        const claimResult = await claimPendingAccessCodeOffer();
        accessCodeClaimStatus = claimResult.status;
      } catch (claimError) {
        console.warn('[LoginForm] Error claiming access-code offer:', claimError);
        accessCodeClaimStatus = 'retryable_error';
      }

      const accessCodeClaimTerminal =
        accessCodeClaimStatus === 'expired' ||
        accessCodeClaimStatus === 'email_mismatch' ||
        accessCodeClaimStatus === 'claim_not_found' ||
        accessCodeClaimStatus === 'failed';

      if (accessCodeClaimTerminal) {
        const claimErrorCopy =
          accessCodeClaimStatus === 'expired'
            ? 'That access link expired. Please re-enter your access code.'
            : accessCodeClaimStatus === 'email_mismatch'
              ? 'That access code was started with a different email. Please re-enter the code using this account’s email.'
              : 'We could not finish unlocking this offer. Please re-enter your access code or contact support.';
        setError(claimErrorCopy);
        setLoading(false);
        // Do not redirect into the protected/unlocked target on a failed
        // claim. Leave the user logged in but in place.
        onSuccess();
        return;
      }

      // Auth is complete — clear any persisted fallback context so it can't
      // resurface as a stale redirect/prefill on a future visit.
      clearPersistedAuthContext();

      // Login keeps the user in place when there's no redirect (e.g. drawer
      // login mid-browse); only navigate when a safe target is present.
      // granted / nothing_to_grant / no_claim / person_not_ready /
      // retryable_error all continue the normal redirect. person_not_ready and
      // retryable_error keep the token in localStorage for a later retry.
      const target = getSafeRedirectTarget(postAuthRedirect, '');
      if (target) {
        try {
          await router.push(target);
        } catch (pushErr) {
          console.warn('[LoginForm] Redirect push failed:', pushErr);
        }
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {showHeader && (
        <div>
          <h3 className="text-lg font-semibold antialiased mb-1">{copy.title}</h3>
          <p className="text-sm text-white/70 antialiased">{copy.subtitle}</p>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email */}
        <div>
          <input
            type="email"
            id="login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
            className="autofill-dark w-full px-4 py-3 bg-neutral-800/50 text-sm rounded-full text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-denim-500 transition-all antialiased disabled:opacity-50"
            placeholder="your.email@example.com"
          />
        </div>

        {/* Password */}
        <div>
          <input
            type="password"
            id="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
            className="autofill-dark w-full px-4 py-3 bg-neutral-800/50 text-sm rounded-full text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-denim-500 transition-all antialiased disabled:opacity-50"
            placeholder="password*"
          />
        </div>

        {/* Forgot password */}
        <div className="flex items-center justify-end text-sm">
          <button
            type="button"
            onClick={handleForgotPassword}
            className="text-white/70 hover:text-white/90 transition-colors antialiased"
          >
            Forgot password
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-semantic-error/20 border border-semantic-error/50 rounded-xl p-3">
            <p className="text-sm text-white antialiased">{error}</p>
          </div>
        )}

        {/* Submit */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={loading}
          className="w-full"
        >
          {loading ? 'Logging in...' : 'Log In'}
        </Button>
      </form>

      {/* Divider + social login — hidden when no providers are enabled */}
      {HAS_ACTIVE_SOCIAL_PROVIDERS && (
        <>
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 text-white/50 antialiased" style={{ background: 'transparent' }}>
                Or
              </span>
            </div>
          </div>

          <SocialLoginButtons redirectTo={postAuthRedirect || undefined} context={context} />
        </>
      )}

      {/* Switch to signup — hidden when parent provides a tab or separate link */}
      {!hideSwitchToSignup && (
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={onSwitchToSignup}
            className="text-sm text-white/60 hover:text-white/90 transition-colors antialiased"
          >
            Don't have an account? <span className="underline">Create account</span>
          </button>
        </div>
      )}
    </div>
  );
};
