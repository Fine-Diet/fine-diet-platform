import { describe, it, expect } from '@jest/globals';
import {
  APP_COPY_BASELINE_QUESTION_IDS,
  DEFAULT_ONBOARDING_FLOW_CONFIG,
  DEFAULT_ONBOARDING_PAGES,
  INITIAL_SETUP_MAX_PAGES,
  INITIAL_SETUP_QUESTION_IDS,
  deriveDefaultOnboardingPages,
  type OnboardingFlowConfig,
} from '../onboardingFlowTypes';
import { validateOnboardingFlowConfig } from '../onboardingFlowValidation';
import {
  applyInitialSetupBoundary,
  resolveOnboardingPages,
  pageQuestionIds,
} from '../onboardingPages';

describe('deriveDefaultOnboardingPages — Initial Setup v2', () => {
  it('produces exactly two customer-facing pages', () => {
    const pages = deriveDefaultOnboardingPages();
    expect(pages).toHaveLength(INITIAL_SETUP_MAX_PAGES);
    expect(pages.map((p) => p.id)).toEqual(['initial_setup_basics', 'initial_setup_rhythm']);
  });

  it('screen 1 groups DOB/height/weight/sex; screen 2 is rhythm only', () => {
    const pages = deriveDefaultOnboardingPages();
    expect(pages[0].questionIds).toEqual(['date_of_birth', 'height', 'weight', 'sex']);
    expect(pages[0].groupingReason).toBe('initial_setup_basics');
    expect(pages[1].questionIds).toEqual(['rhythm_template']);
  });

  it('only Initial Setup allowlisted questions appear on default pages', () => {
    const ids = pageQuestionIds(DEFAULT_ONBOARDING_PAGES);
    expect(ids).toEqual([...INITIAL_SETUP_QUESTION_IDS]);
  });

  it('the App Copy baseline catalog still has exactly 23 answer-bearing items', () => {
    expect(APP_COPY_BASELINE_QUESTION_IDS).toHaveLength(23);
  });

  it('the derived default sequence passes validation', () => {
    const cfg: OnboardingFlowConfig = {
      version: 1,
      questions: {},
      pages: deriveDefaultOnboardingPages(),
    };
    expect(validateOnboardingFlowConfig(cfg).ok).toBe(true);
  });
});

describe('resolveOnboardingPages', () => {
  it('uses config.pages when present, then clamps to Initial Setup boundary', () => {
    const cfg: OnboardingFlowConfig = {
      version: 1,
      questions: {},
      pages: [
        { id: 'a', title: 'A', questionIds: ['date_of_birth'] },
        { id: 'b', title: 'B', questionIds: ['rhythm_template'] },
      ],
    };
    expect(resolveOnboardingPages(cfg).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('falls back to Initial Setup v2 when pages is absent (legacy row)', () => {
    const cfg: OnboardingFlowConfig = { version: 1, questions: {} };
    const resolved = resolveOnboardingPages(cfg);
    expect(resolved).toHaveLength(2);
    expect(pageQuestionIds(resolved)).toEqual([...INITIAL_SETUP_QUESTION_IDS]);
  });

  it('falls back to Initial Setup v2 when pages is empty', () => {
    const cfg: OnboardingFlowConfig = { version: 1, questions: {}, pages: [] };
    expect(resolveOnboardingPages(cfg)).toHaveLength(2);
  });

  it('drops a page whose only question is hidden via a per-question override', () => {
    const cfg: OnboardingFlowConfig = {
      version: 1,
      questions: { rhythm_template: { visible: false } },
      pages: [
        {
          id: 'basics',
          title: 'Basics',
          questionIds: ['date_of_birth', 'height', 'weight', 'sex'],
          groupingReason: 'initial_setup_basics',
        },
        { id: 'rhythm', title: 'Rhythm', questionIds: ['rhythm_template'] },
      ],
    };
    expect(resolveOnboardingPages(cfg).map((p) => p.id)).toEqual(['basics']);
  });

  it('drops a page marked invisible', () => {
    const cfg: OnboardingFlowConfig = {
      version: 1,
      questions: {},
      pages: [
        { id: 'a', title: 'A', questionIds: ['date_of_birth'] },
        { id: 'b', title: 'B', questionIds: ['rhythm_template'], visible: false },
      ],
    };
    expect(resolveOnboardingPages(cfg).map((p) => p.id)).toEqual(['a']);
  });

  it('falls back to the derived default when every page is filtered out', () => {
    const cfg: OnboardingFlowConfig = {
      version: 1,
      questions: { date_of_birth: { visible: false } },
      pages: [{ id: 'a', title: 'A', questionIds: ['date_of_birth'] }],
    };
    expect(resolveOnboardingPages(cfg).length).toBeGreaterThan(0);
  });

  it('the default config resolves to exactly two Initial Setup pages', () => {
    const resolved = resolveOnboardingPages(DEFAULT_ONBOARDING_FLOW_CONFIG);
    expect(resolved).toHaveLength(2);
    expect(pageQuestionIds(resolved)).toEqual([...INITIAL_SETUP_QUESTION_IDS]);
  });

  it('admin-expanded pages cannot re-enter the customer gate', () => {
    const cfg: OnboardingFlowConfig = {
      version: 1,
      questions: {},
      pages: [
        {
          id: 'basics',
          title: 'Basics',
          questionIds: ['date_of_birth', 'height', 'weight', 'sex'],
          groupingReason: 'initial_setup_basics',
        },
        { id: 'rhythm', title: 'Rhythm', questionIds: ['rhythm_template'] },
        { id: 'goal', title: 'Goal', questionIds: ['primary_goal'] },
        { id: 'allergy', title: 'Allergy', questionIds: ['food_restrictions'] },
      ],
    };
    const resolved = resolveOnboardingPages(cfg);
    expect(resolved).toHaveLength(2);
    expect(pageQuestionIds(resolved)).toEqual([...INITIAL_SETUP_QUESTION_IDS]);
    expect(pageQuestionIds(resolved)).not.toContain('primary_goal');
  });
});

describe('applyInitialSetupBoundary', () => {
  it('strips non-allowlisted question ids from pages', () => {
    const bounded = applyInitialSetupBoundary([
      {
        id: 'mixed',
        title: 'Mixed',
        questionIds: ['date_of_birth', 'primary_goal', 'sex'],
      },
    ]);
    expect(bounded[0].questionIds).toEqual(['date_of_birth', 'sex']);
  });
});

describe('pageQuestionIds', () => {
  it('flattens and de-duplicates question ids in page order', () => {
    const pages = [
      { id: 'a', title: 'A', questionIds: ['date_of_birth', 'sex'] },
      { id: 'b', title: 'B', questionIds: ['sex', 'rhythm_template'] },
    ];
    expect(pageQuestionIds(pages)).toEqual(['date_of_birth', 'sex', 'rhythm_template']);
  });
});
