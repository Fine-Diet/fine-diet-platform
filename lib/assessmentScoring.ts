/**
 * Client-Side Scoring Engine
 * 
 * Pure functions only. Deterministic. No API calls. No UI coupling.
 * Scoring weights and thresholds must be config-driven, not hardcoded.
 */

import type {
  Answer,
  AssessmentConfig,
  ScoreMap,
  AvatarId,
} from './assessmentTypes';

// ============================================================================
// Core Scoring Functions
// ============================================================================

/**
 * Calculate raw score map from answers
 */
export function calculateScoreMap(
  answers: Answer[],
  config: AssessmentConfig
): ScoreMap {
  const scoreMap: ScoreMap = {};

  // Initialize all avatars to 0
  config.avatars.forEach((avatarId) => {
    scoreMap[avatarId] = 0;
  });

  // Process each answer
  answers.forEach((answer) => {
    const question = config.questions.find((q) => q.id === answer.questionId);
    if (!question) return;

    const option = question.options.find((o) => o.id === answer.optionId);
    if (!option || !option.scoreWeights) return;

    // Add weights to score map
    Object.entries(option.scoreWeights).forEach(([avatarId, weight]) => {
      if (config.avatars.includes(avatarId)) {
        scoreMap[avatarId] = (scoreMap[avatarId] || 0) + weight;
      }
    });
  });

  return scoreMap;
}

/**
 * Normalize score map to 0-1 range
 */
export function normalizeScoreMap(scoreMap: ScoreMap): ScoreMap {
  const values = Object.values(scoreMap);
  const max = Math.max(...values, 1); // Avoid division by zero
  const min = Math.min(...values, 0);

  const range = max - min;
  if (range === 0) {
    // All scores are the same, return equal distribution
    const normalized: ScoreMap = {};
    const equalValue = 1 / Object.keys(scoreMap).length;
    Object.keys(scoreMap).forEach((avatarId) => {
      normalized[avatarId] = equalValue;
    });
    return normalized;
  }

  const normalized: ScoreMap = {};
  Object.entries(scoreMap).forEach(([avatarId, score]) => {
    normalized[avatarId] = (score - min) / range;
  });

  return normalized;
}

/**
 * Determine primary avatar (highest normalized score)
 */
export function getPrimaryAvatar(normalizedScoreMap: ScoreMap): AvatarId {
  let maxScore = -1;
  let primaryAvatar: AvatarId = '';

  Object.entries(normalizedScoreMap).forEach(([avatarId, score]) => {
    if (score > maxScore) {
      maxScore = score;
      primaryAvatar = avatarId;
    }
  });

  return primaryAvatar;
}

/**
 * Determine secondary avatar (if within threshold)
 */
export function getSecondaryAvatar(
  normalizedScoreMap: ScoreMap,
  primaryAvatar: AvatarId,
  threshold: number
): AvatarId | undefined {
  const primaryScore = normalizedScoreMap[primaryAvatar] || 0;

  let secondaryAvatar: AvatarId | undefined;
  let maxSecondaryScore = -1;

  Object.entries(normalizedScoreMap).forEach(([avatarId, score]) => {
    if (avatarId === primaryAvatar) return;

    // Secondary must be within threshold of primary
    const scoreDiff = primaryScore - score;
    if (scoreDiff <= threshold && score > maxSecondaryScore) {
      maxSecondaryScore = score;
      secondaryAvatar = avatarId;
    }
  });

  return secondaryAvatar;
}

/**
 * Calculate confidence score (0-1)
 * Based on how clear the primary avatar is vs others
 */
export function calculateConfidenceScore(
  normalizedScoreMap: ScoreMap,
  primaryAvatar: AvatarId,
  thresholds: { high: number; medium: number }
): number {
  const primaryScore = normalizedScoreMap[primaryAvatar] || 0;
  const otherScores = Object.entries(normalizedScoreMap)
    .filter(([avatarId]) => avatarId !== primaryAvatar)
    .map(([, score]) => score);

  if (otherScores.length === 0) return 1;

  const maxOtherScore = Math.max(...otherScores);
  const gap = primaryScore - maxOtherScore;

  // High confidence: gap > high threshold
  if (gap >= thresholds.high) return 1;

  // Medium confidence: gap between medium and high
  if (gap >= thresholds.medium) {
    const normalizedGap = (gap - thresholds.medium) / (thresholds.high - thresholds.medium);
    return 0.5 + normalizedGap * 0.5; // 0.5 to 1.0
  }

  // Low confidence: gap < medium threshold
  const normalizedGap = Math.max(0, gap / thresholds.medium);
  return normalizedGap * 0.5; // 0 to 0.5
}

// ============================================================================
// Main Scoring Function
// ============================================================================

export interface ScoringResult {
  scoreMap: ScoreMap;
  normalizedScoreMap: ScoreMap;
  primaryAvatar: AvatarId;
  secondaryAvatar?: AvatarId;
  confidenceScore: number;
}

/**
 * Calculate all scoring outputs from answers and config
 */
export function calculateScoring(
  answers: Answer[],
  config: AssessmentConfig
): ScoringResult {
  // Calculate raw scores
  const scoreMap = calculateScoreMap(answers, config);

  // Normalize scores
  const normalizedScoreMap = normalizeScoreMap(scoreMap);

  // Determine primary avatar
  const primaryAvatar = getPrimaryAvatar(normalizedScoreMap);

  // Determine secondary avatar (if within threshold)
  const secondaryAvatar = getSecondaryAvatar(
    normalizedScoreMap,
    primaryAvatar,
    config.scoring.thresholds.secondaryAvatarThreshold
  );

  // Calculate confidence score
  const confidenceScore = calculateConfidenceScore(
    normalizedScoreMap,
    primaryAvatar,
    config.scoring.thresholds.confidenceThresholds
  );

  return {
    scoreMap,
    normalizedScoreMap,
    primaryAvatar,
    secondaryAvatar,
    confidenceScore,
  };
}

