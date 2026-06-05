/**
 * useOffers — client hook for the offer catalog with entitlement-aware owned state.
 *
 * Fetches marketing-safe offers from /api/offers and cross-references the
 * authenticated user's dashboard access to mark baseline offers as already
 * owned. Owned-state is coarse in v1 (baseline app access); refine as the
 * dashboard exposes more granular entitlement data.
 */

import { useEffect, useState, useCallback } from 'react';
import type { OfferMarketingDTO } from './offerCatalogService';

interface UseOffersResult {
  offers: OfferMarketingDTO[];
  loading: boolean;
  error: string | null;
  /** True if the signed-in user already has access this offer would grant. */
  isOwned: (offer: OfferMarketingDTO) => boolean;
  hasAppAccess: boolean;
}

export function useOffers(kind: 'all' | 'baseline' | 'practitioner' = 'all'): UseOffersResult {
  const [offers, setOffers] = useState<OfferMarketingDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAppAccess, setHasAppAccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const offersRes = await fetch(`/api/offers?kind=${encodeURIComponent(kind)}`);
        if (!offersRes.ok) throw new Error('Failed to load offers');
        const offersJson: { offers: OfferMarketingDTO[] } = await offersRes.json();

        // Best-effort owned-state: dashboard is auth-only and may 401 for guests.
        let appAccess = false;
        try {
          const dashRes = await fetch('/api/account/dashboard');
          if (dashRes.ok) {
            const dash = await dashRes.json();
            appAccess = Boolean(dash?.access?.journal?.hasAccess);
          }
        } catch {
          /* guest — no owned state */
        }

        if (!cancelled) {
          setOffers(offersJson.offers);
          setHasAppAccess(appAccess);
        }
      } catch (err) {
        console.error('[useOffers] load error:', err);
        if (!cancelled) setError('Unable to load offers.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const isOwned = useCallback(
    (offer: OfferMarketingDTO): boolean => {
      // Practitioner offers aren't surfaced as owned in v1 (no client signal yet).
      if (offer.isPractitionerSupported) return false;
      return hasAppAccess;
    },
    [hasAppAccess],
  );

  return { offers, loading, error, isOwned, hasAppAccess };
}
