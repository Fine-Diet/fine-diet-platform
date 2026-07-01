import { describe, it, expect } from '@jest/globals';
import {
  APP_COPY_BASELINE_QUESTION_IDS,
  DEFAULT_ONBOARDING_FLOW_CONFIG,
  KNOWN_QUESTION_IDS,
  KNOWN_QUESTION_MAP,
  OPTIONAL_APP_COPY_QUESTION_IDS,
  REQUIRED_APP_COPY_QUESTION_IDS,
  type OnboardingFlowConfig,
} from '../onboardingFlowTypes';
import { TOTAL_STEPS } from '../defaultOnboardingFlow';
import {
  validateOnboardingFlowConfig,
  validateOnboardingFlowRecord,
} from '../onboardingFlowValidation';

function baseConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_ONBOARDING_FLOW_CONFIG)) as typeof DEFAULT_ONBOARDING_FLOW_CONFIG;
}

describe('validateOnboardingFlowConfig — default config', () => {
  it('the code-owned default config passes validation', () => {
    const result = validateOnboardingFlowConfig(DEFAULT_ONBOARDING_FLOW_CONFIG);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});

describe('validateOnboardingFlowConfig — structural errors', () => {
  it('rejects an invalid version', () => {
    const cfg = baseConfig();
    (cfg as unknown as { version: number }).version = 2;
    expect(validateOnboardingFlowConfig(cfg).ok).toBe(false);
  });

  it('strips a legacy `steps` field (no longer part of the schema)', () => {
    const cfg = baseConfig() as unknown as Record<string, unknown>;
    cfg.steps = [{ title: 'legacy' }];
    const result = validateOnboardingFlowConfig(cfg);
    expect(result.ok).toBe(true);
  });

  it('rejects an unknown question id', () => {
    const cfg = baseConfig();
    (cfg.questions as Record<string, unknown>).bogus_question = { prompt: 'x' };
    const result = validateOnboardingFlowConfig(cfg);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path.startsWith('questions'))).toBe(true);
  });

  it('rejects duplicate question ids (zod record collapses, but unknown ids fail)', () => {
    // zod record keys are unique by construction; ensure an unknown id fails.
    const cfg = baseConfig();
    (cfg.questions as Record<string, unknown>).totally_made_up = { required: true };
    expect(validateOnboardingFlowConfig(cfg).ok).toBe(false);
  });

  it('strips unknown top-level keys', () => {
    const cfg = baseConfig() as unknown as Record<string, unknown>;
    cfg.evilMetadataKey = 'people.metadata.arbitrary';
    const result = validateOnboardingFlowConfig(cfg);
    expect(result.ok).toBe(true);
  });
});

describe('validateOnboardingFlowConfig — option allowlists', () => {
  it('rejects an optionLabels key that is not an allowed value', () => {
    const cfg = baseConfig();
    cfg.questions = {
      ...cfg.questions,
      primary_goal: { optionLabels: { 'not-a-real-goal': 'X' } },
    } as typeof cfg.questions;
    const result = validateOnboardingFlowConfig(cfg);
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((i) => i.path === 'questions.primary_goal.optionLabels.not-a-real-goal'),
    ).toBe(true);
  });

  it('accepts a valid optionLabels override', () => {
    const cfg = baseConfig();
    const allowed = KNOWN_QUESTION_MAP.get('primary_goal')!.allowedOptionValues![0];
    cfg.questions = {
      ...cfg.questions,
      primary_goal: { optionLabels: { [allowed]: 'Renamed' } },
    } as typeof cfg.questions;
    expect(validateOnboardingFlowConfig(cfg).ok).toBe(true);
  });

  it('rejects an optionOrder with an unknown value', () => {
    const cfg = baseConfig();
    cfg.questions = {
      ...cfg.questions,
      primary_goal: { optionOrder: ['not-a-real-goal'] },
    } as typeof cfg.questions;
    expect(validateOnboardingFlowConfig(cfg).ok).toBe(false);
  });

  it('rejects an optionOrder with a duplicate value', () => {
    const def = KNOWN_QUESTION_MAP.get('primary_goal')!;
    const allowed = def.allowedOptionValues!;
    const cfg = baseConfig();
    cfg.questions = {
      ...cfg.questions,
      primary_goal: { optionOrder: [allowed[0], allowed[0]] },
    } as typeof cfg.questions;
    const result = validateOnboardingFlowConfig(cfg);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path === 'questions.primary_goal.optionOrder')).toBe(true);
  });

  it('accepts a valid reordered optionOrder (subset/permutation)', () => {
    const def = KNOWN_QUESTION_MAP.get('primary_goal')!;
    const allowed = def.allowedOptionValues!;
    const cfg = baseConfig();
    cfg.questions = {
      ...cfg.questions,
      primary_goal: { optionOrder: [...allowed].reverse() },
    } as typeof cfg.questions;
    expect(validateOnboardingFlowConfig(cfg).ok).toBe(true);
  });
});

