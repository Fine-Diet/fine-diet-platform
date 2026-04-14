'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import { signUp } from '@/lib/authHelpers';
import { Button } from '@/components/ui/Button';
import { getSafeRedirectTarget } from '@/lib/redirectHelpers';
import { SocialLoginButtons } from './SocialLoginButtons';
import { HAS_ACTIVE_SOCIAL_PROVIDERS } from '@/lib/config/auth';

export interface SignupFormProps {
  onSwitchToLogin: () => void;
  onSuccess: () => void;
  /** After signup (when session exists), navigate here if valid relative path (e.g. from ?redirect=). */
  redirectTo?: string;
  /**
   * When true, hides the inline "Log in" switcher button.
   * Use in contexts where a tab or external link already handles the switch.
   */
  hideSwitchToLogin?: boolean;
}

/**
 * SignupForm Component
 * 
 * Handles new user registration with email and password.
 * After successful signup, calls /api/account/link-person to create/link people record.
 */
export const SignupForm = ({ onSwitchToLogin, onSuccess, redirectTo, hideSwitchToLogin = false }: SignupFormProps) => {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validate inputs
      if (!email || !password || !confirmPassword) {
        setError('Please fill in all fields.');
        setLoading(false);
        return;
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        setLoading(false);
        return;
      }

      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        setLoading(false);
        return;
      }

      // Sign up with Supabase Auth
      const { data, error: signUpError } = await signUp(email, password);

      if (signUpError) {
        setError(signUpError.message || 'Failed to create account. Please try again.');
        setLoading(false);
        return;
      }

      if (!data?.user) {
        setError('Account creation failed. Please try again.');
        setLoading(false);
        return;
      }

      // Link auth user to people record
      try {
        const linkResponse = await fetch('/api/account/link-person', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            authUserId: data.user.id,
            email: data.user.email || email,
          }),
        });

        if (!linkResponse.ok) {
          console.warn('[SignupForm] link-person response not OK:', linkResponse.status);
        } else {
          const linkData = await linkResponse.json();
          if (linkData.profileCreated === false && linkData.profileError) {
            console.warn(
              '[SignupForm] Profile creation failed:',
              linkData.profileError,
              'User ID:',
              data.user.id
            );
          } else if (linkData.profileCreated === true) {
            console.log('[SignupForm] Profile created successfully for user:', data.user.id);
          } else if (linkData.profileExisted === true) {
            console.log('[SignupForm] Profile already existed for user:', data.user.id);
          }
        }
      } catch (linkError) {
        console.warn('[SignupForm] Error calling link-person:', linkError);
        // Don't fail signup if linking fails - user is still authenticated
      }

      // Claim any guest assessment submissions (non-blocking)
      try {
        const claimToken = localStorage.getItem('fd_gc_claimToken:last');
        if (claimToken) {
          const claimResponse = await fetch('/api/assessments/claim', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ claimToken }),
          });

          if (claimResponse.ok || claimResponse.status === 204) {
            // Successfully claimed (or already claimed/no-op) - remove token
            localStorage.removeItem('fd_gc_claimToken:last');
            console.log('[SignupForm] Successfully claimed assessment submission');
          } else {
            console.warn('[SignupForm] Failed to claim assessment submission:', claimResponse.status);
          }
        }
      } catch (claimError) {
        console.warn('[SignupForm] Error claiming assessment submission:', claimError);
        // Don't block signup if claim fails
      }

      // Show success message
      setSuccess(true);
      
      // Note: Supabase may require email confirmation
      // If email confirmation is enabled, user will need to check their email
      if (data.user && !data.session) {
        // Email confirmation required - show message but keep success state
        // User will need to confirm email before they can log in
        setTimeout(() => {
          setSuccess(false);
          setError('Please check your email and click the confirmation link. Then you can log in.');
          setLoading(false);
        }, 2000);
        return;
      }

      // If session exists, user is automatically signed in
      if (data.session) {
        // Redirect to ?redirect= target if valid, then close
        const target = getSafeRedirectTarget(redirectTo, '');
        if (target) {
          try {
            await router.push(target);
          } catch (pushErr) {
            console.warn('[SignupForm] Redirect push failed:', pushErr);
          }
        }
        onSuccess();
      } else {
        // No session but no error - likely email confirmation required
        setTimeout(() => {
          setSuccess(false);
          setError('Please check your email and click the confirmation link. Then you can log in.');
          setLoading(false);
        }, 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center py-8">
        <div className="mb-4">
          <svg
            className="w-16 h-16 mx-auto text-semantic-success"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <p className="text-lg font-semibold text-white mb-2 antialiased">
          Account created!
        </p>
        <p className="text-base text-white/90 font-light antialiased">
          Welcome to Fine Diet. Redirecting...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold antialiased mb-1">Create account</h3>
        <p className="text-sm text-white/70 antialiased">
          Sign up to access your programs, assessments, and personalized care.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email Field */}
        <div>
          <label htmlFor="signup-email" className="block text-sm font-semibold text-white mb-2 antialiased">
            Email
          </label>
          <input
            type="email"
            id="signup-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
            className="autofill-dark w-full px-4 py-3 bg-neutral-800/50 text-sm rounded-full text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-denim-500 transition-all antialiased disabled:opacity-50"
            placeholder="your.email@example.com"
          />
        </div>

        {/* Password Field */}
        <div>
          <label htmlFor="signup-password" className="block text-sm font-semibold text-white mb-2 antialiased">
            Password
          </label>
          <input
            type="password"
            id="signup-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
            minLength={8}
            className="autofill-dark w-full px-4 py-3 bg-neutral-800/50 text-sm rounded-full text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-denim-500 transition-all antialiased disabled:opacity-50"
            placeholder="At least 8 characters"
          />
        </div>

        {/* Confirm Password Field */}
        <div>
          <label htmlFor="signup-confirm-password" className="block text-sm font-semibold text-white mb-2 antialiased">
            Confirm Password
          </label>
          <input
            type="password"
            id="signup-confirm-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
            required
            minLength={8}
            className="autofill-dark w-full px-4 py-3 bg-neutral-800/50 text-sm rounded-full text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-denim-500 transition-all antialiased disabled:opacity-50"
            placeholder="Confirm your password"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-semantic-error/20 border border-semantic-error/50 rounded-xl p-4">
            <p className="text-sm text-white antialiased">{error}</p>
          </div>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={loading}
          className="w-full"
        >
          {loading ? 'Creating account...' : 'Create account'}
        </Button>
      </form>

      {/* Divider + social account creation — hidden when no providers are enabled */}
      {HAS_ACTIVE_SOCIAL_PROVIDERS && (
        <>
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 text-white/50 antialiased" style={{ background: 'transparent' }}>
                Or continue with
              </span>
            </div>
          </div>

          <SocialLoginButtons redirectTo={redirectTo} />
        </>
      )}

      {/* Switch to Login — hidden when parent provides a tab or separate link */}
      {!hideSwitchToLogin && (
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-sm text-white/60 hover:text-white/90 transition-colors antialiased"
          >
            Already have an account? <span className="underline">Log in</span>
          </button>
        </div>
      )}
    </div>
  );
};

