/**
 * Configuration Loader
 * 
 * Runtime-safe loader for CMS-backed configuration documents.
 * Falls back to hard-coded defaults if CMS is unavailable or invalid.
 * 
 * Phase 2 / Step 1: Foundation config loader with safe fallbacks.
 * Phase 2 / Step 1.1: Added client-side caching and API route usage.
 */

import type { FeatureFlags, AssessmentConfig, AvatarMapping } from './types';
import {
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_ASSESSMENT_CONFIG_GUT_CHECK_V2,
  DEFAULT_ASSESSMENT_CONFIG_GUT_CHECK_V1,
  DEFAULT_AVATAR_MAPPING,
} from './defaults';
import { featureFlagsSchema, assessmentConfigSchema, avatarMappingSchema } from '../contentValidators';

// ============================================================================
// Client-Side Cache (browser only)
// ============================================================================

// In-memory cache for client-side config fetches (prevents repeated API calls)
const clientConfigCache = new Map<string, { config: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedConfig(key: string): any | null {
  if (typeof window === 'undefined') return null; // Server-side: no cache
  
  const cached = clientConfigCache.get(key);
  if (!cached) return null;
  
  // Check if cache is still valid
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    clientConfigCache.delete(key);
    return null;
  }
  
  return cached.config;
}

function setCachedConfig(key: string, config: any): void {
  if (typeof window === 'undefined') return; // Server-side: no cache
  clientConfigCache.set(key, { config, timestamp: Date.now() });
}

/**
 * Load feature flags from CMS
 * 
 * Key: feature-flags:global
 * Falls back to DEFAULT_FEATURE_FLAGS if missing/invalid.
 * 
 * Phase 2 / Step 2: Client-side uses public API route with caching.
 */
export async function getFeatureFlags(): Promise<FeatureFlags> {
  const configKey = 'feature-flags:global';

  // Client-side: Use public API route with caching
  if (typeof window !== 'undefined') {
    // Check cache first
    const cached = getCachedConfig(configKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await fetch('/api/config/feature-flags');
      
      if (!response.ok) {
        // Fallback to defaults if API fails
        return DEFAULT_FEATURE_FLAGS;
      }

      const data = await response.json();
      
      if (data.success && data.flags) {
        // Validate with Zod schema (client-side safety check)
        const validationResult = featureFlagsSchema.safeParse(data.flags);
        if (!validationResult.success) {
          console.warn('[getConfig] Invalid flags from API, using defaults:', validationResult.error);
          return DEFAULT_FEATURE_FLAGS;
        }

        // Cache the validated flags
        setCachedConfig(configKey, validationResult.data);
        return validationResult.data;
      }

      // Fallback to defaults
      return DEFAULT_FEATURE_FLAGS;
    } catch (error) {
      console.warn('[getConfig] Failed to fetch flags from API, using defaults:', error);
      return DEFAULT_FEATURE_FLAGS;
    }
  }

  // Server-side: Use Supabase directly
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', configKey)
      .eq('status', 'published')
      .single();

    if (error || !data || !data.data) {
      return DEFAULT_FEATURE_FLAGS;
    }

    // Validate data against schema
    const validationResult = featureFlagsSchema.safeParse(data.data);
    if (!validationResult.success) {
      console.warn('[getConfig] Invalid feature-flags:global data:', validationResult.error);
      return DEFAULT_FEATURE_FLAGS;
    }

    return validationResult.data;
  } catch (error) {
    // If Supabase client can't be imported, return defaults
    return DEFAULT_FEATURE_FLAGS;
  }
}

/**
 * Load assessment config from CMS
 * 
 * Key: assessment-config:{assessmentType}:{version}
 * Example: assessment-config:gut-check:2
 * 
 * Falls back to defaults based on assessment type and version.
 * 
 * Phase 2 / Step 1.1: Client-side uses public API route with caching.
 */
