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
  levelId: string;
  resultsVersion: string;
  submissionId?: string;
  emailType?: string; // Optional: 'results' or 'method_link' for n8n routing
  onSubmit?: (email: string) => Promise<void>;
}

export function EmailCaptureInline({
  assessmentType,
  assessmentVersion,
  sessionId,
  levelId,
  resultsVersion,
  submissionId,
  emailType,
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
          levelId,
          resultsVersion,
          submissionId,
          emailType: emailType || 'default',
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to capture email');
      }

      // Track analytics event (non-blocking)
      trackEmailCaptured(assessmentType as any, assessmentVersion, sessionId, levelId, email);

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
          Check your email to review.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-0">
      <div className="flex flex-col sm:flex-row gap-3 mx-auto">
        <div className="flex-1 relative">
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null); // Clear error when user types
            }}
            placeholder="Email Your Results"
            required
            disabled={isSubmitting}
            className="w-full px-8 py-4 rounded-full border-0 bg-neutral-100 text-[#0A0800] placeholder-[#0A0800] text-base font-semibold focus:outline-none focus:ring-2 focus:ring-dark_accent-500 antialiased disabled:opacity-50 pr-12"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 pr-5 disabled:opacity-50"
          >
            <svg
              className="w-5 h-5 text-brand-900"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.75 15.75 3 12m0 0 3.75-3.75M3 12h18"
              />
            </svg>
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-2 text-center">
          <p className="text-sm text-red-400 antialiased">{error}</p>
        </div>
      )}
    </form>
  );
}

