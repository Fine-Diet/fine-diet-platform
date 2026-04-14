'use client';

import { useState, FormEvent } from 'react';

interface FinePrintFormProps {
  /**
   * Which API source to attribute this signup to.
   * Defaults to 'landing_the_fine_print'.
   */
  source?: 'landing_the_fine_print' | 'home_fine_print';
  /** Override the submit button label */
  submitLabel?: string;
}

/**
 * Full Fine Print signup form.
 *
 * Collects email + explicit topic checkboxes and posts to
 * /api/people/newsletter with intent: nurture_marketing.
 *
 * Compatible with Pages Router and App Router ('use client').
 */
export function FinePrintForm({
  source = 'landing_the_fine_print',
  submitLabel = 'Get The Fine Print',
}: FinePrintFormProps) {
  const [email, setEmail] = useState('');
  const [prefs, setPrefs] = useState({
    nutritionInsights: true,
    programOffers: true,
    earlyAccess: true,
    productUpdates: false,
  });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const togglePref = (key: keyof typeof prefs) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  };

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
          source,
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
      <div className="text-center py-8 px-4">
        <div className="mb-4 flex justify-center">
          <div className="w-14 h-14 rounded-full bg-denim-500/20 flex items-center justify-center">
            <svg className="w-7 h-7 text-denim-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <h3 className="text-xl font-semibold text-white mb-2 antialiased">
          You&apos;re on the list.
        </h3>
        <p className="text-base text-white/80 font-light antialiased">
          Expect nutrition insights and early access straight to your inbox.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Email */}
      <div>
        <label htmlFor="fp-email" className="block text-sm font-semibold text-white mb-2 antialiased">
          Email address
        </label>
        <input
          id="fp-email"
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === 'error') setStatus('idle');
          }}
          placeholder="your@email.com"
          disabled={status === 'submitting'}
          className="w-full px-4 py-3 bg-neutral-700/50 border border-neutral-600 rounded-xl
            text-white placeholder-white/40 antialiased
            focus:outline-none focus:ring-2 focus:ring-denim-500 focus:border-transparent
            disabled:opacity-50 transition-all"
        />
      </div>

      {/* Explicit opt-in topics */}
      <div>
        <p className="text-sm font-semibold text-white mb-3 antialiased">
          What would you like to receive?
        </p>
        <div className="space-y-2.5">
          {[
            {
              key: 'nutritionInsights' as const,
              label: 'Nutrition insights & education',
              description: 'Science-backed breakdowns you can actually use.',
            },
            {
              key: 'programOffers' as const,
              label: 'Nurture content & tips',
              description: 'Practical guidance between programs.',
            },
            {
              key: 'earlyAccess' as const,
              label: 'Early access to programs & offers',
              description: 'First to know when something new launches.',
            },
            {
              key: 'productUpdates' as const,
              label: 'Product & platform updates',
              description: 'What we&apos;re building and shipping.',
            },
          ].map(({ key, label, description }) => (
            <label
              key={key}
              className="flex items-start gap-3 cursor-pointer group"
            >
              <div className="relative flex-shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  onChange={() => togglePref(key)}
                  disabled={status === 'submitting'}
                  className="sr-only peer"
                />
                <div
                  className="w-5 h-5 rounded border-2 border-neutral-500
                    peer-checked:border-denim-500 peer-checked:bg-denim-500
                    group-hover:border-neutral-400 transition-all flex items-center justify-center"
                >
                  {prefs[key] && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-white antialiased">{label}</p>
                <p
                  className="text-xs text-white/55 antialiased"
                  dangerouslySetInnerHTML={{ __html: description }}
                />
              </div>
            </label>
          ))}
        </div>
      </div>

      {status === 'error' && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          <p className="text-sm text-red-400 antialiased">{message}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="w-full px-5 py-3 rounded-full font-semibold text-base antialiased
          bg-gradient-to-bl from-denim-500 to-denim-900 text-neutral-900
          hover:opacity-90 transition-opacity
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-denim-500 focus:ring-offset-2
          inline-flex items-center justify-center gap-2"
      >
        {status === 'submitting' ? (
          <>
            <span className="w-4 h-4 border-2 border-neutral-900/30 border-t-neutral-900 rounded-full animate-spin" />
            Submitting…
          </>
        ) : (
          submitLabel
        )}
      </button>

      <p className="text-xs text-white/40 text-center antialiased">
        No spam. Unsubscribe at any time.
      </p>
    </form>
  );
}