export async function getAssessmentConfig(
  assessmentType: 'gut-check',
  version: number
): Promise<AssessmentConfig> {
  const configKey = `assessment-config:${assessmentType}:${version}`;

  // Client-side: Use public API route with caching
  if (typeof window !== 'undefined') {
    // Check cache first
    const cached = getCachedConfig(configKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await fetch(`/api/config/assessment?type=${assessmentType}&version=${version}`);
      
      if (!response.ok) {
        // Fallback to defaults if API fails
        return getDefaultAssessmentConfig(assessmentType, version);
      }

      const data = await response.json();
      
      if (data.success && data.config) {
        // Validate with Zod schema (client-side safety check)
        const validationResult = assessmentConfigSchema.safeParse(data.config);
        if (!validationResult.success) {
          console.warn(`[getConfig] Invalid config from API, using defaults:`, validationResult.error);
          return getDefaultAssessmentConfig(assessmentType, version);
        }

        // Cache the validated config
        setCachedConfig(configKey, validationResult.data);
        return validationResult.data;
      }

      // Fallback to defaults
      return getDefaultAssessmentConfig(assessmentType, version);
    } catch (error) {
      console.warn('[getConfig] Failed to fetch config from API, using defaults:', error);
      return getDefaultAssessmentConfig(assessmentType, version);
    }
  }

  // Server-side: Use Supabase directly
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', configKey)
      .eq('status', 'published')
      .single();

    if (error || !data || !data.data) {
      return getDefaultAssessmentConfig(assessmentType, version);
    }

    // Validate data against schema
    const validationResult = assessmentConfigSchema.safeParse(data.data);
    if (!validationResult.success) {
      console.warn(`[getConfig] Invalid ${configKey} data:`, validationResult.error);
      return getDefaultAssessmentConfig(assessmentType, version);
    }

    return validationResult.data;
  } catch (error) {
    // If Supabase client can't be imported, return defaults
    return getDefaultAssessmentConfig(assessmentType, version);
  }
}

/**
 * Get default assessment config based on type and version
 * 
 * Exported for use in API route (public access).
 */
export function getDefaultAssessmentConfig(
  assessmentType: 'gut-check',
  version: number
): AssessmentConfig {
  if (assessmentType === 'gut-check' && version === 2) {
    return DEFAULT_ASSESSMENT_CONFIG_GUT_CHECK_V2;
  }

  if (assessmentType === 'gut-check' && version === 1) {
    return DEFAULT_ASSESSMENT_CONFIG_GUT_CHECK_V1;
  }

  // Fallback to v2 defaults for unknown types/versions
  return DEFAULT_ASSESSMENT_CONFIG_GUT_CHECK_V2;
}

/**
 * Load avatar mapping from CMS
 * 
 * Key: avatar-mapping:global
 * Falls back to DEFAULT_AVATAR_MAPPING if missing/invalid.
 * 
 * Phase 2 / Step 2: Client-side uses public API route with caching.
 */
export async function getAvatarMapping(): Promise<AvatarMapping> {
  const configKey = 'avatar-mapping:global';

  // Client-side: Use public API route with caching
  if (typeof window !== 'undefined') {
    // Check cache first
    const cached = getCachedConfig(configKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await fetch('/api/config/avatar-mapping');
      
      if (!response.ok) {
        // Fallback to defaults if API fails
        return DEFAULT_AVATAR_MAPPING;
      }

      const data = await response.json();
      
      if (data.success && data.mapping) {
        // Validate with Zod schema (client-side safety check)
        const validationResult = avatarMappingSchema.safeParse(data.mapping);
        if (!validationResult.success) {
          console.warn('[getConfig] Invalid mapping from API, using defaults:', validationResult.error);
          return DEFAULT_AVATAR_MAPPING;
        }

        // Cache the validated mapping
        setCachedConfig(configKey, validationResult.data);
        return validationResult.data;
      }

      // Fallback to defaults
      return DEFAULT_AVATAR_MAPPING;
    } catch (error) {
      console.warn('[getConfig] Failed to fetch mapping from API, using defaults:', error);
      return DEFAULT_AVATAR_MAPPING;
    }
  }

  // Server-side: Use Supabase directly
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', configKey)
      .eq('status', 'published')
      .single();

    if (error || !data || !data.data) {
      return DEFAULT_AVATAR_MAPPING;
    }

    // Validate data against schema
    const validationResult = avatarMappingSchema.safeParse(data.data);
    if (!validationResult.success) {
      console.warn('[getConfig] Invalid avatar-mapping:global data:', validationResult.error);
      return DEFAULT_AVATAR_MAPPING;
    }

    return validationResult.data;
  } catch (error) {
    // If Supabase client can't be imported, return defaults
    return DEFAULT_AVATAR_MAPPING;
  }
}
