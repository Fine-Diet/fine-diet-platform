/**
 * Module: lead.waitlist-capture.v1
 *
 * Conversion-safe lead/waitlist capture form. Owns ONLY lead capture + SMS
 * consent UX. It does NOT touch billing, Stripe IDs, checkout routing,
 * entitlement grants, trial enforcement, price-option truth, or offer truth.
 *
 * `content.variant` maps 1:1 to the backend `captureMode` on submission.
 * Submission posts to POST /api/people/waitlist with pass-through context
 * (programSlug / offerKey / startPageSlug / source / redirect_path / UTM).
 * The browser never triggers outbox processing — SMS stays mock-only unless
 * the backend environment is explicitly activated.
 *
 * Layout: `content.layout` opts into the prototype `banded` presentation
 * (full-width pale band, top repeating rail, centered content, underline line
 * inputs in two columns, wide dark pill CTA). In the banded layout the single
 * `name` field is presented as two line inputs (First / Last) and submitted to
 * the backend as one combined `name` string — the payload contract is
 * unchanged. Omitted / `'standard'` preserves the legacy single-column style.
 */

import { useState } from 'react';
import type { LeadWaitlistCaptureV1Content } from '@/lib/modules/types';
import {
  ConversionBandShell,
  type ConversionBackgroundTone,
} from '@/components/modules/shared/ConversionBandShell';

