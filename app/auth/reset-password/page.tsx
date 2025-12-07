'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, updateUserPassword } from '@/lib/authHelpers';
import { Button } from '@/components/ui/Button';
import type { User } from '@supabase/supabase-js';

/**
 * Reset Password Page
 * 
 * This page is accessed via the password reset link sent to the user's email.
 * It verifies the user has a valid recovery session, then allows them to set a new password.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Check for valid recovery session on mount
  useEffect(() => {
    const checkRecoverySession = async () => {
      try {
        const { user: currentUser, error: userError } = await getUser();
        
        if (userError || !currentUser) {
          setError('This link is invalid or has expired. Please request a new password reset.');
          setLoading(false);
          return;
        }

        // Check if user has a recovery session (indicated by access_token in session)
        // If getUser() succeeds, they have a valid session
        setUser(currentUser);
        setLoading(false);
      } catch (err) {
        setError('This link is invalid or has expired. Please request a new password reset.');
        setLoading(false);
      }
    };

    checkRecoverySession();
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // Validate passwords
      if (!newPassword || newPassword.length < 8) {
        setError('Password must be at least 8 characters long.');
        setSubmitting(false);
        return;
      }

      if (newPassword !== confirmPassword) {
        setError('Passwords do not match.');
        setSubmitting(false);
        return;
      }

      // Update password
      const { error: updateError } = await updateUserPassword(newPassword);

      if (updateError) {
        let errorMessage = 'Failed to update password. Please try again.';
        
        if (updateError.message?.includes('same')) {
          errorMessage = 'New password must be different from your current password.';
        } else if (updateError.message?.includes('weak') || updateError.message?.includes('strength')) {
          errorMessage = 'Password is too weak. Please choose a stronger password.';
        }
        
        setError(errorMessage);
        setSubmitting(false);
        return;
      }

      // Success
      setSuccess(true);
      setSubmitting(false);

      // Auto-redirect to home after 3 seconds
      setTimeout(() => {
        router.push('/');
      }, 3000);
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-900 flex items-center justify-center p-6">
        <div className="text-white antialiased">Loading...</div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="min-h-screen bg-brand-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-neutral-900/95 backdrop-blur-lg rounded-2xl p-8 text-white">
          <h1 className="text-2xl font-semibold antialiased mb-4">Invalid Link</h1>
          <p className="text-white/70 antialiased mb-6">{error}</p>
          <Button
            variant="primary"
            size="lg"
            onClick={() => router.push('/')}
            className="w-full"
          >
            Go to Home
          </Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-brand-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-neutral-900/95 backdrop-blur-lg rounded-2xl p-8 text-white">
          <h1 className="text-2xl font-semibold antialiased mb-4">Password Updated</h1>
          <div className="bg-semantic-success/20 border border-semantic-success/50 rounded-xl p-4 mb-6">
            <p className="text-sm text-white antialiased">
              Your password has been updated successfully.
            </p>
          </div>
          <p className="text-white/70 antialiased mb-6 text-sm">
            Redirecting to home page... You can now log in with your new password.
          </p>
          <Button
            variant="primary"
            size="lg"
            onClick={() => router.push('/')}
            className="w-full"
          >
            Go to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-neutral-900/95 backdrop-blur-lg rounded-2xl p-8 text-white">
        <h1 className="text-2xl font-semibold antialiased mb-2">Reset Password</h1>
        <p className="text-sm text-white/70 antialiased mb-6">
          Enter your new password below.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* New Password Field */}
          <div>
            <label htmlFor="new-password" className="block text-sm font-semibold text-white mb-2 antialiased">
              New Password
            </label>
            <input
              type="password"
              id="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={submitting}
              required
              minLength={8}
              className="w-full px-4 py-3 bg-neutral-800/50 border border-neutral-700 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-dark_accent-500 focus:border-transparent transition-all antialiased disabled:opacity-50"
              placeholder="At least 8 characters"
            />
          </div>

          {/* Confirm Password Field */}
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-semibold text-white mb-2 antialiased">
              Confirm Password
            </label>
            <input
              type="password"
              id="confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting}
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
            disabled={submitting}
            className="w-full"
          >
            {submitting ? 'Updating...' : 'Update Password'}
          </Button>
        </form>
      </div>
    </div>
  );
}

