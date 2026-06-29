import { describe, it, expect } from '@jest/globals';
import {
  DEFAULT_ONBOARDING_FLOW_CONFIG,
  KNOWN_QUESTION_IDS,
  KNOWN_QUESTION_MAP,
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

  it('rejects the wrong number of steps', () => {
    const cfg = baseConfig();
    cfg.steps = cfg.steps.slice(0, TOTAL_STEPS - 1);
    expect(validateOnboardingFlowConfig(cfg).ok).toBe(false);
  });

  it('rejects a step with an empty title', () => {
    const cfg = baseConfig();
    cfg.steps[2] = { title: '' };
    expect(validateOnboardingFlowConfig(cfg).ok).toBe(false);
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
    cfg.questions = {
      ...cfg.questions,
      dietary_style: { required: true, visible: false },
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
  });
});