describe('validateOnboardingFlowConfig — malformed required option sets', () => {
  it('rejects required as a non-boolean', () => {
    const cfg = baseConfig();
    cfg.questions = {
      ...cfg.questions,
      primary_goal: { required: 'yes' as unknown as boolean },
    } as typeof cfg.questions;
    expect(validateOnboardingFlowConfig(cfg).ok).toBe(false);
  });

  it('accepts a clean required + visible toggle', () => {
    const cfg = baseConfig();
    // Use an allowlisted grouped page so hiding one of two questions still
    // leaves a visible question on the page (one-question-per-page means
    // hiding a sole question would otherwise empty its page).
    cfg.pages = [
      {
        id: 'rhythm',
        title: 'Weekly cooking rhythm',
        questionIds: ['cooking_days', 'prep_days'],
        groupingReason: 'weekly_cooking_rhythm',
      },
    ];
    cfg.questions = {
      ...cfg.questions,
      cooking_days: { required: true, visible: false },
    } as typeof cfg.questions;
    expect(validateOnboardingFlowConfig(cfg).ok).toBe(true);
  });
});

describe('validateOnboardingFlowRecord', () => {
  it('rejects a missing title', () => {
    const result = validateOnboardingFlowRecord({
      flowKey: 'default',
      config: DEFAULT_ONBOARDING_FLOW_CONFIG,
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path === 'title')).toBe(true);
  });

  it('rejects a missing flowKey', () => {
    const result = validateOnboardingFlowRecord({
      title: 'Welcome',
      config: DEFAULT_ONBOARDING_FLOW_CONFIG,
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path === 'flowKey')).toBe(true);
  });

  it('passes a valid record and returns the config', () => {
    const result = validateOnboardingFlowRecord({
      flowKey: 'default',
      title: 'Welcome to Fine Diet',
      config: DEFAULT_ONBOARDING_FLOW_CONFIG,
    });
    expect(result.ok).toBe(true);
    expect(result.record).toEqual(DEFAULT_ONBOARDING_FLOW_CONFIG);
  });
});

describe('known-question catalog invariants', () => {
  it('every known question id is unique', () => {
    const ids = KNOWN_QUESTION_IDS;
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every known question has a step in range', () => {
    for (const id of KNOWN_QUESTION_IDS) {
      const def = KNOWN_QUESTION_MAP.get(id)!;
      expect(def.step).toBeGreaterThanOrEqual(0);
      expect(def.step).toBeLessThan(TOTAL_STEPS);
    }
  });

  it('profile targets are a fixed, code-owned allowlist (no admin-invented keys)', () => {
    // Sanity: a few expected canonical keys are present.
    expect(KNOWN_QUESTION_MAP.get('primary_goal')!.profileTarget).toBe('primary_goal');
    expect(KNOWN_QUESTION_MAP.get('sex')!.profileTarget).toBe('sex');
    expect(KNOWN_QUESTION_MAP.get('household_size')!.profileTarget).toBe('household_size');
    expect(KNOWN_QUESTION_MAP.get('activity_level')!.profileTarget).toBe('activity_baseline');
  });

  it('review_acknowledgement has no profile or onboarding blob write target', () => {
    const def = KNOWN_QUESTION_MAP.get('review_acknowledgement')!;
    expect(def.profileTarget).toBeUndefined();
    expect(def.onboardingBlobPath).toBeUndefined();
  });
});

describe('App Copy 23-item required/optional split', () => {
  it('the baseline has exactly 23 answer-bearing items', () => {
    expect(APP_COPY_BASELINE_QUESTION_IDS).toHaveLength(23);
  });

  it('required + optional split covers all 23 baseline items with no overlap', () => {
    const required = new Set<string>(REQUIRED_APP_COPY_QUESTION_IDS);
    const optional = new Set<string>(OPTIONAL_APP_COPY_QUESTION_IDS);
    expect(REQUIRED_APP_COPY_QUESTION_IDS).toHaveLength(14);
    expect(OPTIONAL_APP_COPY_QUESTION_IDS).toHaveLength(9);
    for (const id of Array.from(required)) {
      expect(optional.has(id)).toBe(false);
    }
    for (const id of APP_COPY_BASELINE_QUESTION_IDS) {
      expect(required.has(id) || optional.has(id)).toBe(true);
    }
  });

  it('the default config marks exactly the 14 required questions as required', () => {
    const requiredSet = new Set<string>(REQUIRED_APP_COPY_QUESTION_IDS);
    for (const id of APP_COPY_BASELINE_QUESTION_IDS) {
      const override = DEFAULT_ONBOARDING_FLOW_CONFIG.questions[id as keyof typeof DEFAULT_ONBOARDING_FLOW_CONFIG.questions];
      expect(override?.required).toBe(requiredSet.has(id));
    }
  });

  it('every baseline question id is a known, code-owned question', () => {
    for (const id of APP_COPY_BASELINE_QUESTION_IDS) {
      expect(KNOWN_QUESTION_MAP.has(id)).toBe(true);
    }
  });
});

