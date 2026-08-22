/**
 * Nutrition Targets v1 — source-level holds.
 *
 * Mirrors components/plans/rhythm/__tests__/overlayCorrectionHolds.test.ts:
 * asserts against the actual source text so a future edit that silently
 * breaks an approved-copy, architecture-reuse, or policy-review hold fails
 * CI instead of only being caught in review.
 */

import fs from 'fs';
import path from 'path';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('Nutrition Targets v1 — approved copy hold', () => {
  it('Log-home setup card uses the exact founder-approved copy', () => {
    const src = read('components/journal/NutritionTargetsSetupCard.tsx');
    expect(src).toContain('For best tracking results');
    expect(src).toContain('Define your nutrition targets');
    expect(src).toContain('Set Up');
  });
});

describe('Nutrition Targets v1 — Meal-Rhythm-style overlay reuse', () => {
  const overlaySrc = () => read('components/nutrition/targets/NutritionTargetsOverlay.tsx');

  it('shares the same content-area bounds class as Meal Rhythm rather than a second modal convention', () => {
    expect(overlaySrc()).toContain('MEAL_RHYTHM_OVERLAY_CONTENT_LEFT_CLASS');
  });

  it('stays below the top nav (z-[60]) like Meal Rhythm — does not escalate over it', () => {
    const src = overlaySrc();
    expect(src).toContain('z-[51]');
    expect(src).not.toMatch(/z-\[(6[1-9]|[7-9]\d|[1-9]\d{2,})\]/);
  });

  it('implements a Tab focus trap and Escape-to-dismiss, matching Meal Rhythm', () => {
    const src = overlaySrc();
    expect(src).toContain("event.key !== 'Tab'");
    expect(src).toContain("event.key !== 'Escape'");
    expect(src).toContain('dismissWithoutSave');
  });

  it('never allows Escape/close to dismiss while on the confirm phase (matches Meal Rhythm B4 hold)', () => {
    const src = overlaySrc();
    expect(src).toContain("if (ctrl.phase === 'confirm') return;");
  });
});

describe('Nutrition Targets v1 — AppShell / footer integration holds', () => {
  it('AppShell marks background chrome inert while the Nutrition Targets overlay is open, alongside Meal Rhythm', () => {
    const src = read('components/journal/AppShell.tsx');
    expect(src).toContain('useNutritionTargetsOverlay');
    expect(src).toContain('nutritionTargetsOpen');
    expect(src).toContain('mealRhythmOpen || nutritionTargetsOpen');
    expect(src).toContain('NutritionTargetsOverlayProvider');
  });

  it('footer drops behind the Nutrition Targets overlay exactly like Meal Rhythm (shared contract)', () => {
    const src = read('components/journal/JournalFooterNav.tsx');
    expect(src).toContain('useNutritionTargetsOverlay');
    expect(src).toContain('mealRhythmOpen || nutritionTargetsOpen');
  });
});

describe('Nutrition Targets v1 — no second/competing persistence store', () => {
  it('save.ts writes only through the existing canonical goals + profile endpoints', () => {
    const src = read('lib/nutrition/targets/save.ts');
    expect(src).toContain("fetch('/api/journal/goals'");
    expect(src).toContain("fetch('/api/journal/profile'");
    // Guard against a future accidental new endpoint for this feature.
    const fetchCalls = src.match(/fetch\('([^']+)'/g) ?? [];
    expect(fetchCalls.sort()).toEqual(["fetch('/api/journal/goals'", "fetch('/api/journal/profile'"]);
  });
});

describe('Nutrition Targets v1 — calorie-equation policy (reviewed in Bridge thread FD-PLATFORM:nutrition-targets-v1)', () => {
  it('estimate.ts uses the reviewed NASEM 2023 adult EER model, explicitly versioned', () => {
    const src = read('lib/nutrition/targets/estimate.ts');
    expect(src).toContain("ESTIMATE_MODEL_VERSION = 'nasem_eer_2023.adult.v1'");
    expect(src).toContain('NASEM');
  });

  it('requires supported adult inputs and returns null instead of clamping an unsupported estimate', () => {
    const src = read('lib/nutrition/targets/estimate.ts');
    expect(src).toContain('MIN_SUPPORTED_ADULT_AGE_YEARS');
    expect(src).not.toContain('clamped_to_safety_bounds');
    expect(src).not.toMatch(/MIN_REASONABLE_CALORIES|MAX_REASONABLE_CALORIES/);
  });

  it('never derives a deficit/surplus target — v1 estimates maintenance only (no such field is computed)', () => {
    const src = read('lib/nutrition/targets/estimate.ts');
    // The module's own doc comment explicitly calls out that it never infers
    // a deficit/surplus; guard that no such value is actually computed/returned.
    expect(src).not.toMatch(/deficitCalories|surplusCalories|goalAdjustedCalories/);
  });
});

describe('Nutrition Targets v1 — activity mapping (review item: activity_mapping)', () => {
  it('maps the stored activity taxonomy deterministically onto the four NASEM EER categories, including legacy athlete', () => {
    const src = read('lib/nutrition/targets/estimate.ts');
    expect(src).toContain("sedentary: 'inactive'");
    expect(src).toContain("lightly_active: 'low_active'");
    expect(src).toContain("moderately_active: 'active'");
    expect(src).toContain("very_active: 'very_active'");
    expect(src).toContain("athlete: 'very_active'");
  });
});

