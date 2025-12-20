/**
 * Assessment Context Provider
 * Manages assessment state and provides it to child components
 */

import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef, useState } from 'react';
import type { AssessmentState, Answer, AssessmentConfig } from '@/lib/assessmentTypes';
import { calculateScoring } from '@/lib/assessmentScoring';
import { getOrCreateSessionId, generateUUID } from '@/lib/assessmentSession';
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
  | { type: 'CALCULATE_SCORES'; payload: { config: AssessmentConfig } }
  | { type: 'SET_STATUS'; payload: { status: AssessmentState['status'] } }
  | { type: 'SET_ANSWERS'; payload: { answers: Answer[] } };

function assessmentReducer(
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
      const scoringResult = calculateScoring(state.answers, action.payload.config);

      return {
        ...state,
        scoreMap: scoringResult.scoreMap,
        normalizedScoreMap: scoringResult.normalizedScoreMap,
        primaryAvatar: scoringResult.primaryAvatar,
        secondaryAvatar: scoringResult.secondaryAvatar,
        confidenceScore: scoringResult.confidenceScore,
      };
    }

    case 'SET_STATUS': {
      return {
        ...state,
        status: action.payload.status,
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
  children: React.ReactNode;
}

export function AssessmentProvider({ config, children }: AssessmentProviderProps) {
  const sessionId = getOrCreateSessionId();
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
    scoreMap: Record<string, number>;
    normalizedScoreMap: Record<string, number>;
    primaryAvatar: string;
    secondaryAvatar?: string;
    confidenceScore: number;
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
    trackAssessmentStarted(config.assessmentType, config.assessmentVersion, sessionId);
    
    // Update session in database (non-blocking)
    fetch('/api/assessments/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assessmentType: config.assessmentType,
        assessmentVersion: config.assessmentVersion,
        sessionId,
        status: 'started',
        lastQuestionIndex: 0,
      }),
    }).catch((error) => {
      console.error('Error updating session:', error);
    });
    // Only run on mount - empty dependency array ensures clean reset per assessment instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate scores when answers change and we're on the last question
  useEffect(() => {
    if (state.status === 'completed' && state.answers.length === config.questions.length) {
      dispatch({ type: 'CALCULATE_SCORES', payload: { config } });
      // Track completion after a brief delay to ensure scores are calculated
      setTimeout(() => {
        trackAssessmentCompleted(
          config.assessmentType,
          config.assessmentVersion,
          sessionId,
          state.primaryAvatar || ''
        );
      }, 100);
    }
  }, [state.status, state.answers.length, config.questions.length, config, sessionId, state.primaryAvatar]);

  // Track submission payload in state for reactive context updates
  const [submissionPayloadState, setSubmissionPayloadState] = useState<{
    primaryAvatar: string;
    submissionId: string;
  } | null>(null);

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
      const payload = {
        assessmentType: state.assessmentType,
        assessmentVersion: state.assessmentVersion,
        sessionId: state.sessionId,
        answers: state.answers,
        scoreMap: state.scoreMap,
        normalizedScoreMap: state.normalizedScoreMap,
        primaryAvatar: state.primaryAvatar,
        secondaryAvatar: state.secondaryAvatar,
        confidenceScore: state.confidenceScore,
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
          scoreMap: payload.scoreMap,
          normalizedScoreMap: payload.normalizedScoreMap,
          primaryAvatar: payload.primaryAvatar,
          secondaryAvatar: payload.secondaryAvatar,
          confidenceScore: payload.confidenceScore,
          metadata: {
            page: window.location.pathname,
            referrer: document.referrer,
            device: /Mobile|Android|iPhone|iPad/.test(navigator.userAgent) ? 'mobile' : 'desktop',
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit assessment');
      }

      // Submission successful - status remains 'completed'
    } catch (error) {
      console.error('Assessment submission error:', error);
      // Don't block UI - just log the error
    } finally {
      isSubmittingRef.current = false;
      dispatch({ type: 'SET_STATUS', payload: { status: 'completed' } });
    }
    // Only depend on dispatch (stable) and state.status (needed for guard check)
    // All submission data comes from ref, so function stays stable
  }, [dispatch, state.status]);

  const abandonAssessment = useCallback(() => {
    trackAssessmentAbandoned(
      config.assessmentType,
      config.assessmentVersion,
      sessionId,
      state.currentQuestionIndex
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
      }),
    }).catch((error) => {
      console.error('Error updating session to abandoned:', error);
    });
  }, [config, sessionId, state.currentQuestionIndex]);

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
    // Expose canonical submission payload for Results screen (from state for reactivity)
    submissionPayload: submissionPayloadState,
  };

  return <AssessmentContext.Provider value={value}>{children}</AssessmentContext.Provider>;
}

