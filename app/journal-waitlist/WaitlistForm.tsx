'use client';

import { useState, FormEvent, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { WaitlistContent } from '@/lib/contentTypes';
import BuyOfferButton from '@/components/checkout/BuyOfferButton';
import { CheckoutEmailOptIn } from '@/components/newsletter/CheckoutEmailOptIn';

type GoalOption = 'Energy' | 'Digestion' | 'Weight' | 'Clarity' | 'Sleep' | 'Other';

interface FormData {
  email: string;
  name: string;
  goal: GoalOption | '';
  /** Opt-in checkboxes for email preferences */
  optInNutrition: boolean;
  optInEarlyAccess: boolean;
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
    optInNutrition: false,
    optInEarlyAccess: false,
  });

  const [formState, setFormState] = useState<FormState>({
    status: 'idle',
    message: '',
  });

  const urlContext = useMemo(() => getUrlContext(), []);

  const goalOptions: GoalOption[] = ['Energy', 'Digestion', 'Weight', 'Clarity', 'Sleep', 'Other'];

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setFormState({
        status: 'error',
        message: 'Please enter a valid email address.',
      });
      return;
    }

    setFormState({ status: 'submitting', message: '' });

    try {
      const payload: Record<string, unknown> = {
        email: formData.email,
        name: formData.name || null,
        goal: formData.goal || null,
        programSlug: 'journal',
        source: 'journal_waitlist',
        source_path: urlContext.source_path,
      };

      if (urlContext.redirect_path) payload.redirect_path = urlContext.redirect_path;
      if (urlContext.utm_source) payload.utm_source = urlContext.utm_source;
      if (urlContext.utm_medium) payload.utm_medium = urlContext.utm_medium;
      if (urlContext.utm_campaign) payload.utm_campaign = urlContext.utm_campaign;
      if (urlContext.utm_term) payload.utm_term = urlContext.utm_term;
      if (urlContext.utm_content) payload.utm_content = urlContext.utm_content;

      const response = await fetch('/api/people/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.ok !== true) {
        const errorMessage = data.error || 'Something went wrong. Please try again.';
        setFormState({ status: 'error', message: errorMessage });
        return;
      }

      // Fire-and-forget email preference opt-in if at least one checkbox is checked
      const anyOptIn = formData.optInNutrition || formData.optInEarlyAccess;
      if (anyOptIn) {
        fetch('/api/people/newsletter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            source: 'journal_onboarding_opt_in',
            intent: 'nurture_marketing',
            preferences: {
              nutritionInsights: formData.optInNutrition,
              earlyAccess: formData.optInEarlyAccess,
              programOffers: formData.optInEarlyAccess,
            },
          }),
        }).catch(() => {
          // Non-critical — do not surface to user
        });
      }

      setFormState({
        status: 'success',
        message:
          content.successMessage ||
          "Thank you! You've been added to the waitlist. We'll be in touch soon.",
      });

      setFormData({
        email: '',
        name: '',
        goal: '',
        optInNutrition: false,
        optInEarlyAccess: false,
      });
    } catch (error) {
      setFormState({
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      });
    }
  };

  const handleChange = (field: keyof FormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
              alt={content.logoAlt ?? 'Fine Diet'}
              className="h-8 sm:h-10 w-auto"
            />
          </div>
        )}

        {/* Hero */}
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

        {/* Waitlist form */}
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

              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-semibold text-white mb-2 antialiased"
                >
                  {content.emailLabel ?? 'Email'}{' '}
                  {content.requiredLabel && (
                    <span className="text-white/60">{content.requiredLabel}</span>
                  )}
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-700/50 border border-neutral-600 rounded-xl
                    text-white placeholder-white/50 antialiased
                    focus:outline-none focus:ring-2 focus:ring-denim-500 focus:border-transparent
                    transition-all"
                  placeholder={content.emailPlaceholder ?? 'your.email@example.com'}
                  disabled={formState.status === 'submitting'}
                />
              </div>

              {/* Name */}
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-semibold text-white mb-2 antialiased"
                >
                  {content.nameLabel ?? 'Name'}{' '}
                  {content.optionalLabel && (
                    <span className="text-white/60">{content.optionalLabel}</span>
                  )}
                </label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-700/50 border border-neutral-600 rounded-xl
                    text-white placeholder-white/50 antialiased
                    focus:outline-none focus:ring-2 focus:ring-denim-500 focus:border-transparent
                    transition-all"
                  placeholder={content.namePlaceholder ?? 'Your name'}
                  disabled={formState.status === 'submitting'}
                />
              </div>

              {/* Goal */}
              <div>
                <label
                  htmlFor="goal"
                  className="block text-sm font-semibold text-white mb-2 antialiased"
                >
                  {content.goalLabel ?? 'Goal'}{' '}
                  {content.optionalLabel && (
                    <span className="text-white/60">{content.optionalLabel}</span>
                  )}
                </label>
                <select
                  id="goal"
                  value={formData.goal}
                  onChange={(e) => handleChange('goal', e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-700/50 border border-neutral-600 rounded-xl
                    text-white antialiased appearance-none cursor-pointer
                    focus:outline-none focus:ring-2 focus:ring-denim-500 focus:border-transparent
                    transition-all"
                  disabled={formState.status === 'submitting'}
                >
                  <option value="" className="bg-neutral-800">
                    {content.goalPlaceholder ?? 'Select a goal...'}
                  </option>
                  {goalOptions.map((goal) => (
                    <option key={goal} value={goal} className="bg-neutral-800">
                      {goal}
                    </option>
                  ))}
                </select>
              </div>

              {/* ----------------------------------------------------------------
                  Journal onboarding opt-in
                  Fire-and-forget to /api/people/newsletter on form success
              ---------------------------------------------------------------- */}
              <div className="border-t border-neutral-700/50 pt-5">
                <p className="text-xs font-semibold text-white/50 uppercase tracking-wider antialiased mb-3">
                  While you wait
                </p>
                <div className="space-y-2.5">
                  {[
                    {
                      field: 'optInNutrition' as const,
                      label: 'Send me nutrition insights & tips',
                      description: 'Science-backed content to start building better habits now.',
                    },
                    {
                      field: 'optInEarlyAccess' as const,
                      label: 'Give me early access to new programs',
                      description: 'First look when we open new cohorts or launch something new.',
                    },
                  ].map(({ field, label, description }) => (
                    <label key={field} className="flex items-start gap-3 cursor-pointer group">
                      <div className="relative flex-shrink-0 mt-0.5">
                        <input
                          type="checkbox"
                          checked={formData[field] as boolean}
                          onChange={() => handleChange(field, !(formData[field] as boolean))}
                          disabled={formState.status === 'submitting'}
                          className="sr-only peer"
                        />
                        <div
                          className="w-4 h-4 rounded border border-neutral-500
                            peer-checked:border-denim-500 peer-checked:bg-denim-500
                            group-hover:border-neutral-400 transition-all
                            flex items-center justify-center"
                        >
                          {(formData[field] as boolean) && (
                            <svg
                              className="w-2.5 h-2.5 text-white"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white antialiased">{label}</p>
                        <p className="text-xs text-white/50 antialiased">{description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {formState.status === 'error' && (
                <div className="bg-semantic-error/20 border border-semantic-error/50 rounded-xl p-4">
                  <p className="text-sm text-white antialiased">{formState.message}</p>
                </div>
              )}

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

        {/* Purchase options with checkout opt-in */}
        <div className="mt-8 bg-neutral-800/40 backdrop-blur rounded-2xl p-6">
          <h3 className="text-base font-semibold text-white mb-1 antialiased text-center">
            Ready to start now?
          </h3>
          <p className="text-sm text-white/70 font-light antialiased mb-4 text-center">
            Skip the waitlist and get immediate access.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mb-6">
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

          {/* Checkout-adjacent opt-in: compact single checkbox */}
          <div className="border-t border-neutral-700/40 pt-4">
            <CheckoutEmailOptIn variant="compact" />
          </div>

          {/* Checkout-adjacent legal references */}
          <p className="mt-4 text-center text-xs text-white/40 font-light antialiased">
            By purchasing, you agree to our{' '}
            <a href="/terms" className="underline underline-offset-2 hover:text-white/70">
              Terms
            </a>
            ,{' '}
            <a href="/refund-policy" className="underline underline-offset-2 hover:text-white/70">
              Refund Policy
            </a>
            , and{' '}
            <a href="/privacy" className="underline underline-offset-2 hover:text-white/70">
              Privacy Policy
            </a>
            .
          </p>
        </div>

        {/* Footer note */}
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
