import type { MacroGoals } from '@/lib/journal/types';
import {
  ALIGNMENT_TOLERANCE_KCAL,
  LOCKED_MACROS_EXCEED_MESSAGE,
  UNCONFIRMED_FALLBACK_CALORIE_GOAL,
  UNCONFIRMED_FALLBACK_MACRO_GOALS,
  applyCalorieTargetChange,
  applyGramEdit,
  applyPercentEdit,
  calorieGap,
  caloriesForGrams,
  classifyMacroCompleteness,
  gramsFromPercentage,
  isCalorieMacroAligned,
  lockedCaloriesExceedTarget,
  percentageOfBudget,
  rebalanceMacros,
  roundToWholeGrams,
  totalMacroCalories,
  type MacroLocks,
} from '../macroEnergy';

const ALIGNED_2500: MacroGoals = { protein_g: 205, carbs_g: 263, fat_g: 70 };
const LEGACY_MISMATCH: MacroGoals = { protein_g: 150, carbs_g: 250, fat_g: 80 };
const UNLOCKED: MacroLocks = { protein: false, carbs: false, fat: false };

function locks(overrides: Partial<MacroLocks> = {}): MacroLocks {
  return { ...UNLOCKED, ...overrides };
}

describe('macro energy conversions', () => {
  it('uses 4/4/9 kcal per gram', () => {
    expect(caloriesForGrams('protein_g', 205)).toBe(820);
    expect(caloriesForGrams('carbs_g', 263)).toBe(1052);
    expect(caloriesForGrams('fat_g', 70)).toBe(630);
  });

  it('sums a macro set to total kcal', () => {
    expect(totalMacroCalories(ALIGNED_2500)).toBe(2502);
    expect(totalMacroCalories(LEGACY_MISMATCH)).toBe(2320);
  });

  it('derives percentage from the calorie budget', () => {
    expect(percentageOfBudget(2500, 'protein_g', 205)).toBeCloseTo(32.8, 5);
    expect(percentageOfBudget(2500, 'carbs_g', 263)).toBeCloseTo(42.08, 5);
    expect(percentageOfBudget(2500, 'fat_g', 70)).toBeCloseTo(25.2, 5);
  });

  it('converts percentage back to grams with 4/4/9', () => {
    expect(gramsFromPercentage(2500, 'protein_g', 32.8)).toBeCloseTo(205, 5);
    expect(gramsFromPercentage(2500, 'fat_g', 25.2)).toBeCloseTo(70, 5);
  });
});

describe('alignment classification', () => {
  it('treats exact equality as aligned', () => {
    const exact: MacroGoals = { protein_g: 125, carbs_g: 250, fat_g: 111 };
    expect(totalMacroCalories(exact)).toBe(2499);
    expect(isCalorieMacroAligned(2499, exact)).toBe(true);
  });

  it('accepts the ±10 kcal boundaries', () => {
    expect(isCalorieMacroAligned(2500, ALIGNED_2500)).toBe(true); // +2
    const plus10: MacroGoals = { protein_g: 205, carbs_g: 265, fat_g: 70 }; // 2510
    expect(calorieGap(2500, plus10)).toBe(10);
    expect(isCalorieMacroAligned(2500, plus10)).toBe(true);
    const minus10: MacroGoals = { protein_g: 205, carbs_g: 260, fat_g: 70 }; // 2490
    expect(calorieGap(2500, minus10)).toBe(-10);
    expect(isCalorieMacroAligned(2500, minus10)).toBe(true);
  });

  it('rejects an ±11 kcal mismatch', () => {
    const plus11: MacroGoals = { protein_g: 205, carbs_g: 263, fat_g: 71 };
    expect(calorieGap(2500, plus11)).toBe(11);
    expect(isCalorieMacroAligned(2500, plus11)).toBe(false);
    const minus11: MacroGoals = { protein_g: 205, carbs_g: 262, fat_g: 69 };
    expect(calorieGap(2500, minus11)).toBe(-11);
    expect(isCalorieMacroAligned(2500, minus11)).toBe(false);
  });

  it('flags the legacy 2500 / 150P / 250C / 80F mismatch', () => {
    expect(totalMacroCalories(LEGACY_MISMATCH)).toBe(2320);
    expect(calorieGap(2500, LEGACY_MISMATCH)).toBe(-180);
    expect(isCalorieMacroAligned(2500, LEGACY_MISMATCH)).toBe(false);
  });

  it('accepts 2500 / 205P / 263C / 70F', () => {
    expect(isCalorieMacroAligned(2500, ALIGNED_2500)).toBe(true);
    expect(Math.abs(calorieGap(2500, ALIGNED_2500))).toBeLessThanOrEqual(ALIGNMENT_TOLERANCE_KCAL);
  });
});

