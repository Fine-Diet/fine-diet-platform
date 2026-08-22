/**
 * Nutrition Targets v1 — review item "clear_existing_macros" regression
 * coverage for the actual persistence layer.
 *
 * `resolveOptionalMacroInputs()` (lib/nutrition/targets/save.ts) already
 * correctly resolves an all-blank macro entry to `macroGoals: null`, but the
 * bug this fixes was one layer down: `updateUserGoals()` merged `{}` into
 * the existing stored macroGoals object on an explicit `null`, which is a
 * no-op — so a previously-confirmed macro target survived a user's explicit
 * "clear my macros" intent. This exercises the real Supabase-backed
 * persistence function end to end (write, then re-read) against an in-memory
 * fake, rather than only asserting on the outgoing request shape.
 */

import { createFakeSupabase, type Row } from '@/lib/plans/__tests__/testSupabaseFake';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { getUserGoals, updateUserGoals } from '../journalServerService';

function installFake(initial: Record<string, Row[]> = {}) {
  const fake = createFakeSupabase(initial);
  (supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => fake.from(table));
  return fake;
}

const PERSON_ID = 'person-1';

function seedConfirmedMacros() {
  return installFake({
    people: [
      {
        id: PERSON_ID,
        metadata: {
          dailyCalorieGoal: 2200,
          macroGoals: { protein_g: 150, carbs_g: 200, fat_g: 70 },
        },
      },
    ],
  });
}

describe('updateUserGoals — macroGoals tri-state (review item: clear_existing_macros)', () => {
  it('regression: previously-set macros → user blanks all three → returned goals show macros unset and macroGoalsSet=false', async () => {
    seedConfirmedMacros();

    const before = await getUserGoals(PERSON_ID);
    expect(before.macroGoalsSet).toBe(true);
    expect(before.macroGoals).toEqual({ protein_g: 150, carbs_g: 200, fat_g: 70 });

    // Mirrors what resolveOptionalMacroInputs() returns for an all-blank
    // macro entry, forwarded as an explicit clear (not omitted).
    const after = await updateUserGoals(PERSON_ID, { macroGoals: null });

    expect(after.macroGoalsSet).toBe(false);
    // Never the stale previously-confirmed values — a real clear, not a
    // merge no-op.
    expect(after.macroGoals).not.toEqual({ protein_g: 150, carbs_g: 200, fat_g: 70 });
    // The calorie target (untouched by this call) is unaffected by clearing macros.
    expect(after.dailyCalorieGoal).toBe(2200);
    expect(after.isDefault).toBe(false);

    // Re-reading independently confirms the clear was actually persisted,
    // not just reflected in the immediate return value.
    const reread = await getUserGoals(PERSON_ID);
    expect(reread.macroGoalsSet).toBe(false);
  });

  it('omitting macroGoals entirely (calorie-only save) leaves a previously-set macro target untouched', async () => {
    seedConfirmedMacros();

    const after = await updateUserGoals(PERSON_ID, { dailyCalorieGoal: 2300 });

    expect(after.macroGoalsSet).toBe(true);
    expect(after.macroGoals).toEqual({ protein_g: 150, carbs_g: 200, fat_g: 70 });
    expect(after.dailyCalorieGoal).toBe(2300);
  });

  it('setting a new complete macroGoals object replaces it rather than merging over stale fields', async () => {
    seedConfirmedMacros();

    const after = await updateUserGoals(PERSON_ID, {
      macroGoals: { protein_g: 180, carbs_g: 220, fat_g: 60 },
    });

    expect(after.macroGoals).toEqual({ protein_g: 180, carbs_g: 220, fat_g: 60 });
    expect(after.macroGoalsSet).toBe(true);
  });
});