interface Props {
  content: LeadWaitlistCaptureV1Content;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GOAL_OPTIONS = ['Energy', 'Digestion', 'Weight', 'Clarity', 'Sleep', 'Other'] as const;
type GoalOption = (typeof GOAL_OPTIONS)[number];

const PREFERRED_CHANNEL_OPTIONS = ['email', 'sms', 'either'] as const;
type PreferredChannel = (typeof PREFERRED_CHANNEL_OPTIONS)[number];

const DEFAULT_RAIL_TEXT = 'JOIN THE WAITLIST';

const defaultSmsConsentLabel =
  'I agree to receive SMS updates from Fine Diet about this offer. Msg & data rates may apply. Reply STOP to opt out.';

/** Read UTM params + path context from the current location (client only). */
function readUtmAndPath() {
  if (typeof window === 'undefined') {
    return {
      source_path: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_term: null,
      utm_content: null,
    };
  }
  const params = new URLSearchParams(window.location.search);
  const get = (key: string) => params.get(key);
  return {
    source_path: window.location.pathname,
    utm_source: get('utm_source'),
    utm_medium: get('utm_medium'),
    utm_campaign: get('utm_campaign'),
    utm_term: get('utm_term'),
    utm_content: get('utm_content'),
  };
}

export function LeadWaitlistCaptureV1({ content }: Props) {
  const variant = content.variant ?? 'simple';
  const showPreferredChannel = variant === 'priority' || variant === 'concierge';
  const showGoal = variant === 'concierge';
  const isBanded = (content.layout ?? 'standard') === 'banded';

  const [name, setName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [preferredChannel, setPreferredChannel] = useState<PreferredChannel>(
    (content.preferredChannel as PreferredChannel | null | undefined) ?? 'either',
  );
  const [goal, setGoal] = useState<GoalOption | ''>('');
  const [state, setState] = useState<SubmitState>('idle');
  const [errors, setErrors] = useState<string[]>([]);

  function phoneRequired(): boolean {
    return variant === 'priority' || preferredChannel === 'sms' || smsOptIn;
  }

  function validate(): string[] {
    const next: string[] = [];
    if (!email.trim() || !EMAIL_RE.test(email.trim())) {
      next.push('Please enter a valid email address.');
    }
    const phoneTrimmed = phone.trim();
    if (phoneRequired() && !phoneTrimmed) {
      next.push('A phone number is required for this option.');
    }
    return next;
  }

  /** Combined name sent to the backend. Banded splits First/Last; standard
   * keeps the single `name` field. Payload contract is unchanged either way. */
  function resolvedName(): string | undefined {
    if (isBanded) {
      return [firstName.trim(), lastName.trim()].filter(Boolean).join(' ') || undefined;
    }
    return name.trim() || undefined;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (state === 'submitting') return;

    const validationErrors = validate();
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      setState('error');
      return;
    }

    setErrors([]);
    setState('submitting');

    const ctx = readUtmAndPath();
    const smsConsentText = content.smsConsentLabel ?? null;
    const smsConsentVersion = content.smsConsentVersion ?? 'waitlist-sms-v1';

    const payload: Record<string, unknown> = {
      name: resolvedName(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      smsOptIn,
      smsConsentText: smsOptIn ? smsConsentText : undefined,
      smsConsentVersion: smsOptIn ? smsConsentVersion : undefined,
      captureMode: variant,
      preferredChannel,
      campaignKey: content.campaignKey,
      programSlug: content.programSlug ?? undefined,
      offerKey: content.offerKey ?? undefined,
      startPageSlug: content.startPageSlug ?? undefined,
      source: content.source,
      source_path: ctx.source_path,
      redirect_path: content.redirectPath ?? undefined,
      utm_source: ctx.utm_source,
      utm_medium: ctx.utm_medium,
      utm_campaign: ctx.utm_campaign,
      utm_term: ctx.utm_term,
      utm_content: ctx.utm_content,
    };

    if (showGoal && goal) {
      payload.goal = goal;
    }

    try {
      const res = await fetch('/api/people/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setState('error');
        return;
      }
      setState('success');
    } catch {
      // Never surface backend internals; use the clean fallback.
      setState('error');
    }
  }

  const submittingLabel = content.submittingLabel ?? 'Saving your spot…';
  const errorFallback = content.errorFallback ?? 'Something went wrong. Please try again.';

  if (state === 'success') {
    const successBody = (
      <div className={isBanded ? 'mx-auto max-w-2xl text-center' : 'mx-auto max-w-xl text-center'}>
        <h2 className="text-3xl font-semibold leading-tight text-brand-900 antialiased sm:text-4xl">
          {content.successTitle ?? "You're on the list."}
        </h2>
        {content.successBody && (
          <p className="mt-4 text-base font-light leading-6 text-brand-900/80">
            {content.successBody}
          </p>
        )}
        {smsOptIn && content.successSmsNote && (
          <p className="mt-3 text-sm font-light leading-5 text-brand-900/60">
            {content.successSmsNote}
          </p>
        )}
      </div>
    );

    if (isBanded) {
      return (
        <ConversionBandShell
          anchorId={content.anchorId}
          backgroundTone={(content.backgroundTone ?? 'blue') as ConversionBackgroundTone}
          railText={content.railText ?? DEFAULT_RAIL_TEXT}
          railEnabled={content.railEnabled ?? true}
        >
          {successBody}
        </ConversionBandShell>
      );
    }

    return (
      <section className="bg-brand-50 px-6 py-16 sm:py-20">{successBody}</section>
    );
  }

  if (isBanded) {
    return (
      <ConversionBandShell
        anchorId={content.anchorId}
        backgroundTone={(content.backgroundTone ?? 'blue') as ConversionBackgroundTone}
        railText={content.railText ?? DEFAULT_RAIL_TEXT}
        railEnabled={content.railEnabled ?? true}
      >
        <div className="mx-auto max-w-2xl text-center">
          {content.eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-900/45">
              {content.eyebrow}
            </p>
          )}
          <h2 className="mt-2 text-3xl font-semibold leading-tight text-brand-900 antialiased sm:text-4xl">
            {content.title}
          </h2>
          {content.description && (
            <p className="mt-4 text-base font-light leading-6 text-brand-900/80">
              {content.description}
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-6" noValidate>
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              <UnderlineField
                label={content.firstNameLabel ?? 'First Name'}
                autoComplete="given-name"
                value={firstName}
                onChange={setFirstName}
              />
              <UnderlineField
                label={content.lastNameLabel ?? 'Last Name'}
                autoComplete="family-name"
                value={lastName}
                onChange={setLastName}
              />
              <UnderlineField
                label={content.emailLabel ?? 'Email'}
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={setEmail}
              />
              <UnderlineField
                label={content.phoneLabel ?? 'Phone'}
                required={phoneRequired()}
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={setPhone}
              />
            </div>

            {showPreferredChannel && (
              <div className="text-left">
                <label className="block text-xs font-semibold uppercase tracking-[0.04em] text-brand-900/70">
                  {content.preferredChannelLabel ?? 'Preferred contact method'}
                </label>
                <select
                  value={preferredChannel}
                  onChange={(e) => setPreferredChannel(e.target.value as PreferredChannel)}
                  className="mt-2 w-full border-b border-brand-900/20 bg-transparent py-2 text-base text-brand-900 focus:outline-none focus:border-brand-900/50"
                >
                  {PREFERRED_CHANNEL_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt === 'email' ? 'Email' : opt === 'sms' ? 'SMS' : 'Either'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {showGoal && (
              <div className="text-left">
                <label className="block text-xs font-semibold uppercase tracking-[0.04em] text-brand-900/70">
                  {content.goalLabel ?? 'What are you interested in?'}
                </label>
                <select
                  value={goal}
                  onChange={(e) => setGoal(e.target.value as GoalOption | '')}
                  className="mt-2 w-full border-b border-brand-900/20 bg-transparent py-2 text-base text-brand-900 focus:outline-none focus:border-brand-900/50"
                >
                  <option value="">Select one…</option>
                  {GOAL_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <label className="flex items-start gap-3 pt-1 text-left text-sm font-light leading-5 text-brand-900/80">
              <input
                type="checkbox"
                checked={smsOptIn}
                onChange={(e) => setSmsOptIn(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded-full border-brand-900/30 text-brand-900 focus:ring-brand-900/30"
              />
              <span>{content.smsConsentLabel ?? defaultSmsConsentLabel}</span>
            </label>

            {state === 'error' && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {errors.length > 0 ? errors[0] : errorFallback}
              </div>
            )}

            <button
              type="submit"
              disabled={state === 'submitting'}
              className="w-full rounded-full bg-brand-900 px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-brand-800 disabled:opacity-50"
            >
              {state === 'submitting' ? submittingLabel : content.ctaLabel}
            </button>
          </form>
        </div>
      </ConversionBandShell>
    );
  }

  return (
    <section className="bg-brand-50 px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-xl">
        {content.eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.04em] text-brand-900/45">
            {content.eyebrow}
          </p>
        )}
        <h2 className="mt-2 text-3xl font-semibold leading-tight text-brand-900 antialiased sm:text-4xl">
          {content.title}
        </h2>
        {content.description && (
          <p className="mt-4 text-base font-light leading-6 text-brand-900/80">
            {content.description}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
          <Field label={content.nameLabel ?? 'Name'}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="w-full rounded-md border border-brand-900/20 bg-white px-3 py-2 text-base text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-900/30"
            />
          </Field>

          <Field label={content.emailLabel ?? 'Email'} required>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="w-full rounded-md border border-brand-900/20 bg-white px-3 py-2 text-base text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-900/30"
            />
          </Field>

          <Field
            label={content.phoneLabel ?? 'Phone'}
            required={variant === 'priority' || smsOptIn || preferredChannel === 'sms'}
            hint={content.phonePrompt}
          >
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              className="w-full rounded-md border border-brand-900/20 bg-white px-3 py-2 text-base text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-900/30"
            />
          </Field>

          {showPreferredChannel && (
            <Field label={content.preferredChannelLabel ?? 'Preferred contact method'}>
              <select
                value={preferredChannel}
                onChange={(e) => setPreferredChannel(e.target.value as PreferredChannel)}
                className="w-full rounded-md border border-brand-900/20 bg-white px-3 py-2 text-base text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-900/30"
              >
                {PREFERRED_CHANNEL_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt === 'email' ? 'Email' : opt === 'sms' ? 'SMS' : 'Either'}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {showGoal && (
            <Field label={content.goalLabel ?? 'What are you interested in?'}>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value as GoalOption | '')}
                className="w-full rounded-md border border-brand-900/20 bg-white px-3 py-2 text-base text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-900/30"
              >
                <option value="">Select one…</option>
                {GOAL_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <label className="flex items-start gap-3 pt-1 text-sm font-light leading-5 text-brand-900/80">
            <input
              type="checkbox"
              checked={smsOptIn}
              onChange={(e) => setSmsOptIn(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-brand-900/30 text-brand-900 focus:ring-brand-900/30"
            />
            <span>{content.smsConsentLabel ?? defaultSmsConsentLabel}</span>
          </label>

          {state === 'error' && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errors.length > 0 ? errors[0] : errorFallback}
            </div>
          )}

          <button
            type="submit"
            disabled={state === 'submitting'}
            className="w-full rounded-md bg-brand-900 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-800 disabled:opacity-50"
          >
            {state === 'submitting' ? submittingLabel : content.ctaLabel}
          </button>
        </form>
      </div>
    </section>
  );
}

/**
 * Banded underline line-input. Transparent, bottom-border-only, base text
 * size. Per the prototype, there is NO visible label/header above the input —
 * the field label is shown as left-aligned placeholder text sitting directly
 * on the underline (e.g. "First Name", "Email *"). A screen-reader label is
 * still provided via aria-label, and `required` is reflected in the placeholder
 * ("Email *") and the HTML required attribute.
 */
function UnderlineField({
  label,
  required,
  type = 'text',
  autoComplete,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  type?: string;
  autoComplete?: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const placeholder = `${label}${required ? ' *' : ''}`;
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete={autoComplete}
      aria-label={label}
      placeholder={placeholder}
      required={required}
      className="w-full border-b border-brand-900/25 bg-transparent py-2 text-base text-brand-900 placeholder:text-brand-900/55 placeholder:font-light focus:border-brand-900/60 focus:outline-none"
    />
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-[0.04em] text-brand-900/70">
        {label}
        {required && <span className="ml-1 text-brand-900">*</span>}
      </label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs font-light text-brand-900/55">{hint}</p>}
    </div>
  );
}
