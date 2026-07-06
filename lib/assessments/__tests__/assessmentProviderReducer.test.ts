/**
 * Tests for the AssessmentProvider reducer's dispatch fail-closed + recovery
 * lifecycle (Packet O hardening).
 *
 * The reducer is the pure core of the runtime scoring lifecycle. These tests
 * isolate it from React / browser effects so we can assert the safety
 * contract directly:
 *   - SCORING_FAILED clears partial scoring state and sets `scoringError`
 *     (fail-closed; never falls back to legacy calculateScoring).
 *   - `scoringError` has a deliberate recovery path: SELECT_OPTION (an answer
 *     change) clears it, so the scoring effect can re-run. This is NOT a
 *     retry loop — only a meaningful input change resets it.
 *   - INIT (full session reset / remount) clears `scoringError`.
 *   - CALCULATE_SCORES projects the scoringResult fields the reducer consumes.
 *   - Submission guards read `scoringError` and refuse while it is set; the
 *     reducer never produces a `primaryAvatar` from a failed run.
 *
 * These tests do not exercise the browser; they exercise the exported
 * `assessmentReducer` plus a static check that AssessmentProvider does not
 * import/call `calculateScoring` directly.
 */

import { assessmentReducer } from '@/components/assessments/AssessmentProvider';
import type {
  AssessmentState,
  AssessmentConfig,
  Answer,
} from '@/lib/assessmentTypes';
import type { ScoringResult } from '@/lib/assessmentScoring';

// ---------------------------------------------------------------------------
// Static guard: AssessmentProvider must not import/call calculateScoring
// ---------------------------------------------------------------------------

