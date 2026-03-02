/**
 * BuyOfferButton — reusable purchase CTA
 *
 * Calls /api/checkout/create with offer_key + tracking metadata,
 * then redirects to the Stripe Checkout URL.
 * Shows loading spinner and error toast inline.
 */

import { useState, useCallback } from 'react';
import { ensureSessionIdClient } from '@/lib/tracking/sessionId';

export interface BuyOfferButtonProps {
  offerKey: string;
  label?: string;
  placement?: string;
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

const variantStyles: Record<string, string> = {
  primary:
    'bg-dark_accent-500 hover:bg-dark_accent-400 text-white',
  secondary:
    'bg-neutral-800/60 hover:bg-neutral-800/80 text-white border border-neutral-700/50',
  ghost:
    'bg-transparent hover:bg-white/10 text-dark_accent-400 hover:text-dark_accent-300',
};

const sizeStyles: Record<string, string> = {
  sm: 'px-4 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
};

export default function BuyOfferButton({
  offerKey,
  label = 'Buy Now',
  placement = 'button',
  source = 'button',
  utmSource,
  utmMedium,
  utmCampaign,
  utmContent,
  utmTerm,
  className = '',
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
          window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
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
  }, [offerKey, placement, source, utmSource, utmMedium, utmCampaign, utmContent, utmTerm]);

  return (
    <div className="inline-flex flex-col items-start">
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
