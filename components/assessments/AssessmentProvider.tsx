/**
 * Assessment Context Provider
 * Manages assessment state and provides it to child components
 */

import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef, useState } from 'react';
import type { AssessmentState, Answer, AssessmentConfig } from '@/lib/assessmentTypes';
import type { ScoringResult } from '@/lib/assessmentScoring';
import { scoreAssessmentRun } from '@/lib/assessments/scoring';
import { convertAnswersToResponsesMap } from '@/lib/assessmentScoringV2';
import { getOrCreateSessionId, getOrCreatePreviewSessionId, generateUUID } from '@/lib/assessmentSession';
import {
  trackAssessmentStarted,
  trackAssessmentCompleted,
  trackAssessmentAbandoned,
} from '@/lib/assessmentAnalytics';

// ============================================================================
// Context
// ============================================================================

interface AssessmentContextValue {
  state: AssessmentState;
  config: AssessmentConfig;
  selectOption: (optionId: string) => void;
  goToNextQuestion: () => void;
  goToPreviousQuestion: () => void;
  submitAssessment: () => Promise<void>;
  abandonAssessment: () => void;
  /**
   * Present when scoring dispatch failed for this run (Packet N). When set,
   * scoring is unavailable and submission is blocked. The runtime surfaces
   * this so a UI can render an explicit scoring-unavailable state instead of
   * silently degrading to empty scores.
   */
  scoringError: AssessmentState['scoringError'];
  /** Set when POST /api/assessments/submit fails. Cleared on retry or answer change. */
  submissionError: string | null;
  clearSubmissionError: () => void;
  // Canonical submission payload (same object used by submitAssessment)
  submissionPayload: {
    primaryAvatar: string;
    submissionId: string;
  } | null;
}

const AssessmentContext = createContext<AssessmentContextValue | null>(null);

export function useAssessment() {
  const context = useContext(AssessmentContext);
  if (!context) {
    throw new Error('useAssessment must be used within AssessmentProvider');
  }
  return context;
}

// ============================================================================
// State Management
// ============================================================================

type AssessmentAction =
  | { type: 'INIT'; payload: { config: AssessmentConfig; sessionId: string } }
  | { type: 'SELECT_OPTION'; payload: { optionId: string; questionId: string } }
  | { type: 'NEXT_QUESTION'; payload: { totalQuestions: number } }
  | { type: 'PREVIOUS_QUESTION' }
  | { type: 'CALCULATE_SCORES'; payload: { config: AssessmentConfig; scoringResult: ScoringResult } }
  | { type: 'SCORING_FAILED'; payload: { error: { kind: string; message: string } } }
  | { type: 'SET_STATUS'; payload: { status: AssessmentState['status'] } }
  | { type: 'SET_ANSWERS'; payload: { answers: Answer[] } };

/**
 * Assessment state reducer. Exported for unit testing the dispatch
 * fail-closed + recovery lifecycle in isolation (see
 * `lib/assessments/__tests__/assessmentProviderReducer.test.ts`).
 */