describe('validateOnboardingFlowConfig — page sequencing', () => {
  it('the default config (code-owned pages) passes validation', () => {
    expect(validateOnboardingFlowConfig(DEFAULT_ONBOARDING_FLOW_CONFIG).ok).toBe(true);
  });

  it('accepts a valid one-question-per-page sequence', () => {
    const cfg = baseConfig();
    cfg.pages = [
      { id: 'p-goal', title: 'Goal', questionIds: ['primary_goal'] },
      { id: 'p-priority', title: 'Priority', questionIds: ['priority'] },
    ];
    expect(validateOnboardingFlowConfig(cfg).ok).toBe(true);
  });

  it('rejects a page with an empty title', () => {
    const cfg = baseConfig();
    cfg.pages = [{ id: 'p', title: '', questionIds: ['primary_goal'] }];
    expect(validateOnboardingFlowConfig(cfg).ok).toBe(false);
  });

  it('rejects duplicate page ids', () => {
    const cfg = baseConfig();
    cfg.pages = [
      { id: 'dup', title: 'A', questionIds: ['primary_goal'] },
      { id: 'dup', title: 'B', questionIds: ['priority'] },
    ];
    const result = validateOnboardingFlowConfig(cfg);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path === 'pages' && /Duplicate page id/.test(i.message))).toBe(true);
  });

  it('rejects an unknown question id on a page', () => {
    const cfg = baseConfig();
    cfg.pages = [{ id: 'p', title: 'X', questionIds: ['not_a_real_question'] }];
    const result = validateOnboardingFlowConfig(cfg);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /Unknown question id/.test(i.message))).toBe(true);
  });

  it('rejects a question id appearing on more than one page', () => {
    const cfg = baseConfig();
    cfg.pages = [
      { id: 'a', title: 'A', questionIds: ['primary_goal'] },
      { id: 'b', title: 'B', questionIds: ['primary_goal'] },
    ];
    const result = validateOnboardingFlowConfig(cfg);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /more than one page/.test(i.message))).toBe(true);
  });

  it('rejects a grouped page that is not allowlisted', () => {
    const cfg = baseConfig();
    // dietary_style + allergies are not a code-owned grouping → must split.
    cfg.pages = [
      { id: 'a', title: 'A', questionIds: ['dietary_style', 'allergies'] },
    ];
    expect(validateOnboardingFlowConfig(cfg).ok).toBe(false);
  });

  it('accepts an allowlisted grouping with the matching reason', () => {
    const cfg = baseConfig();
    cfg.pages = [
      {
        id: 'rhythm',
        title: 'Weekly cooking rhythm',
        questionIds: ['cooking_days', 'prep_days'],
        groupingReason: 'weekly_cooking_rhythm',
      },
    ];
    expect(validateOnboardingFlowConfig(cfg).ok).toBe(true);
  });

  it('rejects an allowlisted grouping with the wrong reason', () => {
    const cfg = baseConfig();
    cfg.pages = [
      {
        id: 'rhythm',
        title: 'Weekly cooking rhythm',
        questionIds: ['cooking_days', 'prep_days'],
        groupingReason: 'bogus_reason',
      },
    ];
    expect(validateOnboardingFlowConfig(cfg).ok).toBe(false);
  });

  it('rejects a visible page whose every question is hidden', () => {
    const cfg = baseConfig();
    cfg.questions = {
      ...cfg.questions,
      primary_goal: { visible: false },
    } as typeof cfg.questions;
    cfg.pages = [{ id: 'p', title: 'Goal', questionIds: ['primary_goal'] }];
    const result = validateOnboardingFlowConfig(cfg);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /no visible questions/.test(i.message))).toBe(true);
  });

  it('config cannot introduce new profile targets or blob paths via pages', () => {
    // Pages only reference known question ids; a bogus id is rejected, so no
    // new metadata target can be introduced through page sequencing.
    const cfg = baseConfig();
    cfg.pages = [{ id: 'p', title: 'X', questionIds: ['primary_goal', 'bogus'] }];
    expect(validateOnboardingFlowConfig(cfg).ok).toBe(false);
  });
});
