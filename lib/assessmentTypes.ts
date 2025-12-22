/**
 * Type definitions for Fine Diet Mini-Assessments Funnel System
 */

// ============================================================================
// Core Types
// ============================================================================

export type AssessmentType = 'gut-check';

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
  metadata?: {
    utm?: Record<string, string>;
    referrer?: string;
    page?: string;
    device?: string;
  };
}

export interface SubmissionResponse {
  success: boolean;
  submissionId?: string;
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

