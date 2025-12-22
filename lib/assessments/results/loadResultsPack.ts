/**
 * Load Results Pack
 * 
 * Loads assessment results content pack from JSON files.
 * Returns the pack object for a specific level (level1-level4).
 */

import resultsV1 from '@/content/assessments/gut-check/results_v1.json';
import resultsV2 from '@/content/assessments/gut-check/results_v2.json';

/**
 * Channel configuration for results rendering
 */
export interface ChannelConfig {
  enabled: boolean;
}

/**
 * Channels configuration (web, email, pdf)
 */
export interface ChannelsConfig {
  web?: ChannelConfig;
  email?: ChannelConfig;
  pdf?: ChannelConfig;
}

/**
 * Flow page section content
 */
export interface FlowPageSection {
  type: string;
  content: Record<string, unknown>;
}

/**
 * Flow page structure
 */
export interface FlowPage {
  pageNumber: number;
  sections: FlowPageSection[];
}

/**
 * Flow configuration (page-level structure)
 */
export interface FlowConfig {
  pages?: FlowPage[];
}

/**
 * Secondary modifiers (present but disabled)
 */
export interface SecondaryModifiers {
  enabled: boolean;
  items: unknown[];
}

/**
 * Results Pack interface
 * 
 * Core fields (required, v1 compatible):
 * - label, summary, keyPatterns, firstFocusAreas, methodPositioning
 * 
 * Extended fields (optional, v2+):
 * - copyVersion, campaignVariantId, channels, flow, secondaryModifiers
 */
export interface ResultsPack {
  // Core fields (required, v1 compatible)
  label: string;
  summary: string;
  keyPatterns: string[];
  firstFocusAreas: string[];
  methodPositioning: string;
  
  // Extended fields (optional, v2+)
  copyVersion?: string;
  campaignVariantId?: string | null;
  channels?: ChannelsConfig;
  flow?: FlowConfig;
  secondaryModifiers?: SecondaryModifiers;
}

interface ResultsPacksData {
  version: string;
  assessmentType: string;
  packs: {
    [levelId: string]: ResultsPack;
  };
}

interface LoadResultsPackInput {
  assessmentType: string;
  resultsVersion: string;
  levelId: string;
}

/**
 * Mapping of known v2 avatar IDs to their corresponding levelX keys
 * This map should be populated with actual avatar IDs used in v2 submissions
 * Example: { "avatar_v2_level1": "level1", "some_other_id": "level2", ... }
 */
const V2_AVATAR_ID_TO_LEVEL_MAP: Record<string, string> = {
  // TODO: Populate with actual v2 avatar IDs once confirmed
  // Example entries (to be replaced):
  // "v2_level1": "level1",
  // "v2_level2": "level2",
  // "v2_level3": "level3",
  // "v2_level4": "level4",
};

/**
 * Normalize levelId to levelX format
 * 
 * If levelId already matches ^level[1-4]$, returns as-is.
 * Otherwise, maps known v2 avatar IDs to their corresponding levelX key.
 * 
 * @param levelId - The avatar ID or level ID from submission
 * @param resultsVersion - The results version (used for error messages)
 * @returns Normalized levelId in levelX format
 * @throws Error if levelId cannot be normalized and doesn't match expected format
 */
function normalizeLevelId(levelId: string, resultsVersion: string): string {
  // If already in correct format, return as-is
  if (levelId.match(/^level[1-4]$/)) {
    return levelId;
  }

  // Try to map from known v2 avatar IDs
  const mapped = V2_AVATAR_ID_TO_LEVEL_MAP[levelId];
  if (mapped) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[normalizeLevelId] Mapped "${levelId}" -> "${mapped}" for resultsVersion "${resultsVersion}"`);
    }
    return mapped;
  }

  // Unknown levelId - throw clear error
  throw new Error(
    `Unable to normalize levelId "${levelId}" for resultsVersion "${resultsVersion}". ` +
    `Expected format: level1-level4, or a mapped avatar ID from V2_AVATAR_ID_TO_LEVEL_MAP. ` +
    `Received: "${levelId}"`
  );
}

/**
 * Load results pack for a given assessment type, version, and level
 */
export function loadResultsPack(input: LoadResultsPackInput): ResultsPack | null {
  const { assessmentType, resultsVersion, levelId } = input;

  // Normalize levelId before validation
  let normalizedLevelId: string;
  try {
    normalizedLevelId = normalizeLevelId(levelId, resultsVersion);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unknown error normalizing levelId');
    return null;
  }

  // Validate normalized levelId format
  if (!normalizedLevelId.match(/^level[1-4]$/)) {
    console.error(`Invalid normalized levelId: ${normalizedLevelId}. Expected level1-level4`);
    return null;
  }

  // Load the appropriate results version
  let packsData: ResultsPacksData;
  
  if (assessmentType === 'gut-check' && resultsVersion === '1') {
    packsData = resultsV1 as ResultsPacksData;
  } else if (assessmentType === 'gut-check' && (resultsVersion === '2' || resultsVersion === 'v2')) {
    packsData = resultsV2 as ResultsPacksData;
  } else {
    console.error(`Unsupported assessmentType/resultsVersion: ${assessmentType}/${resultsVersion}`);
    return null;
  }

  // Validate assessment type matches
  if (packsData.assessmentType !== assessmentType) {
    console.error(`Assessment type mismatch: expected ${assessmentType}, got ${packsData.assessmentType}`);
    return null;
  }

  // Get the pack for the requested level (use normalized levelId)
  const pack = packsData.packs[normalizedLevelId];
  
  if (!pack) {
    console.error(`Pack not found for normalized levelId: ${normalizedLevelId} (original: ${levelId})`);
    return null;
  }

  return pack;
}

// Dev verification: Normalization logging occurs in normalizeLevelId() when mapping occurs
// Check browser console in development mode to see: [normalizeLevelId] Mapped "..." -> "..."
