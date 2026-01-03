/**
 * Configuration Defaults
 * 
 * Hard-coded defaults that match current runtime behavior exactly.
 * These are used when CMS config is missing or invalid.
 * 
 * Phase 2 / Step 1: Foundation defaults matching existing behavior.
 */

import type { FeatureFlags, AssessmentConfig, AvatarMapping } from './types';

/**
 * Default Feature Flags
 * 
 * Matches current behavior:
 * - N8N webhook is enabled (based on existing code patterns)
 * - New results flow defaults to false (if not explicitly enabled)
 * - YouTube embeds allow unlisted videos (current behavior allows any YouTube URL)
 */
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  enableN8nWebhook: true,
  enableNewResultsFlow: false,
  allowUnlistedYoutubeEmbeds: true, // Current behavior: any YouTube URL is allowed
};

/**
 * Default Assessment Config for Gut Check v2
 * 
 * Thresholds match current hard-coded values in lib/assessmentScoringV2.ts:
 * - bandAxis function: if (avg >= 2.3) return 'high'
 * - bandAxis function: if (avg >= 1.3) return 'moderate'
 * 
 * These thresholds determine axis band classification:
 * - high: >= axisBandHigh (2.3)
 * - moderate: >= axisBandModerate (1.3) but < axisBandHigh
 * - low: < axisBandModerate (1.3)
 */
export const DEFAULT_ASSESSMENT_CONFIG_GUT_CHECK_V2: AssessmentConfig = {
  scoring: {
    thresholds: {
      axisBandHigh: 2.3,
      axisBandModerate: 1.3,
    },
  },
};

/**
 * Default Assessment Config for Gut Check v1
 * 
 * Phase 2 / Step 4: Confidence thresholds for v1 scoring.
 * Matches current hard-coded values in lib/assessmentConfig.ts (gutCheckConfig):
 * - high: 0.3 (High confidence if gap >= 30%)
 * - medium: 0.15 (Medium confidence if gap >= 15%)
 * - secondaryAvatarThreshold: 0.15 (Show secondary if within 15% of primary)
 * 
 * Legacy values preserved exactly:
 * - secondaryAvatarThreshold: 0.15 (line 134 in gutCheckConfig)
 * - confidenceThresholds.high: 0.3 (line 136 in gutCheckConfig)
 * - confidenceThresholds.medium: 0.15 (line 137 in gutCheckConfig)
 */
export const DEFAULT_ASSESSMENT_CONFIG_GUT_CHECK_V1: AssessmentConfig = {
  scoring: {
    thresholds: {
      confidenceThresholds: {
        high: 0.3,
        medium: 0.15,
      },
      secondaryAvatarThreshold: 0.15,
    },
  },
};

/**
 * Default Avatar Mapping
 * 
 * Phase 2 / Step 3: Default uses level1 (valid levelX format for results packs).
 * Empty mappings by default - admins can add custom mappings.
 */
export const DEFAULT_AVATAR_MAPPING: AvatarMapping = {
  defaultAvatarKey: 'level1', // Valid levelX format for results pack loading
  mappings: {},
};
