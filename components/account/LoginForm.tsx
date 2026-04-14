'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@/lib/supabaseBrowser';
import { Button } from '@/components/ui/Button';
import { getSafeRedirectTarget } from '@/lib/redirectHelpers';
import { SocialLoginButtons } from './SocialLoginButtons';
import { HAS_ACTIVE_SOCIAL_PROVIDERS } from '@/lib/config/auth';

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
}: LoginFormProps) => {
  const router = useRouter();
  const [email, setEmail] = useState('');
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
          } else {
            console.warn('[LoginForm] Failed to claim assessment submission:', claimResponse.status);
          }
        }
      } catch (claimError) {
        console.warn('[LoginForm] Error claiming assessment submission:', claimError);
      }

      const target = getSafeRedirectTarget(redirectTo, '');
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

          <SocialLoginButtons redirectTo={redirectTo} />
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