describe('AssessmentProvider: no legacy calculateScoring fallback (static)', () => {
  it('does not import calculateScoring as a value', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(
        'components/assessments/AssessmentProvider.tsx'
      ),
      'utf8'
    );
    // No value import of calculateScoring. Comments mentioning it are fine.
    const importLines = src
      .split('\n')
      .filter((l: string) => /^\s*import\b/.test(l));
    const calculateScoringImport = importLines.find((l: string) =>
      /\bcalculateScoring\b/.test(l) && /from\s+['"]@\/lib\/assessmentScoring['"]/.test(l)
    );
    expect(calculateScoringImport).toBeUndefined();
    // No call expression either (excluding comments / string literals).
    const codeWithoutComments = src.replace(/\/\/.*$/gm, '');
    const callMatch = codeWithoutComments.match(/\bcalculateScoring\s*\(/);
    expect(callMatch).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeConfig(): AssessmentConfig {
  const questions = Array.from({ length: 3 }, (_, i) => {
    const qId = `q${i + 1}`;
    return {
      id: qId,
      text: `${qId} text`,
      options: [0, 1, 2, 3].map((v) => ({
        id: `${qId}-opt-${v}`,
        label: `option ${v}`,
        value: v,
      })),
    };
  });
  return {
    assessmentType: 'gut-check',
    assessmentVersion: 3,
    questions,
    avatars: ['level1', 'level2', 'level3', 'level4'],
    scoring: {
      thresholds: {
        secondaryAvatarThreshold: 0.15,
        confidenceThresholds: { high: 0.25, medium: 0.1 },
      },
    },
  };
}

function makeAnsweredState(answers: Answer[]): AssessmentState {
  return {
    assessmentType: 'gut-check',
    assessmentVersion: 3,
    sessionId: 'sess-test',
    currentQuestionIndex: 2,
    answers,
    scoreMap: {},
    normalizedScoreMap: {},
    primaryAvatar: '',
    confidenceScore: 0,
    status: 'completed',
    scoringError: null,
  };
}

function fullAnswers(config: AssessmentConfig): Answer[] {
  return config.questions.map((q) => ({
    questionId: q.id,
    optionId: q.options[0].id,
  }));
}

const SCORING_RESULT: ScoringResult = {
  scoreMap: { level1: 10 },
  normalizedScoreMap: { level1: 1 },
  primaryAvatar: 'level1',
  secondaryAvatar: 'level2',
  confidenceScore: 0.9,
  secondaryModifier: 'high_responsiveness',
  confidenceLabel: 'high',
};

// ---------------------------------------------------------------------------
// SCORING_FAILED: fail-closed
// ---------------------------------------------------------------------------

describe('assessmentReducer: SCORING_FAILED is fail-closed', () => {
  it('clears partial scoring state and sets scoringError', () => {
    const config = makeConfig();
    const prior: AssessmentState = {
      ...makeAnsweredState(fullAnswers(config)),
      scoreMap: { level1: 10 },
      normalizedScoreMap: { level1: 1 },
      primaryAvatar: 'level1',
      confidenceScore: 0.9,
      secondaryAvatar: 'level2',
      secondaryModifier: 'high_responsiveness',
      confidenceLabel: 'high',
    };

    const next = assessmentReducer(prior, {
      type: 'SCORING_FAILED',
      payload: { error: { kind: 'adapter-throw', message: 'boom' } },
    });

    expect(next.scoringError).toEqual({ kind: 'adapter-throw', message: 'boom' });
    expect(next.primaryAvatar).toBe('');
    expect(next.scoreMap).toEqual({});
    expect(next.normalizedScoreMap).toEqual({});
    expect(next.confidenceScore).toBe(0);
    expect(next.secondaryAvatar).toBeUndefined();
    expect(next.secondaryModifier).toBeUndefined();
    expect(next.confidenceLabel).toBeUndefined();
  });

  it('never falls back to calculateScoring — no primaryAvatar is synthesized', () => {
    const config = makeConfig();
    const prior = makeAnsweredState(fullAnswers(config));
    const next = assessmentReducer(prior, {
      type: 'SCORING_FAILED',
      payload: { error: { kind: 'unknown-assessment-type', message: 'no adapter' } },
    });
    // Fail-closed: no partial / fabricated result payload can be submitted.
    expect(next.primaryAvatar).toBe('');
    expect(next.scoreMap).toEqual({});
    expect(next.scoringError?.kind).toBe('unknown-assessment-type');
  });
});

// ---------------------------------------------------------------------------
// Recovery: SELECT_OPTION clears scoringError
// ---------------------------------------------------------------------------

describe('assessmentReducer: scoringError recovery path', () => {
  it('SELECT_OPTION clears scoringError (meaningful input reset)', () => {
    const config = makeConfig();
    const failed: AssessmentState = {
      ...makeAnsweredState(fullAnswers(config)),
      scoringError: { kind: 'adapter-throw', message: 'boom' },
    };

    const next = assessmentReducer(failed, {
      type: 'SELECT_OPTION',
      payload: { optionId: 'q1-opt-1', questionId: 'q1' },
    });

    expect(next.scoringError).toBeNull();
    // The answer change is applied.
    expect(next.answers.find((a) => a.questionId === 'q1')?.optionId).toBe(
      'q1-opt-1'
    );
  });

  it('does not clear scoringError on step navigation alone (no retry loop)', () => {
    const config = makeConfig();
    const failed: AssessmentState = {
      ...makeAnsweredState(fullAnswers(config)),
      currentQuestionIndex: 2,
      scoringError: { kind: 'adapter-throw', message: 'boom' },
    };

    const prev = assessmentReducer(failed, { type: 'PREVIOUS_QUESTION' });
    expect(prev.scoringError).not.toBeNull();
    expect(prev.currentQuestionIndex).toBe(1);

    const next = assessmentReducer(prev, {
      type: 'NEXT_QUESTION',
      payload: { totalQuestions: config.questions.length },
    });
    // Step navigation does not reset scoringError.
    expect(next.scoringError).not.toBeNull();
  });

  it('INIT clears scoringError (full session reset / remount)', () => {
    const config = makeConfig();
    const failed: AssessmentState = {
      ...makeAnsweredState(fullAnswers(config)),
      scoringError: { kind: 'adapter-throw', message: 'boom' },
    };

    const next = assessmentReducer(failed, {
      type: 'INIT',
      payload: { config, sessionId: 'sess-new' },
    });

    expect(next.scoringError).toBeNull();
    expect(next.primaryAvatar).toBe('');
    expect(next.answers).toEqual([]);
    expect(next.status).toBe('idle');
    expect(next.sessionId).toBe('sess-new');
  });

  it('SELECT_OPTION is a no-op for scoringError during normal answering', () => {
    const config = makeConfig();
    const inProgress: AssessmentState = {
      ...makeAnsweredState([fullAnswers(config)[0]]),
      status: 'in_progress',
      currentQuestionIndex: 0,
    };

    const next = assessmentReducer(inProgress, {
      type: 'SELECT_OPTION',
      payload: { optionId: 'q1-opt-2', questionId: 'q1' },
    });

    expect(next.scoringError).toBeNull();
    expect(next.answers.find((a) => a.questionId === 'q1')?.optionId).toBe(
      'q1-opt-2'
    );
  });
});

// ---------------------------------------------------------------------------
// CALCULATE_SCORES: projects the legacy ScoringResult shape
// ---------------------------------------------------------------------------

describe('assessmentReducer: CALCULATE_SCORES projects ScoringResult', () => {
  it('maps every field the runtime / submission / preview consume', () => {
    const config = makeConfig();
    const prior = makeAnsweredState(fullAnswers(config));

    const next = assessmentReducer(prior, {
      type: 'CALCULATE_SCORES',
      payload: { config, scoringResult: SCORING_RESULT },
    });

    expect(next.scoreMap).toEqual(SCORING_RESULT.scoreMap);
    expect(next.normalizedScoreMap).toEqual(SCORING_RESULT.normalizedScoreMap);
    expect(next.primaryAvatar).toBe(SCORING_RESULT.primaryAvatar);
    expect(next.secondaryAvatar).toBe(SCORING_RESULT.secondaryAvatar);
    expect(next.confidenceScore).toBe(SCORING_RESULT.confidenceScore);
    expect(next.secondaryModifier).toBe(SCORING_RESULT.secondaryModifier);
    expect(next.confidenceLabel).toBe(SCORING_RESULT.confidenceLabel);
    // scoringError is not re-introduced by a successful scoring projection.
    expect(next.scoringError).toBeNull();
  });
});
