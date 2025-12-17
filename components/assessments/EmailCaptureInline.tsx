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
  onSubmit?: (email: string) => Promise<void>;
}

export function EmailCaptureInline({
  assessmentType,
  assessmentVersion,
  sessionId,
  primaryAvatar,
  onSubmit,
}: EmailCaptureInlineProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Track event
      trackEmailCaptured(assessmentType as any, assessmentVersion, sessionId, primaryAvatar, email);

      // Call optional onSubmit callback (e.g., to update submission with email)
      if (onSubmit) {
        await onSubmit(email);
      }

      setIsSubmitted(true);
    } catch (error) {
      console.error('Email capture error:', error);
      // Don't block UI - just log
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
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          required
          className="flex-1 px-4 py-2 rounded-full border border-neutral-300 bg-transparent text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-dark_accent-500 antialiased"
        />
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Sending...' : 'Get Updates'}
        </Button>
      </div>
    </form>
  );
}

