'use client';

import { useState, FormEvent } from 'react';

interface CheckoutEmailOptInProps {
  /**
   * Pre-fill the email field when already known (e.g. from a form above).
   * When provided the email field is hidden.
   */
  prefilledEmail?: string;
  /** Compact one-line layout vs. full checkbox list */
  variant?: 'compact' | 'full';
}

/**
 * Lightweight checkout-adjacent email opt-in widget.
 *
 * Allows visitors who are about to purchase (or who just purchased) to
 * opt in to Fine Diet comms without going through the main newsletter flow.
 *
 * Posts to /api/people/newsletter with source: 'checkout_opt_in'.
 * Compatible with Pages Router and App Router ('use client').
 */
export function CheckoutEmailOptIn({
  prefilledEmail,
  variant = 'full',
}: CheckoutEmailOptInProps) {
  const [email, setEmail] = useState(prefilledEmail ?? '');
  const [prefs, setPrefs] = useState({
    nutritionInsights: false,
    programOffers: false,
    earlyAccess: false,
    productUpdates: false,
  });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const togglePref = (key: keyof typeof prefs) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  };

  const anyChecked = Object.values(prefs).some(Boolean);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('error');
      setMessage('Please enter a valid email address.');
      return;
    }

    setStatus('submitting');
    setMessage('');

    try {
      const res = await fetch('/api/people/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          source: 'checkout_opt_in',
          intent: 'nurture_marketing',
          preferences: prefs,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.ok !== true) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      setStatus('success');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  if (status === 'success') {
    return (
      <p className="text-sm text-white/70 antialiased text-center py-2">
        Got it — you&apos;re on the list.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-white antialiased mb-0.5">
          Stay in the loop
        </p>
        <p className="text-xs text-white/55 antialiased">
          Get nutrition insights and early access to new programs.
        </p>
      </div>

      {/* Email field — hidden when pre-filled */}
      {!prefilledEmail && (
        <input
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === 'error') setStatus('idle');
          }}
          placeholder="your@email.com"
          disabled={status === 'submitting'}
          className="w-full px-4 py-2.5 bg-neutral-700/50 border border-neutral-600 rounded-xl
            text-white placeholder-white/40 text-sm antialiased
            focus:outline-none focus:ring-2 focus:ring-denim-500 focus:border-transparent
            disabled:opacity-50 transition-all"
        />
      )}

      {/* Topic checkboxes — always shown in full variant */}
      {variant === 'full' && (
        <div className="space-y-2">
          {[
            { key: 'nutritionInsights' as const, label: 'Nutrition insights & tips' },
            { key: 'programOffers' as const, label: 'Nurture content & guidance' },
            { key: 'earlyAccess' as const, label: 'Early access to programs & offers' },
            { key: 'productUpdates' as const, label: 'Product & platform updates' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2.5 cursor-pointer group">
              <div className="relative flex-shrink-0">
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  onChange={() => togglePref(key)}
                  disabled={status === 'submitting'}
                  className="sr-only peer"
                />
                <div
                  className="w-4 h-4 rounded border border-neutral-500
                    peer-checked:border-denim-500 peer-checked:bg-denim-500
                    group-hover:border-neutral-400 transition-all flex items-center justify-center"
                >
                  {prefs[key] && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-xs text-white/75 antialiased group-hover:text-white/90 transition-colors">
                {label}
              </span>
            </label>
          ))}
        </div>
      )}

      {/* Compact variant: single master checkbox */}
      {variant === 'compact' && (
        <label className="flex items-center gap-2.5 cursor-pointer group">
          <div className="relative flex-shrink-0">
            <input
              type="checkbox"
              checked={anyChecked}
              onChange={() => {
                const next = !anyChecked;
                setPrefs({
                  nutritionInsights: next,
                  programOffers: next,
                  earlyAccess: next,
                  productUpdates: false,
                });
              }}
              disabled={status === 'submitting'}
              className="sr-only peer"
            />
            <div
              className="w-4 h-4 rounded border border-neutral-500
                peer-checked:border-denim-500 peer-checked:bg-denim-500
                group-hover:border-neutral-400 transition-all flex items-center justify-center"
            >
              {anyChecked && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>
          <span className="text-xs text-white/75 antialiased group-hover:text-white/90 transition-colors">
            Keep me updated on nutrition insights and new programs
          </span>
        </label>
      )}

      {status === 'error' && (
        <p className="text-xs text-red-400 antialiased">{message}</p>
      )}

      <button
        type="submit"
        disabled={status === 'submitting' || (!anyChecked && variant !== 'compact')}
        className="w-full px-4 py-2 rounded-full text-sm font-semibold antialiased
          bg-neutral-700 hover:bg-neutral-600 text-white
          disabled:opacity-40 disabled:cursor-not-allowed
          transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-500"
      >
        {status === 'submitting' ? 'Saving…' : 'Save preferences'}
      </button>
    </form>
  );
}
