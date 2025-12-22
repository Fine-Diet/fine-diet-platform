/**
 * Results Content Version Constants
 * 
 * These constants control which results content pack is loaded.
 * They are DECOUPLED from assessment_version (which controls questions + scoring).
 * 
 * This separation allows:
 * - Running v1 assessments with v2 results content
 * - Running v2 assessments with v1 results content
 * - Independent rollout of results content changes
 */

/**
 * Gut Check Results Content Version
 * 
 * Controls which results JSON pack is loaded:
 * - "v1" → loads results_v1.json
 * - "v2" → loads results_v2.json
 * 
 * This is independent of assessment_version (question set + scoring logic).
 */
export const GUT_CHECK_RESULTS_CONTENT_VERSION = 'v2';