export function assessmentReducer(
  state: AssessmentState,
  action: AssessmentAction
): AssessmentState {
  switch (action.type) {
    case 'INIT': {
      return {
        ...state,
        assessmentType: action.payload.config.assessmentType,
        assessmentVersion: action.payload.config.assessmentVersion,
        sessionId: action.payload.sessionId,
        currentQuestionIndex: 0,
        answers: [],
        scoreMap: {},
        normalizedScoreMap: {},
        primaryAvatar: '',
        confidenceScore: 0,
        status: 'idle',
        scoringError: null,
      };
    }

    case 'SELECT_OPTION': {
      const newAnswers = [...state.answers];
      const existingAnswerIndex = newAnswers.findIndex(
        (a) => a.questionId === action.payload.questionId
      );

      const newAnswer: Answer = {
        questionId: action.payload.questionId,
        optionId: action.payload.optionId,
      };

      if (existingAnswerIndex >= 0) {
        newAnswers[existingAnswerIndex] = newAnswer;
      } else {
        newAnswers.push(newAnswer);
      }

      // Packet O hardening: a meaningful input change is the deliberate
      // recovery path from a prior dispatch failure. Clearing `scoringError`
      // here lets the scoring effect re-run once the run is back in a
      // completed + fully-answered state. This is NOT a retry loop: scoring
      // only re-fires when the user actually changes an answer and the run
      // is otherwise eligible (status 'completed', all answered, no
      // primaryAvatar). Submission stays blocked while `scoringError`
      // remains set. During normal in-progress answering `scoringError` is
      // already null, so this is a no-op.
      if (state.scoringError) {
        return {
          ...state,
          answers: newAnswers,
          scoringError: null,
        };
      }

      return {
        ...state,
        answers: newAnswers,
      };
    }

    case 'NEXT_QUESTION': {
      const nextIndex = state.currentQuestionIndex + 1;
      const isLastQuestion = nextIndex >= action.payload.totalQuestions;

      if (isLastQuestion) {
        // Calculate scores when reaching the end
        return {
          ...state,
          status: 'completed',
        };
      }

      return {
        ...state,
        currentQuestionIndex: nextIndex,
      };
    }

    case 'PREVIOUS_QUESTION': {
      const prevIndex = Math.max(0, state.currentQuestionIndex - 1);
      return {
        ...state,
        currentQuestionIndex: prevIndex,
      };
    }

    case 'CALCULATE_SCORES': {
      // Scoring result is now passed in payload (calculated async in useEffect)
      const scoringResult = action.payload.scoringResult;

      // DEBUG: Log scoring computation at exact moment primaryAvatar is determined
      console.log('[Assessment Scoring DEBUG]', {
        answers: state.answers.map((a) => ({ questionId: a.questionId, optionId: a.optionId })),
        rawScores: scoringResult.scoreMap,
        normalizedScores: scoringResult.normalizedScoreMap,
        primaryAvatar: scoringResult.primaryAvatar,
        secondaryAvatar: scoringResult.secondaryAvatar,
        confidenceScore: scoringResult.confidenceScore,
        secondaryModifier: scoringResult.secondaryModifier,
        confidenceLabel: scoringResult.confidenceLabel,
      });

      return {
        ...state,
        scoreMap: scoringResult.scoreMap,
        normalizedScoreMap: scoringResult.normalizedScoreMap,
        primaryAvatar: scoringResult.primaryAvatar,
        secondaryAvatar: scoringResult.secondaryAvatar,
        confidenceScore: scoringResult.confidenceScore,
        secondaryModifier: scoringResult.secondaryModifier,
        confidenceLabel: scoringResult.confidenceLabel,
      };
    }

    case 'SET_STATUS': {
      return {
        ...state,
        status: action.payload.status,
      };
    }

    case 'SCORING_FAILED': {
      // Fail-closed: clear any partial scoring state and record the dispatch
      // error. Submission guards read `scoringError` (and the empty
      // primaryAvatar / scoreMap) and block unsafe submission. The runtime
      // never falls back to legacy calculateScoring from here.
      //
      // Recovery (Packet O): `scoringError` is cleared by SELECT_OPTION (an
      // answer change) or by INIT (a full session reset / remount). It is NOT
      // cleared by re-renders or step navigation alone, so there is no retry
      // loop. The scoring effect short-circuits while `scoringError` is set
      // and re-runs only after a deliberate input/state reset.
      return {
        ...state,
        scoringError: action.payload.error,
        primaryAvatar: '',
        scoreMap: {},
        normalizedScoreMap: {},
        confidenceScore: 0,
        secondaryAvatar: undefined,
        secondaryModifier: undefined,
        confidenceLabel: undefined,
      };
    }

    case 'SET_ANSWERS': {
      return {
        ...state,
        answers: action.payload.answers,
      };
    }

    default:
      return state;
  }
}

// ============================================================================
// Provider Component
// ============================================================================

interface AssessmentProviderProps {
  config: AssessmentConfig;
  /** When true, the provider runs in preview mode (see component docstring). */
  isPreview?: boolean;
  children: React.ReactNode;
}

