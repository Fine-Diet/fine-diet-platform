/**
 * Type definitions for Fine Diet Mini-Assessments Funnel System
 */

import type { QuestionSetRef } from './assessments/questions/resolveQuestionSet';

// ============================================================================
// Core Types
// ============================================================================

// 'gut-check' is the current known assessment type.
// string & {} widens the union to accept future slugs while preserving
// 'gut-check' as a named member for autocomplete and switch exhaustion.
export type AssessmentType = 'gut-check' | (string & {});

export type AvatarId = string;

export type QuestionId = string;

export type OptionId = string;

export interface Answer {
  questionId: QuestionId;
  optionId: OptionId;
}

export interface ScoreMap {
  [avatarId: string]: number;
}

export type AssessmentStatus = 'idle' | 'in_progress' | 'completed' | 'submitting';

// ============================================================================
// Assessment State
// ============================================================================

export interface AssessmentState {
  assessmentType: AssessmentType;
  assessmentVersion: number;
  sessionId: string;

  currentQuestionIndex: number;
  answers: Answer[];

  scoreMap: ScoreMap;
  normalizedScoreMap: ScoreMap;
  primaryAvatar: AvatarId;
  secondaryAvatar?: AvatarId;
  confidenceScore: number;
  /** Scoring engine output: e.g. 'light', 'moderate', 'heavy' (v2/v3 only) */
  secondaryModifier?: string;
  /** Human-readable confidence band: 'high' | 'moderate' | 'low' (v2/v3 only) */
  confidenceLabel?: string;

  status: AssessmentStatus;
}

// ============================================================================
// Question Configuration
// ============================================================================

export interface QuestionOption {
  id: OptionId;
  label: string;
  value?: number; // For v2: explicit value (0-3) instead of deriving from index
  scoreWeights?: {
    [avatarId: string]: number;
  };
}

export interface QuestionConfig {
  id: QuestionId;
  text: string;
  options: QuestionOption[];
}

export interface AssessmentSection {
  id: string;
  title: string;
  questionIds: string[];
}

export interface AssessmentConfig {
  assessmentType: AssessmentType;
  assessmentVersion: number;
  sections?: AssessmentSection[]; // Optional for v1, required for v2
  questions: QuestionConfig[];
  avatars: AvatarId[];
  scoring: {
    thresholds: {
      secondaryAvatarThreshold: number; // Minimum normalized score to show secondary avatar
      confidenceThresholds: {
        high: number;
        medium: number;
      };
    };
  };
}

// ============================================================================
// API Types
// ============================================================================

export interface SubmissionPayload {
  submissionId: string; // Client-generated UUID for idempotency
  assessmentType: AssessmentType;
  assessmentVersion: number;
  sessionId: string;
  userId?: string;
  email?: string;
  answers: Answer[];
  responses?: Record<string, number>; // For v2: { q1: 0, q2: 1, ... q17: 3 }
  scoreMap: ScoreMap;
  normalizedScoreMap: ScoreMap;
  primaryAvatar: AvatarId;
  secondaryAvatar?: AvatarId;
  confidenceScore: number;
  /** Scoring-engine extras forwarded from the client (v2/v3 only) */
  secondaryModifier?: string;
  /** Human-readable confidence band forwarded from the client (v2/v3 only) */
  confidenceLabel?: string;
  /**
   * When true, the submission originated from a runtime preview run. The submit
   * endpoint refuses to persist preview submissions; this flag exists so the
   * guard is server-side, not client-side only.
   */
  isPreview?: boolean;
  metadata?: {
    utm?: Record<string, string>;
    referrer?: string;
    page?: string;
    device?: string;
    questionsRef?: QuestionSetRef;
    secondary_modifier?: string;
    confidence_label?: string;
  };
}

export interface SubmissionResponse {
  success: boolean;
  submissionId?: string;
  claimToken?: string; // Only present for guest submissions
  error?: string;
}

// ============================================================================
// Avatar Insights
// ============================================================================

export interface AvatarInsight {
  id: string;
  assessmentType: AssessmentType;
  avatarId: AvatarId;
  label: string;
  summary: string;
  keyPatterns?: string[];
  firstFocusAreas?: string[];
  methodPositioning?: string;
}

// ============================================================================
// Analytics Events
// ============================================================================

export interface AssessmentEvent {
  event: string;
  assessmentType: AssessmentType;
  assessmentVersion: number;
  sessionId: string;
  primaryAvatar?: AvatarId;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

