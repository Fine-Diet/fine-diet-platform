'use client';

import { useState, FormEvent } from 'react';
import { resetPasswordForEmail } from '@/lib/authHelpers';
import { Button } from '@/components/ui/Button';

interface ResetPasswordFormProps {
  initialEmail?: string;
  onBack: () => void;
}

/**
 * ResetPasswordForm Component
 * 
 * Form for requesting a password reset email.
 * Shows in the Account drawer when user clicks "Forgot password?"
 */
export const ResetPasswordForm = ({ initialEmail = '', onBack }: ResetPasswordFormProps) => {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      // Validate email
      if (!email || !email.trim()) {
        setError('Please enter your email address.');
        setLoading(false);
        return;
      }

      // Basic email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setError('Please enter a valid email address.');
        setLoading(false);
        return;
      }

      // Request password reset
      const { error: resetError } = await resetPasswordForEmail(email);

      if (resetError) {
        // Show friendly error message without leaking raw error details
        let errorMessage = 'Failed to send reset email. Please try again.';
        
        if (resetError.message?.includes('rate limit') || resetError.message?.includes('too many')) {
          errorMessage = 'Too many requests. Please wait a few minutes and try again.';
        } else if (resetError.message?.includes('invalid')) {
          errorMessage = 'Please enter a valid email address.';
        }
        
        setError(errorMessage);
        setLoading(false);
        return;
      }

      // Success - show message
      setSuccess(true);
      setLoading(false);
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold antialiased mb-1">Check your email</h3>
          <p className="text-sm text-white/70 antialiased">
            If an account exists for this email, we've sent a reset link.
          </p>
        </div>

        <div className="bg-semantic-success/20 border border-semantic-success/50 rounded-xl p-4">
          <p className="text-sm text-white antialiased">
            If an account exists for <strong>{email}</strong>, we've sent a password reset link to your email.
          </p>
          <p className="text-sm text-white/70 antialiased mt-2">
            Please check your inbox and click the link to reset your password.
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={onBack}
          className="w-full"
        >
          Back to login
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold antialiased mb-1">Reset password</h3>
        <p className="text-sm text-white/70 antialiased">
          Enter your email address and we'll send you a link to reset your password.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email Field */}
        <div>
          <label htmlFor="reset-email" className="block text-sm font-semibold text-white mb-2 antialiased">
            Email
          </label>
          <input
            type="email"
            id="reset-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
            className="w-full px-4 py-3 bg-neutral-800/50 border border-neutral-700 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-dark_accent-500 focus:border-transparent transition-all antialiased disabled:opacity-50"
            placeholder="your.email@example.com"
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
          {loading ? 'Sending...' : 'Send reset link'}
        </Button>
      </form>

      {/* Back to Login */}
      <Button
        type="button"
        variant="secondary"
        size="lg"
        onClick={onBack}
        className="w-full"
      >
        Back to login
      </Button>
    </div>
  );
};

