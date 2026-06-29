import { describe, it, expect } from '@jest/globals';
import {
  DEFAULT_ONBOARDING_FLOW_CONFIG,
  DEFAULT_ONBOARDING_PAGES,
  KNOWN_QUESTION_IDS,
  deriveDefaultOnboardingPages,
  type OnboardingFlowConfig,
} from '../onboardingFlowTypes';
import { validateOnboardingFlowConfig } from '../onboardingFlowValidation';
import { resolveOnboardingPages, pageQuestionIds } from '../onboardingPages';

describe('deriveDefaultOnboardingPages', () => {
  it('produces one page per known question, in catalog order', () => {
    const pages = deriveDefaultOnboardingPages();
    expect(pages).toHaveLength(KNOWN_QUESTION_IDS.length);
    expect(pages.map((p) => p.questionIds)).toEqual(KNOWN_QUESTION_IDS.map((id) => [id]));
  });

  it('every default page carries exactly one question id', () => {
    for (const page of DEFAULT_ONBOARDING_PAGES) {
      expect(page.questionIds).toHaveLength(1);
    }
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
  it('uses config.pages when present', () => {
    const cfg: OnboardingFlowConfig = {
      version: 1,
      questions: {},
      pages: [
        { id: 'a', title: 'A', questionIds: ['primary_goal'] },
        { id: 'b', title: 'B', questionIds: ['priority'] },
      ],
    };
    expect(resolveOnboardingPages(cfg).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('falls back to the derived default when pages is absent (legacy row)', () => {
    const cfg: OnboardingFlowConfig = { version: 1, questions: {} };
    const resolved = resolveOnboardingPages(cfg);
    expect(resolved).toHaveLength(KNOWN_QUESTION_IDS.length);
    expect(resolved.map((p) => p.questionIds[0])).toEqual([...KNOWN_QUESTION_IDS]);
  });

  it('falls back to the derived default when pages is empty', () => {
    const cfg: OnboardingFlowConfig = { version: 1, questions: {}, pages: [] };
    expect(resolveOnboardingPages(cfg)).toHaveLength(KNOWN_QUESTION_IDS.length);
  });

  it('drops a page whose only question is hidden via a per-question override', () => {
    const cfg: OnboardingFlowConfig = {
      version: 1,
      questions: { priority: { visible: false } },
      pages: [
        { id: 'a', title: 'A', questionIds: ['primary_goal'] },
        { id: 'b', title: 'B', questionIds: ['priority'] },
      ],
    };
    expect(resolveOnboardingPages(cfg).map((p) => p.id)).toEqual(['a']);
  });

  it('drops a page marked invisible', () => {
    const cfg: OnboardingFlowConfig = {
      version: 1,
      questions: {},
      pages: [
        { id: 'a', title: 'A', questionIds: ['primary_goal'] },
        { id: 'b', title: 'B', questionIds: ['priority'], visible: false },
      ],
    };
    expect(resolveOnboardingPages(cfg).map((p) => p.id)).toEqual(['a']);
  });

  it('falls back to the derived default when every page is filtered out', () => {
    const cfg: OnboardingFlowConfig = {
      version: 1,
      questions: { primary_goal: { visible: false } },
      pages: [{ id: 'a', title: 'A', questionIds: ['primary_goal'] }],
    };
    expect(resolveOnboardingPages(cfg).length).toBeGreaterThan(0);
  });

  it('the default config resolves to a valid one-question-per-page sequence', () => {
    const resolved = resolveOnboardingPages(DEFAULT_ONBOARDING_FLOW_CONFIG);
    expect(resolved).toHaveLength(KNOWN_QUESTION_IDS.length);
    for (const page of resolved) {
      expect(page.questionIds).toHaveLength(1);
    }
  });
});

describe('pageQuestionIds', () => {
  it('flattens and de-duplicates question ids in page order', () => {
    const pages = [
      { id: 'a', title: 'A', questionIds: ['primary_goal', 'priority'] },
      { id: 'b', title: 'B', questionIds: ['priority', 'support_level'] },
    ];
    expect(pageQuestionIds(pages)).toEqual(['primary_goal', 'priority', 'support_level']);
  });
});
