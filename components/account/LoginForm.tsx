'use client';

import { useState, FormEvent } from 'react';
import { signIn } from '@/lib/authHelpers';
import { Button } from '@/components/ui/Button';

interface LoginFormProps {
  onSwitchToSignup: () => void;
  onSuccess: () => void;
}

/**
 * LoginForm Component
 * 
 * Handles user login with email and password.
 * After successful login, calls /api/account/link-person to link auth user to people record.
 */
export const LoginForm = ({ onSwitchToSignup, onSuccess }: LoginFormProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      // Sign in with Supabase Auth
      const { data, error: signInError } = await signIn(email, password);

      if (signInError) {
        setError(signInError.message || 'Invalid email or password.');
        setLoading(false);
        return;
      }

      if (!data?.user || !data?.session) {
        setError('Login failed. Please try again.');
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
          console.warn('Failed to link person, but login succeeded');
        }
      } catch (linkError) {
        console.warn('Error linking person:', linkError);
        // Don't fail login if linking fails - user is still authenticated
      }

      // Success - auth state change will update the drawer
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold antialiased mb-1">Log in</h3>
        <p className="text-sm text-white/70 antialiased">
          Access your account to manage your programs, assessments, and more.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email Field */}
        <div>
          <label htmlFor="login-email" className="block text-sm font-semibold text-white mb-2 antialiased">
            Email
          </label>
          <input
            type="email"
            id="login-email"
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
          <label htmlFor="login-password" className="block text-sm font-semibold text-white mb-2 antialiased">
            Password
          </label>
          <input
            type="password"
            id="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
            className="w-full px-4 py-3 bg-neutral-800/50 border border-neutral-700 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-dark_accent-500 focus:border-transparent transition-all antialiased disabled:opacity-50"
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
          <div className="w-full border-t border-neutral-700/50"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-neutral-900/95 text-white/60 antialiased">
            Don't have an account?
          </span>
        </div>
      </div>

      {/* Switch to Signup */}
      <Button
        type="button"
        variant="secondary"
        size="lg"
        onClick={onSwitchToSignup}
        className="w-full"
      >
        Create account
      </Button>
    </div>
  );
};