describe('Nutrition Targets v1 — macro targets are optional, never required (review item: macro_optional_semantics)', () => {
  it('controller resolves macros through the shared all-or-nothing resolver rather than synthesizing 0s', () => {
    const src = read('components/nutrition/targets/useNutritionTargetsController.ts');
    expect(src).toContain('resolveOptionalMacroInputs');
    expect(src).not.toMatch(/Number\(draftMacros\.\w+\) \|\| 0/);
  });

  it('Profile durable-editing section resolves macros through the same shared resolver, not its own coercion', () => {
    const src = read('pages/journal/profile.tsx');
    expect(src).toContain('resolveOptionalMacroInputs');
    expect(src).not.toMatch(/Number\(protein\) \|\| 0/);
  });

  it('save() forwards macroGoals whenever the caller supplies the key, including an explicit null clear', () => {
    const src = read('lib/nutrition/targets/save.ts');
    expect(src).toContain('if (input.macroGoals !== undefined) body.macroGoals = input.macroGoals;');
  });

  it('editor never presents macros as required — every macro field is labeled optional', () => {
    const src = read('components/nutrition/targets/NutritionTargetsEditor.tsx');
    expect(src).toContain('optional');
  });
});

describe('Nutrition Targets v1 — Profile owns durable activity editing (review item: profile_activity_ownership)', () => {
  it('Nutrition Targets Profile section exposes an editable activity control, not a read-only hint', () => {
    const src = read('pages/journal/profile.tsx');
    expect(src).toContain('Activity level');
    expect(src).toContain('onSaveProfile({ activity_baseline:');
  });

  it('changing activity never silently overwrites the confirmed calorie target in the same code path', () => {
    const src = read('pages/journal/profile.tsx');
    // The estimate preview is a separate piece of state the user must
    // explicitly apply via the "Use this" button click — it must not be
    // auto-assigned into `cal` as a side effect of selecting an activity.
    expect(src).toContain('previewEstimate');
    expect(src).toContain('onClick={() => setCal(previewEstimate)}');
    const setCalWithPreviewCount = (src.match(/setCal\(previewEstimate\)/g) ?? []).length;
    expect(setCalWithPreviewCount).toBe(1);
  });
});

describe('Nutrition Targets v1 — blanking all three macros is an explicit clear (review item: clear_existing_macros)', () => {
  it('the canonical goals API forwards an explicit macroGoals: null clear signal rather than dropping it', () => {
    const src = read('pages/api/journal/goals.ts');
    expect(src).toContain("body.macroGoals === null");
    // Guard against reverting to the old truthy-only check that silently
    // dropped an explicit clear.
    expect(src).not.toMatch(/if \(body\.macroGoals && typeof body\.macroGoals === 'object'\) patch\.macroGoals = body\.macroGoals;/);
  });

  it('updateUserGoals actually deletes the stored macroGoals on an explicit null rather than merging a no-op', () => {
    const src = read('lib/journal/journalServerService.ts');
    expect(src).toContain('delete updatedMetadata.macroGoals');
  });

  it('the overlay controller does not turn "macros not mentioned" into an implicit clear of already-set macros', () => {
    const src = read('components/nutrition/targets/useNutritionTargetsController.ts');
    expect(src).toContain("'macroGoals' in opts");
    // Guard against reverting to `opts.macroGoals ?? null`, which forced
    // acceptEstimate() (which never mentions macroGoals) to send an
    // unintended clear on every calorie-only "Looks Good" confirmation.
    expect(src).not.toContain('macroGoals: opts.macroGoals ?? null');
  });

  it('Profile always sends macroGoals explicitly (even when null) since it is the direct source of truth for those fields', () => {
    const src = read('pages/journal/profile.tsx');
    expect(src).toContain('macroGoals: resolvedMacros.macroGoals,');
    // Guard against reverting to the old conditional spread that omitted the
    // key (and therefore silently preserved stale stored macros) whenever
    // the user intentionally blanked all three fields.
    expect(src).not.toContain('...(resolvedMacros.macroGoals ? { macroGoals: resolvedMacros.macroGoals } : {})');
  });
});

describe('Nutrition Targets v1 — unconfirmed Profile calories are never a saveable placeholder (review item: unconfirmed_profile_calorie_placeholder)', () => {
  it('SectionNutritionTargets never seeds an unconfirmed calorie target with a fabricated 2000 default', () => {
    const src = read('pages/journal/profile.tsx');
    expect(src).not.toMatch(/goals\?\.dailyCalorieGoal \?\? 2000/);
    expect(src).not.toContain('useState(2000)');
    expect(src).toContain('goals && !goals.isDefault ? goals.dailyCalorieGoal : null');
    expect(src).toContain('setCal(goals.isDefault ? null : goals.dailyCalorieGoal)');
  });

  it('handleSave refuses to save while the calorie target is unconfirmed (null) instead of falling back to a default', () => {
    const src = read('pages/journal/profile.tsx');
    expect(src).toContain('if (cal == null) {');
  });
});
