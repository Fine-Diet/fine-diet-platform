'use client';

import { useState, FormEvent, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { WaitlistContent } from '@/lib/contentTypes';
import BuyOfferButton from '@/components/checkout/BuyOfferButton';

type GoalOption = 'Energy' | 'Digestion' | 'Weight' | 'Clarity' | 'Sleep' | 'Other';

interface FormData {
  email: string;
  name: string;
  goal: GoalOption | '';
}

interface FormState {
  status: 'idle' | 'submitting' | 'success' | 'error';
  message: string;
}

interface WaitlistFormProps {
  content: WaitlistContent;
}

/**
 * Extract UTM parameters and redirect_path from URL query string
 */
function getUrlContext(): {
  source_path: string;
  redirect_path: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
} {
  if (typeof window === 'undefined') {
    return {
      source_path: '/journal-waitlist',
      redirect_path: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_term: null,
      utm_content: null,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect');

  return {
    source_path: window.location.pathname,
    redirect_path: redirect || null,
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    utm_campaign: params.get('utm_campaign'),
    utm_term: params.get('utm_term'),
    utm_content: params.get('utm_content'),
  };
}

export function WaitlistForm({ content }: WaitlistFormProps) {
  const [formData, setFormData] = useState<FormData>({
    email: '',
    name: '',
    goal: '',
  });

  const [formState, setFormState] = useState<FormState>({
    status: 'idle',
    message: '',
  });

  // Capture URL context once on mount (memoized)
  const urlContext = useMemo(() => getUrlContext(), []);

  const goalOptions: GoalOption[] = ['Energy', 'Digestion', 'Weight', 'Clarity', 'Sleep', 'Other'];

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Validate email
    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setFormState({
        status: 'error',
        message: 'Please enter a valid email address.',
      });
      return;
    }

    setFormState({ status: 'submitting', message: '' });

    try {
      // Build payload with context
      const payload: Record<string, any> = {
        email: formData.email,
        name: formData.name || null,
        goal: formData.goal || null,
        programSlug: 'journal',
        source: 'journal_waitlist',
        source_path: urlContext.source_path,
      };

      // Include redirect_path only if provided
      if (urlContext.redirect_path) {
        payload.redirect_path = urlContext.redirect_path;
      }

      // Include UTM params if present
      if (urlContext.utm_source) payload.utm_source = urlContext.utm_source;
      if (urlContext.utm_medium) payload.utm_medium = urlContext.utm_medium;
      if (urlContext.utm_campaign) payload.utm_campaign = urlContext.utm_campaign;
      if (urlContext.utm_term) payload.utm_term = urlContext.utm_term;
      if (urlContext.utm_content) payload.utm_content = urlContext.utm_content;

      const response = await fetch('/api/people/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      // Only show success if API explicitly returns { ok: true }
      if (data.ok === true) {
      setFormState({
        status: 'success',
        message: content.successMessage || 'Thank you! You\'ve been added to the waitlist. We\'ll be in touch soon.',
      });

      // Reset form
      setFormData({
        email: '',
        name: '',
        goal: '',
      });
      } else {
        // API returned { ok: false, error: "..." } or unexpected response
        const errorMessage = data.error || 'Something went wrong. Please try again.';
        setFormState({
          status: 'error',
          message: errorMessage,
        });
      }
    } catch (error) {
      setFormState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      });
    }
  };

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error state when user starts typing
    if (formState.status === 'error') {
      setFormState({ status: 'idle', message: '' });
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-2xl mx-auto">
        {/* Logo */}
        {content.logoPath && (
          <div className="mb-8 sm:mb-12 flex justify-center">
            <img
              src={content.logoPath}
              alt={content.logoAlt ?? "Fine Diet"}
              className="h-8 sm:h-10 w-auto"
            />
          </div>
        )}

        {/* Hero Section */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-white mb-4 antialiased">
            {content.title}
          </h1>
          {content.subtitle && (
            <p className="text-base sm:text-lg md:text-xl text-white/90 font-light antialiased mb-2">
              {content.subtitle}
            </p>
          )}
          {content.description && (
            <p className="text-base sm:text-lg text-white/80 font-light antialiased">
              {content.description}
            </p>
          )}
        </div>

        {/* Form */}
        <div className="bg-neutral-800/40 backdrop-blur rounded-[2.5rem] p-6 sm:p-8 md:p-10 shadow-soft">
          {formState.status === 'success' ? (
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
                {content.successTitle ?? "You're on the list!"}
              </p>
              <p className="text-base text-white/90 font-light antialiased">
                {formState.message}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {(content.formHeadline || content.formSubheadline) && (
                <div className="mb-4">
                  {content.formHeadline && (
                    <h2 className="text-xl font-semibold text-white mb-2 antialiased">
                      {content.formHeadline}
                    </h2>
                  )}
                  {content.formSubheadline && (
                    <p className="text-base text-white/90 font-light antialiased">
                      {content.formSubheadline}
                    </p>
                  )}
                </div>
              )}

              {/* Email Field */}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-white mb-2 antialiased">
                  {content.emailLabel ?? "Email"} {content.requiredLabel && <span className="text-white/60">{content.requiredLabel}</span>}
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-700/50 border border-neutral-600 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-denim-500 focus:border-transparent transition-all antialiased"
                  placeholder={content.emailPlaceholder ?? "your.email@example.com"}
                  disabled={formState.status === 'submitting'}
                />
              </div>

              {/* Name Field */}
              <div>
                <label htmlFor="name" className="block text-sm font-semibold text-white mb-2 antialiased">
                  {content.nameLabel ?? "Name"} {content.optionalLabel && <span className="text-white/60">{content.optionalLabel}</span>}
                </label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-700/50 border border-neutral-600 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-denim-500 focus:border-transparent transition-all antialiased"
                  placeholder={content.namePlaceholder ?? "Your name"}
                  disabled={formState.status === 'submitting'}
                />
              </div>

              {/* Goal Field */}
              <div>
                <label htmlFor="goal" className="block text-sm font-semibold text-white mb-2 antialiased">
                  {content.goalLabel ?? "Goal"} {content.optionalLabel && <span className="text-white/60">{content.optionalLabel}</span>}
                </label>
                <select
                  id="goal"
                  value={formData.goal}
                  onChange={(e) => handleChange('goal', e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-700/50 border border-neutral-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-denim-500 focus:border-transparent transition-all antialiased appearance-none cursor-pointer"
                  disabled={formState.status === 'submitting'}
                >
                  <option value="" className="bg-neutral-800">
                    {content.goalPlaceholder ?? "Select a goal..."}
                  </option>
                  {goalOptions.map((goal) => (
                    <option key={goal} value={goal} className="bg-neutral-800">
                      {goal}
                    </option>
                  ))}
                </select>
              </div>

              {/* Error Message */}
              {formState.status === 'error' && (
                <div className="bg-semantic-error/20 border border-semantic-error/50 rounded-xl p-4">
                  <p className="text-sm text-white antialiased">{formState.message}</p>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={formState.status === 'submitting'}
                  className="w-full"
                >
                  {formState.status === 'submitting' 
                    ? (content.submitButtonLoadingLabel ?? 'Submitting...') 
                    : (content.submitButtonLabel ?? 'Join Waitlist')}
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Purchase options */}
        <div className="mt-8 bg-neutral-800/40 backdrop-blur rounded-2xl p-6 text-center">
          <h3 className="text-base font-semibold text-white mb-1 antialiased">
            Ready to start now?
          </h3>
          <p className="text-sm text-white/70 font-light antialiased mb-4">
            Skip the waitlist and get immediate access.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <BuyOfferButton
              offerKey="journal-annual"
              label="Annual"
              placement="journal_waitlist"
              variant="primary"
              size="sm"
            />
            <BuyOfferButton
              offerKey="journal-monthly"
              label="Monthly"
              placement="journal_waitlist"
              variant="secondary"
              size="sm"
            />
            <BuyOfferButton
              offerKey="journal-onetime"
              label="One-time"
              placement="journal_waitlist"
              variant="ghost"
              size="sm"
            />
          </div>
        </div>

        {/* Footer Note */}
        {content.privacyNote && (
          <div className="mt-8 text-center">
            <p className="text-sm text-white/60 font-light antialiased">
              {content.privacyNote}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

