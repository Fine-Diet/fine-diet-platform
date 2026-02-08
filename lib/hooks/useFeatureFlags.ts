/**
 * useFeatureFlags - Client-side hook for feature flags
 * 
 * Fetches and caches feature flags from the API.
 */

'use client';

import { useState, useEffect } from 'react';
import type { FeatureFlags } from '@/lib/config/types';
import { DEFAULT_FEATURE_FLAGS } from '@/lib/config/defaults';

interface UseFeatureFlagsResult {
  flags: FeatureFlags;
  isLoading: boolean;
  error: string | null;
}

// Simple in-memory cache for the session
let cachedFlags: FeatureFlags | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Hook to access feature flags on the client.
 * Returns defaults while loading or on error.
 */
export function useFeatureFlags(): UseFeatureFlagsResult {
  const [flags, setFlags] = useState<FeatureFlags>(cachedFlags ?? DEFAULT_FEATURE_FLAGS);
  const [isLoading, setIsLoading] = useState(!cachedFlags);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if cache is still valid
    if (cachedFlags && Date.now() - cacheTimestamp < CACHE_TTL) {
      setFlags(cachedFlags);
      setIsLoading(false);
      return;
    }

    // Fetch fresh flags
    (async () => {
      try {
        const response = await fetch('/api/config/feature-flags');
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        if (data.success && data.flags) {
          const merged = { ...DEFAULT_FEATURE_FLAGS, ...data.flags };
          cachedFlags = merged;
          cacheTimestamp = Date.now();
          setFlags(merged);
        }
      } catch (err) {
        console.warn('[useFeatureFlags] Error fetching flags:', err);
        setError(err instanceof Error ? err.message : 'Failed to load flags');
        // Keep using defaults
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return { flags, isLoading, error };
}

/**
 * Hook for a single feature flag.
 * Returns false (disabled) while loading or on error.
 */
export function useFeatureFlag(flagName: keyof FeatureFlags): boolean {
  const { flags, isLoading } = useFeatureFlags();
  
  if (isLoading) return false;
  
  const value = flags[flagName];
  return typeof value === 'boolean' ? value : false;
}
