/**
 * Email Capture Inline Component
 * Captures email for follow-up
 */

import React, { useState } from 'react';
import { trackEmailCaptured } from '@/lib/assessmentAnalytics';
import { Button } from '@/components/ui/Button';

interface EmailCaptureInlineProps {
  assessmentType: string;
  assessmentVersion: number;
  sessionId: string;
  primaryAvatar: string;
  submissionId?: string;
  onSubmit?: (email: string) => Promise<void>;
}

export function EmailCaptureInline({
  assessmentType,
  assessmentVersion,
  sessionId,
  primaryAvatar,
  submissionId,
  onSubmit,
}: EmailCaptureInlineProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Call email capture API endpoint
      const response = await fetch('/api/assessments/email-capture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          assessmentType,
          assessmentVersion,
          email,
          primaryAvatar,
          submissionId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to capture email');
      }

      // Track analytics event (non-blocking)
      trackEmailCaptured(assessmentType as any, assessmentVersion, sessionId, primaryAvatar, email);

      // Call optional onSubmit callback
      if (onSubmit) {
        await onSubmit(email);
      }

      setIsSubmitted(true);
    } catch (err) {
      console.error('Email capture error:', err);
      setError(err instanceof Error ? err.message : 'Failed to capture email. Please try again.');
      // Don't block UI - allow retry
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="text-center py-4">
        <p className="text-dark_accent-500 text-lg font-semibold antialiased">
          Thank you! Check your email for next steps.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-8">
      <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null); // Clear error when user types
          }}
          placeholder="Enter your email"
          required
          disabled={isSubmitting}
          className="flex-1 px-4 py-2 rounded-full border border-neutral-300 bg-transparent text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-dark_accent-500 antialiased disabled:opacity-50"
        />
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Sending...' : 'Get Updates'}
        </Button>
      </div>
      {error && (
        <div className="mt-2 text-center">
          <p className="text-sm text-red-400 antialiased">{error}</p>
        </div>
      )}
    </form>
  );
}

