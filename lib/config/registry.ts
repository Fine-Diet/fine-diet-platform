/**
 * Config Registry
 * 
 * Central registry of all CMS-backed configuration keys.
 * Prevents key sprawl and provides a single source of truth for:
 * - Allowed keys and key patterns
 * - Schema validators
 * - Default getters
 * - Public read API availability
 * - Admin editor routes
 * 
 * Phase 2 / Step 3: Config registry for guardrails.
 * 
 * Key Naming Conventions:
 * - feature-flags:global - Global feature flags
 * - avatar-mapping:global - Global avatar key mappings
 * - assessment-config:{type}:{version} - Assessment-specific config (e.g., assessment-config:gut-check:2, assessment-config:gut-check:1)
 * 
 * How to Add a New Config Safely:
 * 1. Add the config type to lib/config/types.ts
 * 2. Add defaults to lib/config/defaults.ts
 * 3. Add Zod schema to lib/contentValidators.ts
 * 4. Add loader function to lib/config/getConfig.ts
 * 5. Add registry entry here with all metadata
 * 6. Create admin UI (if user-editable) and API routes
 * 7. Update API route guards to check registry
 */

import type { FeatureFlags, AssessmentConfig, AvatarMapping } from './types';
import {
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_ASSESSMENT_CONFIG_GUT_CHECK_V2,
  DEFAULT_ASSESSMENT_CONFIG_GUT_CHECK_V1,
  DEFAULT_AVATAR_MAPPING,
} from './defaults';
import {
  featureFlagsSchema,
  assessmentConfigSchema,
  avatarMappingSchema,
} from '../contentValidators';

export interface ConfigRegistryEntry {
  /** Config key pattern (exact match or pattern) */
  keyPattern: string | ((key: string) => boolean);
  /** Zod schema for validation */
  schema: any;
  /** Default getter function */
  getDefault: () => any;
  /** Whether this config has a public read API */
  isPublicReadable: boolean;
  /** Admin editor route path (null if no UI) */
  adminEditorPath: string | null;
  /** Description for documentation */
  description: string;
}

/**
 * Config Registry
 * 
 * All allowed configuration keys and their metadata.
 */
export const CONFIG_REGISTRY: Record<string, ConfigRegistryEntry> = {
  'feature-flags:global': {
    keyPattern: 'feature-flags:global',
    schema: featureFlagsSchema,
    getDefault: () => DEFAULT_FEATURE_FLAGS,
    isPublicReadable: true,
    adminEditorPath: '/admin/config/feature-flags',
    description: 'Global feature flags (N8N webhook, new results flow, YouTube embeds)',
  },
  'avatar-mapping:global': {
    keyPattern: 'avatar-mapping:global',
    schema: avatarMappingSchema,
    getDefault: () => DEFAULT_AVATAR_MAPPING,
    isPublicReadable: true,
    adminEditorPath: '/admin/config/avatar-mapping',
    description: 'Global avatar key mappings (result keys -> display keys)',
  },
  'assessment-config:gut-check:2': {
    keyPattern: 'assessment-config:gut-check:2',
    schema: assessmentConfigSchema,
    getDefault: () => DEFAULT_ASSESSMENT_CONFIG_GUT_CHECK_V2,
    isPublicReadable: true,
    adminEditorPath: '/admin/config/assessments/gut-check-v2',
    description: 'Gut Check v2 scoring thresholds (axis band classification)',
  },
  'assessment-config:gut-check:1': {
    keyPattern: 'assessment-config:gut-check:1',
    schema: assessmentConfigSchema,
    getDefault: () => DEFAULT_ASSESSMENT_CONFIG_GUT_CHECK_V1,
    isPublicReadable: true,
    adminEditorPath: '/admin/config/assessments/gut-check-v1',
    description: 'Gut Check v1 scoring thresholds (confidence thresholds, secondary avatar threshold)',
  },
};

/**
 * Check if a config key is registered and allowed
 */
export function isConfigKeyAllowed(key: string): boolean {
  return Object.values(CONFIG_REGISTRY).some((entry) => {
    if (typeof entry.keyPattern === 'string') {
      return entry.keyPattern === key;
    } else {
      return entry.keyPattern(key);
    }
  });
}

/**
 * Get registry entry for a config key
 */
export function getRegistryEntry(key: string): ConfigRegistryEntry | null {
  const entry = Object.values(CONFIG_REGISTRY).find((entry) => {
    if (typeof entry.keyPattern === 'string') {
      return entry.keyPattern === key;
    } else {
      return entry.keyPattern(key);
    }
  });
  return entry || null;
}

/**
 * Get all public-readable config keys
 */
export function getPublicReadableKeys(): string[] {
  return Object.keys(CONFIG_REGISTRY).filter(
    (key) => CONFIG_REGISTRY[key].isPublicReadable
  );
}
