/**
 * Plans Authoring Convergence — Phase 3: composer contract additions
 * (`'plan-edit'` mode, `'update_plan'` action). Focused on the "action
 * availability must be deterministic, never a dead button" guardrail —
 * MealComposer only renders a button for an action id BOTH listed in
 * MEAL_COMPOSER_CONTEXT_ACTIONS for the current mode AND given a handler by
 * the caller (see components/meals/composer/MealComposer.tsx's
 * `if (!handler) return null`). These tests pin the config side of that
 * contract so a future edit can't silently add/remove an action id without
 * a caller noticing.
 */
import {
  MEAL_COMPOSER_CONTEXT_ACTIONS,
  composerModeLogsConsumption,
  createInitialComposerState,
} from '../types';
import { createBlankMealDocument } from '../state';

describe('plan-edit mode contract', () => {
  it('exposes exactly one action: update_plan', () => {
    expect(MEAL_COMPOSER_CONTEXT_ACTIONS['plan-edit']).toEqual([
      { id: 'update_plan', label: 'Save changes to plan', emphasis: 'primary' },
    ]);
  });

  it('does not log consumption (no servings-eaten field) — it edits planned intent, not intake', () => {
    expect(composerModeLogsConsumption('plan-edit')).toBe(false);
  });
});

describe('plan mode contract (Phase 2 config unchanged by the Phase 3 additions)', () => {
  it('still lists add_to_plan/save_as_meal/save_and_add, in that order', () => {
    expect(MEAL_COMPOSER_CONTEXT_ACTIONS.plan.map((a) => a.id)).toEqual([
      'add_to_plan',
      'save_as_meal',
      'save_and_add',
    ]);
  });

  it('does not log consumption', () => {
    expect(composerModeLogsConsumption('plan')).toBe(false);
  });
});

describe('every mode maps to a non-empty, id-unique action list', () => {
  it('has no duplicate action ids within a single mode', () => {
    for (const [mode, actions] of Object.entries(MEAL_COMPOSER_CONTEXT_ACTIONS)) {
      const ids = actions.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(actions.length).toBeGreaterThan(0);
      void mode;
    }
  });
});

describe('createInitialComposerState with the new modes', () => {
  it('seeds plan-edit state like any other mode (mode-agnostic initializer)', () => {
    const state = createInitialComposerState('plan-edit', createBlankMealDocument());
    expect(state.mode).toBe('plan-edit');
    expect(state.needsReview).toBe(false);
  });
});
