/**
 * Assessment v2 Scoring Engine
 * 
 * Implements the axis-based scoring system for Gut Check v2.
 * Pure functions only. Deterministic. No API calls. No UI coupling.
 */

import type { Answer } from './assessmentTypes';

// ============================================================================
// Types
// ============================================================================

export type AnswerValue = 0 | 1 | 2 | 3;

export interface AssessmentResponses {
  q1: AnswerValue;
  q2: AnswerValue;
  q3: AnswerValue;
  q4: AnswerValue;
  q5: AnswerValue;
  q6: AnswerValue;
  q7: AnswerValue;
  q8: AnswerValue;
  q9: AnswerValue;
  q10: AnswerValue;
  q11: AnswerValue;
  q12: AnswerValue;
  q13: AnswerValue;
  q14: AnswerValue;
  q15: AnswerValue;
  q16: AnswerValue;
  q17: AnswerValue;
}

type Axis = 'capacity' | 'buffer' | 'responsiveness' | 'recovery' | 'protection';
type AxisBand = 'low' | 'moderate' | 'high';
type Level = 'level1' | 'level2' | 'level3' | 'level4';
type Confidence = 'high' | 'moderate' | 'low';

interface QuestionAxisMapping {
  primary: Axis | 'integration';
  secondary?: Axis;
  reverse?: boolean; // If true, reverse the answer (3 - answer) to normalize directionality
}

// ============================================================================
// Step 1: Question Axis Contribution Maps
// ============================================================================

/**
 * V2 axis map — historical / current live scoring.
 * Do NOT modify. V2 submissions are scored with this map.
 */
const QUESTION_AXIS_MAP: Record<string, QuestionAxisMapping> = {
  // Capacity questions: higher = better baseline, so reverse to get "strain"
  q1: { primary: 'capacity', secondary: 'buffer', reverse: true },
  q2: { primary: 'capacity', reverse: true },
  q3: { primary: 'capacity', reverse: true },
  // Buffer questions: higher = better buffer/warning signs, so reverse
  q4: { primary: 'buffer', reverse: true },
  q5: { primary: 'buffer', reverse: true },
  q6: { primary: 'buffer', secondary: 'responsiveness' },
  // Responsiveness questions: higher = more reactive/strain (no reverse needed)
  q7: { primary: 'responsiveness' },
  // q8 v2: fast resolution treated as responsiveness strain (no reverse) — historical
  q8: { primary: 'responsiveness', secondary: 'recovery' },
  q9: { primary: 'responsiveness' },
  // Recovery questions: higher = better recovery, so reverse
  q10: { primary: 'recovery', reverse: true },
  q11: { primary: 'recovery', reverse: true },
  q12: { primary: 'recovery', secondary: 'capacity', reverse: true },
  // Protection questions: higher = more protection needed/strain (no reverse needed)
  q13: { primary: 'protection' },
  q14: { primary: 'protection', secondary: 'responsiveness' },
  q15: { primary: 'protection' },
  q16: { primary: 'integration' }, // Integration questions don't determine level
  q17: { primary: 'integration' },
};

/**
 * V3 axis map — corrects q8 directionality.
 *
 * q8: "How quickly do digestive issues resolve after the trigger passes?"
 * Fast resolution is a positive recovery signal, not responsiveness strain.
 * reverse: true means a high answer (Almost always resolves quickly) → low strain.
 *
 * All other mappings are identical to V2. V2 submissions are unaffected.
 */
const QUESTION_AXIS_MAP_V3: Record<string, QuestionAxisMapping> = {
  ...QUESTION_AXIS_MAP,
  q8: { primary: 'responsiveness', secondary: 'recovery', reverse: true },
};

// ============================================================================
// Step 2 & 3: Calculate Axis Bands
// ============================================================================

/**
 * Normalize answer value based on directionality
 * If reverse is true, flip the value: 0->3, 1->2, 2->1, 3->0
 */
function normalize(answer: AnswerValue, reverse?: boolean): AnswerValue {
  return reverse ? ((3 - answer) as AnswerValue) : answer;
}

/**
 * Band axis based on thresholds from config
 * 
 * Phase 2 / Step 1: Now reads thresholds from CMS config instead of hard-coded values.
 * Falls back to defaults if config is unavailable.
 */
async function bandAxisWithConfig(avg: number, thresholds: { axisBandHigh: number; axisBandModerate: number }): Promise<AxisBand> {
  if (avg >= thresholds.axisBandHigh) return 'high';
  if (avg >= thresholds.axisBandModerate) return 'moderate';
  return 'low';
}

/**
 * Legacy bandAxis function (kept for backward compatibility)
 * Now uses defaults - should not be called directly in v2 scoring
 */