/**
 * AssessmentProvider runs the assessment state machine and persists session +
 * submission analytics. In preview mode (`isPreview`), it:
 *   • uses an isolated, prefixed preview session id (no collision with real
 *     sessions, clearly identifiable in `assessment_sessions`),
 *   • tags analytics events with `is_preview: true`,
 *   • never POSTs to /api/assessments/submit and never redirects to a results
 *     URL — the runner renders an in-memory PreviewResults screen instead.
 * This keeps preview runs out of production submission/webhook/email flows
 * while still exercising the real cover→start→runner pipeline.
 */
export function AssessmentProvider({ config, isPreview, children }: AssessmentProviderProps) {
  const sessionId = isPreview ? getOrCreatePreviewSessionId() : getOrCreateSessionId();
  const submissionIdRef = useRef<string | null>(null);
  const isSubmittingRef = useRef<boolean>(false);
  const hasAttemptedSubmissionRef = useRef<boolean>(false);
  const eventQueueRef = useRef<Array<{ event: string; metadata?: Record<string, unknown> }>>([]);
  // Store submission payload in ref to keep submitAssessment stable
  const submissionPayloadRef = useRef<{
    assessmentType: string;
    assessmentVersion: number;
    sessionId: string;
    answers: Answer[];
    responses?: Record<string, number>;
    scoreMap: Record<string, number>;
    normalizedScoreMap: Record<string, number>;
    primaryAvatar: string;
    secondaryAvatar?: string;
    confidenceScore: number;
    secondaryModifier?: string;
    confidenceLabel?: string;
  } | null>(null);

  const [state, dispatch] = useReducer(assessmentReducer, {
    assessmentType: config.assessmentType,
    assessmentVersion: config.assessmentVersion,
    sessionId,
    currentQuestionIndex: 0,
    answers: [],
    scoreMap: {},
    normalizedScoreMap: {},
    primaryAvatar: '',
    confidenceScore: 0,
    status: 'idle',
    scoringError: null,
  } as AssessmentState);

  // Initialize on mount - reset all refs and state to ensure clean state
  useEffect(() => {
    // Reset all refs for clean assessment start
    submissionIdRef.current = null;
    isSubmittingRef.current = false;
    hasAttemptedSubmissionRef.current = false;
    submissionPayloadRef.current = null;
    setSubmissionPayloadState(null); // Reset state as well
    
    dispatch({ type: 'INIT', payload: { config, sessionId } });
    dispatch({ type: 'SET_STATUS', payload: { status: 'in_progress' } });

    // Track session started
    trackAssessmentStarted(config.assessmentType, config.assessmentVersion, sessionId, isPreview);

    // Update session in database (non-blocking). In preview mode the session
    // id is prefixed (fd-preview-) so the row is clearly a preview session and
    // never collides with the user's real session for this assessment.
    fetch('/api/assessments/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assessmentType: config.assessmentType,
        assessmentVersion: config.assessmentVersion,
        sessionId,
        status: 'started',
        lastQuestionIndex: 0,
        isPreview: !!isPreview,
      }),
    }).catch((error) => {
      console.error('Error updating session:', error);
    });
    // Only run on mount - empty dependency array ensures clean reset per assessment instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Race condition guard: monotonically increasing request ID
  const scoringRequestIdRef = useRef(0);
  const isMountedRef = useRef(true);

  // Set mounted flag on mount/unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Calculate scores when answers change and we're on the last question.
  // Packet N: scoring now flows through the dispatch layer via
  // `scoreAssessmentRun` (→ `dispatchScoring` → the Gut Check adapter →
  // `calculateScoring`). Dispatch failures fail closed: we record a
  // `scoringError` and never fall back to legacy `calculateScoring` here.
  useEffect(() => {
    if (state.status === 'completed' && state.answers.length === config.questions.length && !state.primaryAvatar && !state.scoringError) {
      // Increment request ID for this scoring request
      const currentRequestId = ++scoringRequestIdRef.current;

      scoreAssessmentRun({
        assessmentType: config.assessmentType,
        assessmentVersion: config.assessmentVersion,
        answers: state.answers,
        config,
        preview: isPreview,
      })
        .then((outcome) => {
          // Only apply if this is still the latest request and component is mounted.
          if (currentRequestId !== scoringRequestIdRef.current || !isMountedRef.current) {
            console.debug('[AssessmentProvider] Ignoring stale scoring result (requestId mismatch or unmounted)');
            return;
          }

          if (!outcome.ok) {
            // Fail closed. Surface an explicit scoring-unavailable state and
            // block submission (the reducer clears primaryAvatar / scoreMap).
            console.error(
              '[AssessmentProvider] Scoring dispatch failed:',
              outcome.error.kind,
              outcome.error.message
            );
            dispatch({
              type: 'SCORING_FAILED',
              payload: {
                error: {
                  kind: outcome.error.kind,
                  message: outcome.error.message,
                },
              },
            });
            return;
          }

          dispatch({ type: 'CALCULATE_SCORES', payload: { config, scoringResult: outcome.scoringResult } });
          // Track completion after scores are calculated
          trackAssessmentCompleted(
            config.assessmentType,
            config.assessmentVersion,
            sessionId,
            outcome.scoringResult.primaryAvatar || '',
            isPreview
          );
        })
        .catch((error) => {
          // Defensive: scoreAssessmentRun never throws scoring errors, but a
          // thrown non-scoring error here would be a runtime/programming bug.
          // Fail closed the same way — never fall back to calculateScoring.
          console.error('[AssessmentProvider] Unexpected error from scoreAssessmentRun:', error);
          if (currentRequestId === scoringRequestIdRef.current && isMountedRef.current) {
            dispatch({
              type: 'SCORING_FAILED',
              payload: {
                error: {
                  kind: 'runtime-error',
                  message:
                    'Assessment scoring failed unexpectedly. Submission is blocked.',
                },
              },
            });
          }
        });
    }
  }, [state.status, state.answers.length, config.questions.length, config, sessionId, state.primaryAvatar, state.scoringError, isPreview]);

  // Track submission payload in state for reactive context updates
  const [submissionPayloadState, setSubmissionPayloadState] = useState<{
    primaryAvatar: string;
    submissionId: string;
  } | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const clearSubmissionError = useCallback(() => {
    setSubmissionError(null);
  }, []);

  // Store submission payload in ref when assessment is completed and scores are calculated
  // This keeps submitAssessment stable and prevents unnecessary recreations
  // Also update state so context value updates reactively
  useEffect(() => {
    if (
      state.status === 'completed' &&
      state.primaryAvatar &&
      state.answers.length === config.questions.length &&
      Object.keys(state.scoreMap).length > 0
    ) {
      // For v2+, convert answers to responses format {q1: 0, q2: 1, ...}
      const responses = state.assessmentVersion >= 2
        ? convertAnswersToResponsesMap(state.answers, config)
        : undefined;

      const payload = {
        assessmentType: state.assessmentType,
        assessmentVersion: state.assessmentVersion,
        sessionId: state.sessionId,
        answers: state.answers,
        responses, // For v2+: {q1: 0, q2: 1, ... q17: 3}
        scoreMap: state.scoreMap,
        normalizedScoreMap: state.normalizedScoreMap,
        primaryAvatar: state.primaryAvatar,
        secondaryAvatar: state.secondaryAvatar,
        confidenceScore: state.confidenceScore,
        secondaryModifier: state.secondaryModifier,
        confidenceLabel: state.confidenceLabel,
      };
      submissionPayloadRef.current = payload;
      
      // Update state for reactive context value (only if submissionId exists)
      // Use functional update to avoid dependency on submissionPayloadState
      if (submissionIdRef.current) {
        setSubmissionPayloadState((prev) => {
          const newPayload = {
            primaryAvatar: payload.primaryAvatar,
            submissionId: submissionIdRef.current!,
          };
          // Only update if values changed to avoid unnecessary re-renders
          if (prev?.primaryAvatar === newPayload.primaryAvatar && prev?.submissionId === newPayload.submissionId) {
            return prev;
          }
          return newPayload;
        });
      }
    }
    // Note: We don't clear submissionPayloadState here - it persists until INIT
  }, [
    state.status,
    state.primaryAvatar,
    state.answers.length,
    state.assessmentType,
    state.assessmentVersion,
    state.sessionId,
    state.scoreMap,
    state.normalizedScoreMap,
    state.secondaryAvatar,
    state.confidenceScore,
    config.questions.length,
  ]);

  const selectOption = useCallback((optionId: string) => {
    const currentQuestion = config.questions[state.currentQuestionIndex];
    if (!currentQuestion) return;
    dispatch({ type: 'SELECT_OPTION', payload: { optionId, questionId: currentQuestion.id } });
  }, [config.questions, state.currentQuestionIndex]);

  const goToNextQuestion = useCallback(() => {
    const currentQuestion = config.questions[state.currentQuestionIndex];
    const hasAnswer = state.answers.some((a) => a.questionId === currentQuestion.id);

    if (!hasAnswer) {
      // Cannot proceed without an answer
      return;
    }

    const nextIndex = state.currentQuestionIndex + 1;
    
    // Update session progress (non-blocking)
    fetch('/api/assessments/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assessmentType: config.assessmentType,
        assessmentVersion: config.assessmentVersion,
        sessionId,
        status: 'started',
        lastQuestionIndex: nextIndex,
        isPreview: !!isPreview,
      }),
    }).catch((error) => {
      console.error('Error updating session progress:', error);
    });

    if (nextIndex >= config.questions.length) {
      // Last question - mark as completed
      dispatch({ type: 'SET_STATUS', payload: { status: 'completed' } });
    } else {
      dispatch({ type: 'NEXT_QUESTION', payload: { totalQuestions: config.questions.length } });
    }
  }, [state.currentQuestionIndex, state.answers, config.questions, config.assessmentType, config.assessmentVersion, sessionId]);

  const goToPreviousQuestion = useCallback(() => {
    dispatch({ type: 'PREVIOUS_QUESTION' });
  }, []);

  const submitAssessment = useCallback(async () => {
    // Read from state for status check (needed for initial guard)
    // But use ref for payload to keep function stable
    if (state.status !== 'completed') return;

    // Packet N: fail-closed guard. If scoring dispatch failed, never submit.
    if (state.scoringError) {
      console.warn('[submitAssessment] Scoring dispatch failed; submission blocked.');
      return;
    }

    // Guard: Prevent duplicate submissions
    if (hasAttemptedSubmissionRef.current) {
      console.warn('[submitAssessment] Submission already attempted, skipping duplicate');
      return;
    }

    // Guard: Prevent concurrent submissions
    if (isSubmittingRef.current) {
      console.warn('[submitAssessment] Submission already in progress, skipping duplicate');
      return;
    }

    // Guard: Must have submission payload ready
    if (!submissionPayloadRef.current) {
      console.warn('[submitAssessment] Submission payload not ready, skipping');
      return;
    }

    // Guard: Must have submissionId to proceed
    if (!submissionIdRef.current) {
      submissionIdRef.current = generateUUID();
    }

    // Update submission payload state now that we have submissionId
    if (submissionPayloadRef.current) {
      setSubmissionPayloadState({
        primaryAvatar: submissionPayloadRef.current.primaryAvatar,
        submissionId: submissionIdRef.current,
      });
    }

    // Set guards
    isSubmittingRef.current = true;
    hasAttemptedSubmissionRef.current = true;
    setSubmissionError(null);

    dispatch({ type: 'SET_STATUS', payload: { status: 'submitting' } });

    try {
      const payload = submissionPayloadRef.current;
      const response = await fetch('/api/assessments/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          submissionId: submissionIdRef.current,
          assessmentType: payload.assessmentType,
          assessmentVersion: payload.assessmentVersion,
          sessionId: payload.sessionId,
          answers: payload.answers,
          responses: payload.responses,
          scoreMap: payload.scoreMap,
          normalizedScoreMap: payload.normalizedScoreMap,
          primaryAvatar: payload.primaryAvatar,
          secondaryAvatar: payload.secondaryAvatar,
          confidenceScore: payload.confidenceScore,
          secondaryModifier: payload.secondaryModifier,
          confidenceLabel: payload.confidenceLabel,
          metadata: {
            page: window.location.pathname,
            referrer: document.referrer,
            device: /Mobile|Android|iPhone|iPad/.test(navigator.userAgent) ? 'mobile' : 'desktop',
            secondary_modifier: payload.secondaryModifier,
            confidence_label: payload.confidenceLabel,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit assessment');
      }

      const responseData = await response.json();
      const submissionId = responseData.submissionId || submissionIdRef.current;

      // Store claim token in localStorage if present (guest submission)
      if (responseData.claimToken && typeof window !== 'undefined') {
        try {
          localStorage.setItem('fd_gc_claimToken:last', responseData.claimToken);
        } catch (e) {
          console.warn('Failed to store claim token in localStorage:', e);
        }
      }

      // Redirect to results under the canonical assessment route.
      // Using /assessments/[assessmentType] so new assessment types work
      // automatically without changing this code.
      if (submissionId && typeof window !== 'undefined') {
        window.location.href = `/assessments/${payload.assessmentType}?submission_id=${submissionId}`;
      }

      // Submission successful - status remains 'completed'
    } catch (error) {
      console.error('Assessment submission error:', error);
      hasAttemptedSubmissionRef.current = false;
      setSubmissionError(
        'We could not save your results. Please check your connection and try again.'
      );
    } finally {
      isSubmittingRef.current = false;
      dispatch({ type: 'SET_STATUS', payload: { status: 'completed' } });
    }
    // Only depend on dispatch (stable) and state.status (needed for guard check)
    // All submission data comes from ref, so function stays stable
  }, [dispatch, state.status, state.scoringError]);

  // Auto-submit when assessment is completed and scores are calculated.
  // Skipped entirely in preview mode — preview never writes a submission; the
  // runner renders PreviewResults from in-memory scoring instead.
  useEffect(() => {
    if (isPreview) {
      return;
    }
    if (
      state.status === 'completed' &&
      !state.scoringError &&
      state.primaryAvatar &&
      state.answers.length === config.questions.length &&
      Object.keys(state.scoreMap).length > 0 &&
      submissionPayloadRef.current
    ) {
      // Small delay to ensure all state updates are complete
      const timeoutId = setTimeout(() => {
        submitAssessment();
      }, 150);
      return () => clearTimeout(timeoutId);
    }
  }, [state.status, state.primaryAvatar, state.answers.length, state.scoreMap, config.questions.length, submitAssessment, isPreview, state.scoringError]);

  const abandonAssessment = useCallback(() => {
    trackAssessmentAbandoned(
      config.assessmentType,
      config.assessmentVersion,
      sessionId,
      state.currentQuestionIndex,
      isPreview
    );

    // Update session status to abandoned (non-blocking)
    fetch('/api/assessments/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assessmentType: config.assessmentType,
        assessmentVersion: config.assessmentVersion,
        sessionId,
        status: 'abandoned',
        lastQuestionIndex: state.currentQuestionIndex,
        isPreview: !!isPreview,
      }),
    }).catch((error) => {
      console.error('Error updating session to abandoned:', error);
    });
  }, [config, sessionId, state.currentQuestionIndex, isPreview]);

  // Track abandonment on unmount
  useEffect(() => {
    return () => {
      if (state.status === 'in_progress') {
        abandonAssessment();
      }
    };
  }, []);

  const value: AssessmentContextValue = {
    state,
    config,
    selectOption,
    goToNextQuestion,
    goToPreviousQuestion,
    submitAssessment,
    abandonAssessment,
    scoringError: state.scoringError,
    submissionError,
    clearSubmissionError,
    // Expose canonical submission payload for Results screen (from state for reactivity)
    submissionPayload: submissionPayloadState,
  };

  return <AssessmentContext.Provider value={value}>{children}</AssessmentContext.Provider>;
}

