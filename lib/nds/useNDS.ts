/**
 * useNDS - React hook for fetching daily NDS score
 * 
 * Fetches the daily Nutrition Density Score from the API.
 * Caches results and handles loading/error states.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { NDSSubscores } from './types';

// ============================================================================
// Types
// ============================================================================

export interface NDSData {
  date_local: string;
  person_id: string;
  nds_score_100: number;
  subscores_10: {
    wfr: number;
    ps: number;
    pnd: number;
    fp: number;
    as: number;
    mnc: number;
    ob: number;
  };
  nds_version: string;
  classifier_version: string;
}

export interface UseNDSOptions {
  /** Date in YYYY-MM-DD format. Defaults to today. */
  dateLocal?: string;
  /** Person ID. Defaults to authenticated user. */
  personId?: string;
  /** Whether to fetch automatically. Defaults to true. */
  autoFetch?: boolean;
  /** Whether the NDS feature is enabled. If false, won't fetch. */
  enabled?: boolean;
}

export interface UseNDSResult {
  data: NDSData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Get today's date in YYYY-MM-DD format using browser's local timezone.
 */
function getTodayDateLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Hook for fetching and caching daily NDS score.
 * Uses session cookie for authentication (no token needed).
 */
export function useNDS(options: UseNDSOptions = {}): UseNDSResult {
  const {
    dateLocal = getTodayDateLocal(),
    personId,
    autoFetch = true,
    enabled = true,
  } = options;

  const [data, setData] = useState<NDSData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Track current request to prevent stale updates
  const fetchIdRef = useRef(0);

  const fetchNDS = useCallback(async () => {
    if (!enabled) {
      return;
    }

    const currentFetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (dateLocal) params.set('date_local', dateLocal);
      if (personId) params.set('person_id', personId);

      // Uses session cookie for auth (credentials: 'include' is default for same-origin)
      const response = await fetch(`/api/journal/nds?${params.toString()}`);

      if (currentFetchId !== fetchIdRef.current) return; // Stale request

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const ndsData = await response.json();
      
      if (currentFetchId === fetchIdRef.current) {
        setData(ndsData);
        setError(null);
      }
    } catch (err) {
      if (currentFetchId === fetchIdRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch NDS');
        setData(null);
      }
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [dateLocal, personId, enabled]);

  // Auto-fetch on mount and when dependencies change
  useEffect(() => {
    if (autoFetch && enabled) {
      fetchNDS();
    }
  }, [autoFetch, enabled, fetchNDS]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchNDS,
  };
}

// ============================================================================
// Helper Functions for UI
// ============================================================================

/**
 * Get a color class for NDS score.
 */
export function getNDSColorClass(score: number): string {
  if (score >= 80) return 'text-green-500';
  if (score >= 60) return 'text-lime-500';
  if (score >= 40) return 'text-yellow-500';
  if (score >= 20) return 'text-orange-500';
  return 'text-red-500';
}

/**
 * Get a label for NDS score.
 */
export function getNDSLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  if (score >= 20) return 'Needs Work';
  return 'Poor';
}

/**
 * Get subscore display info.
 */
export const SUBSCORE_INFO = {
  wfr: { label: 'Whole Foods', shortLabel: 'WFR', description: 'Ratio of whole to processed foods' },
  ps: { label: 'Protein', shortLabel: 'PS', description: 'Protein quality and quantity' },
  pnd: { label: 'Plant Variety', shortLabel: 'PND', description: 'Variety of plant colors' },
  fp: { label: 'Fiber', shortLabel: 'FP', description: 'Daily fiber progress' },
  as: { label: 'Added Sugar', shortLabel: 'AS', description: 'Lower sugar = higher score' },
  mnc: { label: 'Micronutrients', shortLabel: 'MNC', description: 'Vitamin/mineral coverage' },
  ob: { label: 'Omega Balance', shortLabel: 'OB', description: 'Omega-3 to Omega-6 ratio' },
} as const;

/**
 * Get color class for subscore value (0-10).
 */
export function getSubscoreColorClass(score: number): string {
  if (score >= 8) return 'bg-green-500';
  if (score >= 6) return 'bg-lime-500';
  if (score >= 4) return 'bg-yellow-500';
  if (score >= 2) return 'bg-orange-500';
  return 'bg-red-500';
}
