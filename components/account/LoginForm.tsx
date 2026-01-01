'use client';

import { useState, FormEvent } from 'react';
import { createClient } from '@/lib/supabaseBrowser';
import { Button } from '@/components/ui/Button';

interface LoginFormProps {
  onSwitchToSignup: () => void;
  onSuccess: () => void;
  onForgotPassword: (email: string) => void;
}

/**
 * LoginForm Component
 * 
 * Handles user login with email and password.
 * After successful login, calls /api/account/link-person to link auth user to people record.
 */
export const LoginForm = ({ onSwitchToSignup, onSuccess, onForgotPassword }: LoginFormProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleForgotPassword = () => {
    // Pass the current email to the forgot password form
    onForgotPassword(email);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validate inputs
      if (!email || !password) {
        setError('Please enter both email and password.');
        setLoading(false);
        return;
      }

      // Create Supabase client with cookie support
      const supabase = createClient();

      // Sign in with Supabase Auth (uses cookie-based session)
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        // Provide more helpful error messages
        let errorMessage = signInError.message || 'Invalid email or password.';
        
        // Check for specific error types
        if (signInError.message?.includes('Email not confirmed') || 
            signInError.message?.includes('email_not_confirmed')) {
          errorMessage = 'Please check your email and click the confirmation link before logging in.';
        } else if (signInError.message?.includes('Invalid login credentials') ||
                   signInError.message?.includes('invalid_credentials')) {
          errorMessage = 'Invalid email or password. Please check your credentials and try again.';
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

      // Check if email is confirmed
      if (data.user && !data.user.email_confirmed_at && !data.session) {
        setError('Please check your email and click the confirmation link before logging in.');
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
          headers: {
            'Content-Type': 'application/json',
          },
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
            console.warn(
              '[LoginForm] Profile creation failed:',
              linkData.profileError,
              'User ID:',
              data.user.id
            );
          } else if (linkData.profileCreated === true) {
            console.log('[LoginForm] Profile created successfully for user:', data.user.id);
          } else if (linkData.profileExisted === true) {
            console.log('[LoginForm] Profile already existed for user:', data.user.id);
          }
        }
      } catch (linkError) {
        console.warn('[LoginForm] Error calling link-person:', linkError);
        // Don't fail login if linking fails - user is still authenticated
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
            console.log('[LoginForm] Successfully claimed assessment submission');
          } else {
            console.warn('[LoginForm] Failed to claim assessment submission:', claimResponse.status);
          }
        }
      } catch (claimError) {
        console.warn('[LoginForm] Error claiming assessment submission:', claimError);
        // Don't block login if claim fails
      }

      // Success - wait a moment for auth state to propagate, then close drawer
      // The AccountDrawer will detect the session change and show AccountView
      setTimeout(() => {
        onSuccess();
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div>
        
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email Field */}
        <div>
          <label htmlFor="login-email" className="block text-base font-semibold text-white mb-2 antialiased">
            Login
          </label>
          <input
            type="email"
            id="login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
            className="w-full px-4 py-3 bg-neutral-800/50 border border-neutral-700 text-sm rounded-full text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-dark_accent-500 focus:border-transparent transition-all antialiased disabled:opacity-50"
            placeholder="your.email@example.com"
          />
        </div>

        {/* Password Field */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="login-password" className="block text-sm font-semibold text-white antialiased">
              Password
            </label>
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-sm text-white/70 hover:text-white/90 transition-colors antialiased"
            >
              Forgot password?
            </button>
          </div>
          <input
            type="password"
            id="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
            className="w-full px-4 py-3 bg-neutral-800/50 border text-sm border-neutral-700 rounded-full text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-dark_accent-500 focus:border-transparent transition-all antialiased disabled:opacity-50"
            placeholder="Enter your password"
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
          {loading ? 'Logging in...' : 'Log in'}
        </Button>
      </form>

      {/* Divider */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full mt-0 border-t border-neutral-700/50"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 mt-[50px] text-white/60 antialiased">
            Don't have an account?
          </span>
        </div>
      </div>

      {/* Switch to Signup */}
      <Button
        type="button"
        variant="quaternary"
        size="lg"
        onClick={onSwitchToSignup}
        className="w-full"
      >
        Create account
      </Button>
    </div>
  );
};