function bandAxis(avg: number): AxisBand {
  // Use default thresholds (matching original hard-coded values)
  if (avg >= 2.3) return 'high';
  if (avg >= 1.3) return 'moderate';
  return 'low';
}

/**
 * Calculate axis bands from responses (exported for testing/debugging)
 * Non-breaking export - does not change existing behavior
 */
export function computeAxisBands(responses: AssessmentResponses): Record<Axis, AxisBand> {
  return calculateAxisBands(responses);
}

/**
 * Calculate axis averages (exported for debugging/testing).
 * Accepts an optional axisMap — defaults to V2 map to preserve existing behaviour.
 */
export function computeAxisAverages(
  responses: AssessmentResponses,
  axisMap: Record<string, QuestionAxisMapping> = QUESTION_AXIS_MAP
): Record<Axis, number> {
  const axisTotals: Record<Axis, number> = {
    capacity: 0,
    buffer: 0,
    responsiveness: 0,
    recovery: 0,
    protection: 0,
  };

  const axisCounts: Record<Axis, number> = {
    capacity: 0,
    buffer: 0,
    responsiveness: 0,
    recovery: 0,
    protection: 0,
  };

  for (const [questionId, answer] of Object.entries(responses) as [string, AnswerValue][]) {
    const mapping = axisMap[questionId];
    if (!mapping) continue;

    if (mapping.primary === 'integration') continue;

    const normalizedAnswer = normalize(answer, mapping.reverse);
    const axis = mapping.primary;
    axisTotals[axis] += normalizedAnswer;
    axisCounts[axis] += 1;

    if (mapping.secondary) {
      const secondaryAxis = mapping.secondary as Axis;
      axisTotals[secondaryAxis] += normalizedAnswer * 0.5;
      axisCounts[secondaryAxis] += 0.5;
    }
  }

  const axisAverages: Record<Axis, number> = {} as Record<Axis, number>;
  for (const axis of Object.keys(axisTotals) as Axis[]) {
    axisAverages[axis] = axisCounts[axis] > 0 ? axisTotals[axis] / axisCounts[axis] : 0;
  }

  return axisAverages;
}

/**
 * Calculate axis bands from responses
 * 
 * Phase 2 / Step 1: Now loads thresholds from config.
 * Falls back to defaults if config is unavailable.
 */
async function calculateAxisBandsWithConfig(
  responses: AssessmentResponses,
  thresholds: { axisBandHigh: number; axisBandModerate: number },
  axisMap: Record<string, QuestionAxisMapping> = QUESTION_AXIS_MAP
): Promise<Record<Axis, AxisBand>> {
  const axisAverages = computeAxisAverages(responses, axisMap);

  const axisBands: Record<Axis, AxisBand> = {} as Record<Axis, AxisBand>;
  for (const axis of Object.keys(axisAverages) as Axis[]) {
    axisBands[axis] = await bandAxisWithConfig(axisAverages[axis], thresholds);
  }

  return axisBands;
}

/**
 * Legacy calculateAxisBands — hard-coded thresholds, V2 axis map.
 * Kept for backward compatibility (computeAxisBands export + calculateScoringV2FromResponses).
 */
function calculateAxisBands(responses: AssessmentResponses): Record<Axis, AxisBand> {
  const axisAverages = computeAxisAverages(responses, QUESTION_AXIS_MAP);

  const axisBands: Record<Axis, AxisBand> = {} as Record<Axis, AxisBand>;
  for (const axis of Object.keys(axisAverages) as Axis[]) {
    axisBands[axis] = bandAxis(axisAverages[axis]);
  }

  return axisBands;
}

// ============================================================================
// Step 4: Primary Level Decision Tree
// ============================================================================

function determineLevel(bands: Record<Axis, AxisBand>): Level {
  // Level 4 — Protection wins
  if (
    bands.protection === 'high' &&
    (bands.capacity === 'low' || bands.buffer === 'low')
  ) {
    return 'level4';
  }

  // Level 3 — Low capacity without full protection
  if (
    bands.capacity === 'low' &&
    bands.protection !== 'high' &&
    (bands.buffer === 'low' || bands.recovery === 'low')
  ) {
    return 'level3';
  }

  // Level 2 — Reactive pattern
  if (
    bands.capacity === 'moderate' &&
    bands.buffer === 'low' &&
    bands.responsiveness === 'high' &&
    bands.recovery !== 'low'
  ) {
    return 'level2';
  }

  // Level 1 — Stable under load
  if (
    bands.capacity !== 'low' &&
    bands.buffer !== 'low' &&
    bands.recovery !== 'low' &&
    bands.protection !== 'high'
  ) {
    return 'level1';
  }

  // Conservative fallback
  return 'level3';
}

