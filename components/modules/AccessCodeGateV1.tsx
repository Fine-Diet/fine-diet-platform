/**
 * Module: access.code-gate.v1
 *
 * Access Code Gate. Owns ONLY the access-code entry UX + frontend-safe
 * verification flow. It does NOT touch billing, Stripe IDs, checkout routing,
 * entitlement grants, trial enforcement, price-option truth, or offer truth.
 *
 * On submit the entered code is normalized (trim + uppercase) client-side and
 * posted to POST /api/access-codes/verify with pass-through context
 * (startPageSlug / programSlug / productSlug / offerKey / source /
 * redirect_path). The backend returns a frontend-safe status only — no
 * internal code IDs, hashes, or redemption counts ever reach the client.
 *
 * On success the module renders configured success copy and a SAFE relative
 * CTA (e.g. `#pricing`, `/create-account?returnTo=...`). It never calls
 * checkout, never mutates entitlements, and never grants access.
 */

import { useState } from 'react';
import type { AccessCodeGateV1Content } from '@/lib/modules/types';

interface Props {
  content: AccessCodeGateV1Content;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

type VerifyStatus = 'invalid' | 'expired' | 'paused' | 'limit_reached';

interface VerifyResponse {
  ok: boolean;
  status?: 'valid' | VerifyStatus;
  message?: string;
  redirectPath?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim + uppercase normalization matching the backend digest input. */
function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Read source path from the current location (client only). */
function readSourcePath(): string | null {
  if (typeof window === 'undefined') return null;
  return window.location.pathname;
}

export function AccessCodeGateV1({ content }: Props) {
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<SubmitState>('idle');
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  function clientErrors(): string[] {
    const next: string[] = [];
    if (!normalizeCode(code)) {
      next.push('Please enter your access code.');
    }
    if (content.collectEmail && !EMAIL_RE.test(email.trim())) {
      next.push('Please enter a valid email address.');
    }
    return next;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (state === 'submitting') return;

    const errors = clientErrors();
    if (errors.length > 0) {
      setVerifyStatus(null);
      setServerMessage(errors[0]);
      setState('error');
      return;
    }

    setServerMessage(null);
    setVerifyStatus(null);
    setState('submitting');

    const payload: Record<string, unknown> = {
      code: normalizeCode(code),
      source: content.source,
      source_path: readSourcePath(),
      redirect_path: content.successCtaHref ?? undefined,
      startPageSlug: content.startPageSlug ?? undefined,
      programSlug: content.programSlug ?? undefined,
      productSlug: content.productSlug ?? undefined,
      offerKey: content.offerKey ?? undefined,
      campaignKey: content.campaignKey,
      codeKey: content.codeKey ?? undefined,
    };
    if (content.collectEmail) {
      payload.email = email.trim();
    }

    try {
      const res = await fetch('/api/access-codes/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json: VerifyResponse = await res.json().catch(() => ({ ok: false, status: 'invalid' }));

      if (res.ok && json.ok && json.status === 'valid') {
        setState('success');
        return;
      }

      // Map backend status to configured copy. Never expose internal details.
      const status: VerifyStatus = (json.status as VerifyStatus) ?? 'invalid';
      setVerifyStatus(status);
      setServerMessage(messageForStatus(status, json.message));
      setState('error');
    } catch {
      // Never surface backend internals; use a clean fallback.
      setVerifyStatus(null);
      setServerMessage(content.invalidMessage ?? 'That code does not look valid. Check it and try again.');
      setState('error');
    }
  }

  function messageForStatus(status: VerifyStatus, backendMessage?: string): string {
    // Prefer configured copy. Backend message is only used when it is present
    // AND the status has no dedicated configured copy (acts as a safe fallback).
    if (status === 'expired') {
      return content.expiredMessage ?? 'That code is no longer active.';
    }
    if (status === 'invalid' || status === 'paused' || status === 'limit_reached') {
      return content.invalidMessage ?? 'That code does not look valid. Check it and try again.';
    }
    return backendMessage ?? content.invalidMessage ?? 'That code does not look valid. Check it and try again.';
  }

  if (state === 'success') {
    const successHref = content.successCtaHref ?? '#pricing';
    const showCta = Boolean(content.successCtaLabel) && Boolean(successHref);
    return (
      <section className="bg-brand-50 px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-3xl font-semibold leading-tight text-brand-900 antialiased sm:text-4xl">
            {content.successTitle ?? 'Access unlocked.'}
          </h2>
          {content.successBody && (
            <p className="mt-4 text-base font-light leading-6 text-brand-900/80">
              {content.successBody}
            </p>
          )}
          {showCta && (
            <a
              href={successHref}
              className="mt-8 inline-block rounded-md bg-brand-900 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-800"
            >
              {content.successCtaLabel}
            </a>
          )}
        </div>
      </section>
    );
  }

  const submittingLabel = content.submittingLabel ?? 'Checking code…';

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
          <Field label={content.codeLabel ?? 'Access code'} required>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder={content.codePlaceholder ?? 'Enter code'}
              className="w-full rounded-md border border-brand-900/20 bg-white px-3 py-2 text-base text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-900/30"
            />
          </Field>

          {content.collectEmail && (
            <Field label={content.emailLabel ?? 'Email'} required>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder={content.emailPlaceholder ?? 'you@example.com'}
                className="w-full rounded-md border border-brand-900/20 bg-white px-3 py-2 text-base text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-900/30"
              />
            </Field>
          )}

          {state === 'error' && serverMessage && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {serverMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={state === 'submitting'}
            className="w-full rounded-md bg-brand-900 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-800 disabled:opacity-50"
          >
            {state === 'submitting' ? submittingLabel : content.ctaLabel}
          </button>

          {content.helpText && (
            <p className="pt-1 text-sm font-light leading-5 text-brand-900/55">
              {content.helpText}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-[0.04em] text-brand-900/70">
        {label}
        {required && <span className="ml-1 text-brand-900">*</span>}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
