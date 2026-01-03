/**
 * Configuration Types
 * 
 * TypeScript interfaces for CMS-backed configuration documents.
 * Phase 2 / Step 1: Foundation types for config management.
 */

/**
 * Feature Flags Configuration
 * 
 * Phase 2 / Step 2: Extended with additional flags.
 */
export interface FeatureFlags {
  enableN8nWebhook: boolean;
  enableNewResultsFlow?: boolean;
  allowUnlistedYoutubeEmbeds?: boolean; // Default true (current behavior allows any YouTube URL)
}

/**
 * Assessment Configuration
 * 
 * Phase 2 / Step 1: v2 scoring thresholds (gut-check v2)
 * Phase 2 / Step 3: Added v1 confidence thresholds (global)
 */
export interface AssessmentConfig {
  scoring: {
    thresholds: {
      // Axis band thresholds (for v2 scoring)
      axisBandHigh?: number; // >= this value = 'high' band
      axisBandModerate?: number; // >= this value = 'moderate' band, else 'low'
      // Confidence thresholds (for v1 scoring, global)
      confidenceThresholds?: {
        high: number; // High confidence if gap >= this value
        medium: number; // Medium confidence if gap >= this value
      };
      // Secondary avatar threshold (for v1 scoring, global)
      secondaryAvatarThreshold?: number; // Show secondary if within this threshold of primary
    };
  };
}

/**
 * Avatar Mapping Configuration
 * 
 * Maps avatar IDs to display keys or other identifiers.
 * Not wired into runtime yet (Step 1 foundation only).
 */
export interface AvatarMapping {
  defaultAvatarKey: string;
  mappings: Record<string, string>;
}
