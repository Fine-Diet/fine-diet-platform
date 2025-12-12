'use client';

import { useState, FormEvent } from 'react';
import { signUp } from '@/lib/authHelpers';
import { Button } from '@/components/ui/Button';

interface SignupFormProps {
  onSwitchToLogin: () => void;
  onSuccess: () => void;
}

/**
 * SignupForm Component
 * 
 * Handles new user registration with email and password.
 * After successful signup, calls /api/account/link-person to create/link people record.
 */
export const SignupForm = ({ onSwitchToLogin, onSuccess }: SignupFormProps) => {
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
        // Success - auth state change will update the drawer
        setTimeout(() => {
          onSuccess();
        }, 1000);
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
            className="w-full px-4 py-3 bg-neutral-800/50 border border-neutral-700 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-dark_accent-500 focus:border-transparent transition-all antialiased disabled:opacity-50"
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
            className="w-full px-4 py-3 bg-neutral-800/50 border border-neutral-700 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-dark_accent-500 focus:border-transparent transition-all antialiased disabled:opacity-50"
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
            className="w-full px-4 py-3 bg-neutral-800/50 border border-neutral-700 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-dark_accent-500 focus:border-transparent transition-all antialiased disabled:opacity-50"
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

      {/* Divider */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-neutral-700/50"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-neutral-900/95 text-white/60 antialiased">
            Already have an account?
          </span>
        </div>
      </div>

      {/* Switch to Login */}
      <Button
        type="button"
        variant="secondary"
        size="lg"
        onClick={onSwitchToLogin}
        className="w-full"
      >
        Log in
      </Button>
    </div>
  );
};