// ============================================================================
// Step 5: Secondary Modifiers
// ============================================================================

function determineModifier(bands: Record<Axis, AxisBand>): string | null {
  if (bands.responsiveness === 'high') return 'high_responsiveness';
  if (bands.recovery === 'low') return 'poor_recovery';
  if (bands.buffer === 'low') return 'narrow_buffer';
  return null;
}

// ============================================================================
// Step 6: Confidence Calculation
// ============================================================================

function calculateConfidence(responses: AssessmentResponses): Confidence {
  const integrationAnswers = [responses.q16, responses.q17];
  const variance = Math.abs(integrationAnswers[0] - integrationAnswers[1]);

  if (variance === 0) return 'high';
  if (variance === 1) return 'moderate';
  return 'low';
}

// ============================================================================
// Helper: Convert Answer[] to AssessmentResponses
// ============================================================================

/**
 * Converts Answer[] format (questionId + optionId) to responses format {q1: 0, q2: 1, ...}
 * For v2: Uses explicit `value` field from options
 * For v1 fallback: Uses option index (first option = 0, second = 1, etc.)
 * 
 * This is exported for use in submission payload
 */
export function convertAnswersToResponsesMap(
  answers: Answer[],
  config: { questions: Array<{ id: string; options: Array<{ id: string; value?: number }> }> }
): Record<string, number> {
  const responses: Record<string, number> = {};

  answers.forEach((answer) => {
    const question = config.questions.find((q) => q.id === answer.questionId);
    if (!question) return;

    const option = question.options.find((o) => o.id === answer.optionId);
    if (!option) return;

    // Use explicit value if available (v2), otherwise use index (v1 fallback)
    let value: number;
    if (typeof option.value === 'number') {
      // v2: explicit value
      value = Math.min(Math.max(option.value, 0), 3);
    } else {
      // v1 fallback: use index
      const optionIndex = question.options.findIndex((o) => o.id === answer.optionId);
      value = Math.min(optionIndex, 3);
    }

    // Store as q1, q2, etc.
    if (answer.questionId.match(/^q\d+$/)) {
      responses[answer.questionId] = value;
    }
  });

  return responses;
}

/**
 * Converts Answer[] format (questionId + optionId) to AssessmentResponses format
 * For v2: Uses explicit `value` field from options
 * For v1 fallback: Uses option index (first option = 0, second = 1, etc.)
 */
function convertAnswersToResponses(answers: Answer[], config: { questions: Array<{ id: string; options: Array<{ id: string; value?: number }> }> }): AssessmentResponses {
  const responses: Partial<AssessmentResponses> = {};

  answers.forEach((answer) => {
    const question = config.questions.find((q) => q.id === answer.questionId);
    if (!question) return;

    const option = question.options.find((o) => o.id === answer.optionId);
    if (!option) return;

    // Use explicit value if available (v2), otherwise use index (v1 fallback)
    let value: AnswerValue;
    if (typeof option.value === 'number') {
      // v2: explicit value
      value = Math.min(Math.max(option.value, 0), 3) as AnswerValue;
    } else {
      // v1 fallback: use index
      const optionIndex = question.options.findIndex((o) => o.id === answer.optionId);
      value = Math.min(optionIndex, 3) as AnswerValue;
    }

    const questionKey = answer.questionId as keyof AssessmentResponses;
    if (questionKey.startsWith('q') && questionKey.match(/^q\d+$/)) {
      responses[questionKey] = value;
    }
  });

  // Ensure all questions q1-q17 are present (default to 0 if missing)
  const completeResponses: AssessmentResponses = {
    q1: responses.q1 ?? 0,
    q2: responses.q2 ?? 0,
    q3: responses.q3 ?? 0,
    q4: responses.q4 ?? 0,
    q5: responses.q5 ?? 0,
    q6: responses.q6 ?? 0,
    q7: responses.q7 ?? 0,
    q8: responses.q8 ?? 0,
    q9: responses.q9 ?? 0,
    q10: responses.q10 ?? 0,
    q11: responses.q11 ?? 0,
    q12: responses.q12 ?? 0,
    q13: responses.q13 ?? 0,
    q14: responses.q14 ?? 0,
    q15: responses.q15 ?? 0,
    q16: responses.q16 ?? 0,
    q17: responses.q17 ?? 0,
  };

  return completeResponses;
}

// ============================================================================
// Main Scoring Function
// ============================================================================

export interface ScoringResultV2 {
  assessment_version: 2 | 3;
  primary_level: Level;
  secondary_modifier: string | null;
  confidence: Confidence;
  axisBands?: Record<Axis, AxisBand>;
}