describe('rebalance with 0 locks', () => {
  it('preserves energy ratio and scales toward the calorie target', () => {
    const result = rebalanceMacros({
      dailyCalorieGoal: 2500,
      macros: LEGACY_MISMATCH,
      locks: UNLOCKED,
      intent: 'balance',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.aligned).toBe(true);
    expect(result.macros).toEqual(UNCONFIRMED_FALLBACK_MACRO_GOALS);
    expect(isCalorieMacroAligned(UNCONFIRMED_FALLBACK_CALORIE_GOAL, result.macros)).toBe(true);
  });
});

describe('rebalance with 1 lock', () => {
  it.each([
    ['protein'],
    ['carbs'],
    ['fat'],
  ] as const)('preserves locked %s grams and splits the rest', (locked) => {
    const result = rebalanceMacros({
      dailyCalorieGoal: 2500,
      macros: ALIGNED_2500,
      locks: locks({ [locked]: true }),
      intent: 'balance',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const key = locked === 'protein' ? 'protein_g' : locked === 'carbs' ? 'carbs_g' : 'fat_g';
    expect(result.macros[key]).toBe(ALIGNED_2500[key]);
    expect(result.aligned).toBe(true);
  });
});

describe('rebalance with 2 locks', () => {
  it.each([
    ['protein', 'carbs', 'fat_g'],
    ['protein', 'fat', 'carbs_g'],
    ['carbs', 'fat', 'protein_g'],
  ] as const)('solves the unlocked residual for %s+%s locked', (a, b, freeKey) => {
    const result = rebalanceMacros({
      dailyCalorieGoal: 2500,
      macros: ALIGNED_2500,
      locks: locks({ [a]: true, [b]: true }),
      intent: 'balance',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lockA = a === 'protein' ? 'protein_g' : a === 'carbs' ? 'carbs_g' : 'fat_g';
    const lockB = b === 'protein' ? 'protein_g' : b === 'carbs' ? 'carbs_g' : 'fat_g';
    expect(result.macros[lockA]).toBe(ALIGNED_2500[lockA]);
    expect(result.macros[lockB]).toBe(ALIGNED_2500[lockB]);
    expect(result.macros[freeKey]).toBeGreaterThanOrEqual(0);
    expect(result.aligned).toBe(true);
  });
});

describe('rebalance with 3 locks', () => {
  it('leaves an aligned trio unchanged', () => {
    const result = rebalanceMacros({
      dailyCalorieGoal: 2500,
      macros: ALIGNED_2500,
      locks: { protein: true, carbs: true, fat: true },
      intent: 'balance',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.macros).toEqual(ALIGNED_2500);
    expect(result.changed).toBe(false);
  });

  it('cannot solve a mismatched trio', () => {
    const result = rebalanceMacros({
      dailyCalorieGoal: 2500,
      macros: LEGACY_MISMATCH,
      locks: { protein: true, carbs: true, fat: true },
      intent: 'balance',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('three_locks_mismatch');
    expect(result.macros).toEqual(LEGACY_MISMATCH);
  });

  it('does not auto-change macros when calories change under 3 locks', () => {
    const result = applyCalorieTargetChange({
      dailyCalorieGoal: 2200,
      macros: ALIGNED_2500,
      locks: { protein: true, carbs: true, fat: true },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('locked_exceed_target');
    expect(result.macros).toEqual(ALIGNED_2500);
  });

  it('leaves macros unchanged when calories increase under 3 locks', () => {
    const result = applyCalorieTargetChange({
      dailyCalorieGoal: 2800,
      macros: ALIGNED_2500,
      locks: { protein: true, carbs: true, fat: true },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.macros).toEqual(ALIGNED_2500);
    expect(result.aligned).toBe(false);
    expect(result.changed).toBe(false);
  });
});

describe('calorie change with locked protein', () => {
  it('keeps protein grams when calories increase', () => {
    const result = applyCalorieTargetChange({
      dailyCalorieGoal: 2800,
      macros: ALIGNED_2500,
      locks: locks({ protein: true }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.macros.protein_g).toBe(205);
    expect(result.aligned).toBe(true);
    expect(totalMacroCalories(result.macros)).toBeGreaterThan(totalMacroCalories(ALIGNED_2500));
  });

  it('keeps protein grams when calories decrease', () => {
    const result = applyCalorieTargetChange({
      dailyCalorieGoal: 2200,
      macros: ALIGNED_2500,
      locks: locks({ protein: true }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.macros.protein_g).toBe(205);
    expect(result.aligned).toBe(true);
    expect(percentageOfBudget(2200, 'protein_g', 205)).toBeGreaterThan(
      percentageOfBudget(2500, 'protein_g', 205),
    );
  });
});

describe('direct gram and percentage edits', () => {
  it('treats a grams edit as the driver and absorbs into unlocked macros', () => {
    const result = applyGramEdit({
      dailyCalorieGoal: 2500,
      macros: ALIGNED_2500,
      locks: UNLOCKED,
      key: 'protein_g',
      grams: 220,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.macros.protein_g).toBe(220);
    expect(result.aligned).toBe(true);
    expect(result.macros.protein_g).not.toBe(ALIGNED_2500.protein_g);
  });

  it('does not auto-toggle lock state (locks are caller-owned)', () => {
    const held = locks({ carbs: true });
    const result = applyGramEdit({
      dailyCalorieGoal: 2500,
      macros: ALIGNED_2500,
      locks: held,
      key: 'protein_g',
      grams: 190,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(held).toEqual(locks({ carbs: true }));
    expect(result.macros.carbs_g).toBe(263);
  });

  it('converts a percentage edit through grams then the same engine', () => {
    const percent = percentageOfBudget(2500, 'protein_g', 220);
    const fromPercent = applyPercentEdit({
      dailyCalorieGoal: 2500,
      macros: ALIGNED_2500,
      locks: UNLOCKED,
      key: 'protein_g',
      percent,
    });
    const fromGrams = applyGramEdit({
      dailyCalorieGoal: 2500,
      macros: ALIGNED_2500,
      locks: UNLOCKED,
      key: 'protein_g',
      grams: roundToWholeGrams(gramsFromPercentage(2500, 'protein_g', percent)),
    });
    expect(fromPercent).toEqual(fromGrams);
    expect(fromPercent.ok).toBe(true);
  });

  it('makes gram and percent editors equivalent for the same resulting grams', () => {
    const grams = 180;
    const percent = percentageOfBudget(2500, 'fat_g', grams);
    const g = applyGramEdit({
      dailyCalorieGoal: 2500,
      macros: ALIGNED_2500,
      key: 'fat_g',
      grams,
    });
    const p = applyPercentEdit({
      dailyCalorieGoal: 2500,
      macros: ALIGNED_2500,
      key: 'fat_g',
      percent,
    });
    expect(g).toEqual(p);
  });
});

describe('impossible and degenerate states', () => {
  it('does not clamp when locked calories exceed the target', () => {
    const macros: MacroGoals = { protein_g: 400, carbs_g: 50, fat_g: 50 };
    const held = locks({ protein: true });
    expect(lockedCaloriesExceedTarget(1500, macros, held)).toBe(true);
    const result = rebalanceMacros({
      dailyCalorieGoal: 1500,
      macros,
      locks: held,
      intent: 'balance',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('locked_exceed_target');
    expect(result.message).toBe(LOCKED_MACROS_EXCEED_MESSAGE);
    expect(result.macros).toEqual(macros);
  });

  it('sets unlocked macros to 0 when remaining calories are ~0', () => {
    const macros: MacroGoals = { protein_g: 250, carbs_g: 250, fat_g: 56 };
    // locked P+C = 1000+1000=2000 on a 2000 goal
    const result = rebalanceMacros({
      dailyCalorieGoal: 2000,
      macros,
      locks: locks({ protein: true, carbs: true }),
      intent: 'balance',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.macros.protein_g).toBe(250);
    expect(result.macros.carbs_g).toBe(250);
    expect(result.macros.fat_g).toBe(0);
    expect(result.aligned).toBe(true);
  });

  it('refuses a degenerate unlocked ratio when remaining energy must be allocated', () => {
    const macros: MacroGoals = { protein_g: 0, carbs_g: 0, fat_g: 0 };
    const result = rebalanceMacros({
      dailyCalorieGoal: 2500,
      macros,
      locks: UNLOCKED,
      intent: 'balance',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('degenerate_ratio');
  });

  it('never emits negative grams', () => {
    const result = applyGramEdit({
      dailyCalorieGoal: 2500,
      macros: ALIGNED_2500,
      key: 'protein_g',
      grams: -5,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('negative_grams');
  });
});

describe('whole-gram deterministic rounding', () => {
  it('emits integer gram targets', () => {
    const result = rebalanceMacros({
      dailyCalorieGoal: 2500,
      macros: LEGACY_MISMATCH,
      intent: 'balance',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const value of Object.values(result.macros)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('is deterministic across repeated calls', () => {
    const a = rebalanceMacros({
      dailyCalorieGoal: 2500,
      macros: LEGACY_MISMATCH,
      intent: 'balance',
    });
    const b = rebalanceMacros({
      dailyCalorieGoal: 2500,
      macros: LEGACY_MISMATCH,
      intent: 'balance',
    });
    expect(a).toEqual(b);
  });
});

describe('optional macro completeness', () => {
  it('treats all macros unset as unset (valid optional trio)', () => {
    expect(classifyMacroCompleteness(null)).toBe('unset');
    expect(classifyMacroCompleteness(undefined)).toBe('unset');
    expect(classifyMacroCompleteness({})).toBe('unset');
  });

  it('treats a partial trio as invalid for confirmed targets', () => {
    expect(classifyMacroCompleteness({ protein_g: 150 })).toBe('partial');
    expect(classifyMacroCompleteness({ protein_g: 150, carbs_g: 200 })).toBe('partial');
  });

  it('treats a complete non-negative trio as complete', () => {
    expect(classifyMacroCompleteness(ALIGNED_2500)).toBe('complete');
    expect(classifyMacroCompleteness({ protein_g: 0, carbs_g: 0, fat_g: 0 })).toBe('complete');
  });
});
