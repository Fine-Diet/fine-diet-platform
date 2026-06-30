/**
 * BuyOfferButton — reusable purchase CTA
 *
 * Calls /api/checkout/create with offer_key + tracking metadata,
 * then redirects to the Stripe Checkout URL.
 * Shows loading spinner and error toast inline.
 */

import { useState, useCallback } from 'react';
import { ensureSessionIdClient } from '@/lib/tracking/sessionId';
import { buildAuthUrl } from '@/lib/auth/authContext';

export interface BuyOfferButtonProps {
  offerKey: string;
  /** How to pay (durable price-option layer). Optional for legacy offer-only. */
  priceOptionKey?: string;
  label?: string;
  placement?: string;
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  className?: string;
  wrapperClassName?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'unstyled';
  size?: 'sm' | 'md' | 'lg' | 'unstyled';
}

const variantStyles: Record<NonNullable<BuyOfferButtonProps['variant']>, string> = {
  primary:
    'bg-denim-500 hover:bg-denim-400 text-white',
  secondary:
    'bg-neutral-800/60 hover:bg-neutral-800/80 text-white border border-neutral-700/50',
  ghost:
    'bg-transparent hover:bg-white/10 text-denim-400 hover:text-denim-300',
  unstyled: '',
};

const sizeStyles: Record<NonNullable<BuyOfferButtonProps['size']>, string> = {
  sm: 'px-4 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
  unstyled: '',
};

export default function BuyOfferButton({
  offerKey,
  priceOptionKey,
  label = 'Buy Now',
  placement = 'button',
  source = 'button',
  utmSource,
  utmMedium,
  utmCampaign,
  utmContent,
  utmTerm,
  className = '',
  wrapperClassName = '',
  variant = 'primary',
  size = 'md',
}: BuyOfferButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    setLoading(true);
    setError(null);
    ensureSessionIdClient();

    try {
      const res = await fetch('/api/checkout/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offer_key: offerKey,
          price_option_key: priceOptionKey || undefined,
          placement,
          source,
          utm_source: utmSource || undefined,
          utm_medium: utmMedium || undefined,
          utm_campaign: utmCampaign || undefined,
          utm_content: utmContent || undefined,
          utm_term: utmTerm || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          // Logged-out: route through account creation, then auto-continue into
          // Stripe via /checkout/resume (no need to click the offer CTA again).
          // The offer + tracking ride along so the resume step rebuilds the same
          // checkout the user intended.
          const resumeParams = new URLSearchParams({ offer: offerKey });
          if (priceOptionKey) resumeParams.set('price_option', priceOptionKey);
          if (source) resumeParams.set('source', source);
          if (placement) resumeParams.set('placement', placement);
          if (utmSource) resumeParams.set('utm_source', utmSource);
          if (utmMedium) resumeParams.set('utm_medium', utmMedium);
          if (utmCampaign) resumeParams.set('utm_campaign', utmCampaign);
          if (utmContent) resumeParams.set('utm_content', utmContent);
          if (utmTerm) resumeParams.set('utm_term', utmTerm);
          const resumeTarget = `/checkout/resume?${resumeParams.toString()}`;

          window.location.href = buildAuthUrl({
            intent: 'signup',
            source: 'checkout',
            redirectTo: resumeTarget,
            offerKey,
          });
          return;
        }
        if (data.error === 'already_entitled' && data.redirect) {
          window.location.href = data.redirect;
          return;
        }
        setError(data.message || data.error || 'Checkout failed');
        setLoading(false);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        setError('No checkout URL');
        setLoading(false);
      }
    } catch {
      setError('Network error');
      setLoading(false);
    }
  }, [offerKey, priceOptionKey, placement, source, utmSource, utmMedium, utmCampaign, utmContent, utmTerm]);

  return (
    <div className={`inline-flex flex-col items-start ${wrapperClassName}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={`
          inline-flex items-center justify-center gap-2 font-medium rounded-full
          transition-colors antialiased disabled:opacity-60
          ${variantStyles[variant] || variantStyles.primary}
          ${sizeStyles[size] || sizeStyles.md}
          ${className}
        `}
      >
        {loading && (
          <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
        )}
        {loading ? 'Redirecting...' : label}
      </button>
      {error && (
        <p className="text-xs text-red-400 mt-1 antialiased">{error}</p>
      )}
    </div>
  );
}