// ============================================================================
// Internal: shared async scoring pipeline
// ============================================================================

/**
 * Core async scoring pipeline, parameterised by axis map and version tag.
 * V2 and V3 public functions are thin wrappers around this.
 */
async function runScoringPipeline(
  answers: Answer[],
  config: { questions: Array<{ id: string; options: Array<{ id: string }> }> },
  axisMap: Record<string, QuestionAxisMapping>,
  assessmentVersion: 2 | 3,
  cmsConfigVersion: number
): Promise<ScoringResultV2> {
  const responses = convertAnswersToResponses(answers, config);

  let thresholds: { axisBandHigh: number; axisBandModerate: number };
  try {
    const { getAssessmentConfig } = await import('@/lib/config/getConfig');
    // Try the exact version first; fall back to v2 config if not found.
    let assessmentConfig;
    try {
      assessmentConfig = await getAssessmentConfig('gut-check', cmsConfigVersion);
    } catch {
      assessmentConfig = await getAssessmentConfig('gut-check', 2);
    }
    const configThresholds = assessmentConfig.scoring.thresholds;
    thresholds = {
      axisBandHigh: configThresholds.axisBandHigh ?? 2.3,
      axisBandModerate: configThresholds.axisBandModerate ?? 1.3,
    };
  } catch (error) {
    console.warn(`[scoringPipeline v${assessmentVersion}] Failed to load config, using defaults:`, error);
    thresholds = { axisBandHigh: 2.3, axisBandModerate: 1.3 };
  }

  const axisBands = await calculateAxisBandsWithConfig(responses, thresholds, axisMap);
  const primary_level = determineLevel(axisBands);
  const secondary_modifier = determineModifier(axisBands);
  const confidence = calculateConfidence(responses);

  return {
    assessment_version: assessmentVersion,
    primary_level,
    secondary_modifier,
    confidence,
    axisBands,
  };
}

// ============================================================================
// V2 public API
// ============================================================================

/**
 * Calculate v2 scoring from answers.
 * Uses QUESTION_AXIS_MAP (v2 — historical / current live).
 * Do NOT change the axis map used here; v2 submissions must remain stable.
 */
export async function calculateScoringV2(
  answers: Answer[],
  config: { questions: Array<{ id: string; options: Array<{ id: string }> }> }
): Promise<ScoringResultV2> {
  return runScoringPipeline(answers, config, QUESTION_AXIS_MAP, 2, 2);
}

/**
 * Calculate v2 scoring directly from AssessmentResponses (for testing).
 * Uses hard-coded thresholds and V2 axis map.
 */
export function calculateScoringV2FromResponses(responses: AssessmentResponses): ScoringResultV2 {
  const axisBands = calculateAxisBands(responses);
  const primary_level = determineLevel(axisBands);
  const secondary_modifier = determineModifier(axisBands);
  const confidence = calculateConfidence(responses);

  return {
    assessment_version: 2,
    primary_level,
    secondary_modifier,
    confidence,
    axisBands,
  };
}

// ============================================================================
// V3 public API
// ============================================================================

/**
 * Calculate v3 scoring from answers.
 * Uses QUESTION_AXIS_MAP_V3: identical to V2 except q8 has reverse: true.
 *
 * q8 correction: fast issue resolution is now treated as a positive recovery
 * signal (low strain) rather than a responsiveness strain signal.
 *
 * Historical v2 submissions are unaffected — this engine is only called when
 * assessmentVersion === 3.
 */
export async function calculateScoringV3(
  answers: Answer[],
  config: { questions: Array<{ id: string; options: Array<{ id: string }> }> }
): Promise<ScoringResultV2> {
  return runScoringPipeline(answers, config, QUESTION_AXIS_MAP_V3, 3, 3);
}

/**
 * Calculate v3 scoring directly from AssessmentResponses (for testing).
 * Uses hard-coded thresholds and V3 axis map.
 */
export function calculateScoringV3FromResponses(responses: AssessmentResponses): ScoringResultV2 {
  const axisAverages = computeAxisAverages(responses, QUESTION_AXIS_MAP_V3);

  const axisBands: Record<Axis, AxisBand> = {} as Record<Axis, AxisBand>;
  for (const axis of Object.keys(axisAverages) as Axis[]) {
    axisBands[axis] = bandAxis(axisAverages[axis]);
  }

  const primary_level = determineLevel(axisBands);
  const secondary_modifier = determineModifier(axisBands);
  const confidence = calculateConfidence(responses);

  return {
    assessment_version: 3,
    primary_level,
    secondary_modifier,
    confidence,
    axisBands,
  };
}

