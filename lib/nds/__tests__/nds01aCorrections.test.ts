/**
 * NDS-01A failing-first closures for R02, R06, R07, R08 that do not need
 * a database. Real PostgreSQL races live in test/localdb.
 */

import { attributeConsumedDay, belongsToConsumedDay, NDS_DAY_POLICY_VERSION } from '../dayIdentity';
import { decideResponseState } from '../resolveDailyNDS';
import { foodObjectToGrounding } from '@/lib/meals/componentGrounding';
import { normalizeConsumedDay } from '../consumedInputs/normalizeConsumedEntry';
import type { ConsumedFoodEvidence } from '../consumedInputs/types';
import type { MealComponent } from '@/lib/meals/types';

const CHICAGO_LATE = '2026-09-13T02:30:00.000Z';

describe('R02 consumed-day membership', () => {
  it('attributes a Chicago 9:30pm instant to September 12, not the UTC date', () => {
    const entry = {
      occurred_at: CHICAGO_LATE,
      payload: {
        consumed_day: {
          date_local: '2026-09-12',
          time_zone: 'America/Chicago',
          utc_instant: CHICAGO_LATE,
          policy_version: NDS_DAY_POLICY_VERSION,
        },
      },
    };
    expect(attributeConsumedDay(entry).dateLocal).toBe('2026-09-12');
    expect(belongsToConsumedDay(entry, '2026-09-12')).toBe(true);
    expect(belongsToConsumedDay(entry, '2026-09-13')).toBe(false);
  });

  it('rejects metadata whose embedded instant is not the row occurred_at', () => {
    const entry = {
      occurred_at: '2026-09-14T18:00:00.000Z',
      payload: {
        consumed_day: {
          date_local: '2026-09-12',
          time_zone: 'America/Chicago',
          utc_instant: CHICAGO_LATE,
          policy_version: NDS_DAY_POLICY_VERSION,
        },
      },
    };
    const attributed = attributeConsumedDay(entry);
    expect(attributed.provenance).toBe('legacy_unverified');
    expect(attributed.metadataRejection).toBe('inconsistent_instant_for_row');
  });
});

describe('R07 added-sugar lineage', () => {
  it('does not copy catalog total sugar onto added_sugar_g', () => {
    const grounded = foodObjectToGrounding({
      id: 'food-apple',
      name: 'Apple',
      calories: 52,
      proteinG: 0.3,
      carbsG: 14,
      fatG: 0.2,
      fiberG: 2.4,
      sugarG: 10.3,
      servingSizeG: 100,
    } as never);
    expect(grounded.macros.added_sugar_g).toBeUndefined();
  });

  it('scores an otherwise-scorable day when added-sugar coverage is only partial', () => {
    const decided = decideResponseState(
      {
        intakeCount: 2,
        eligibleEntryCount: 2,
        malformedGroupCount: 0,
        parentComponentMismatchCount: 0,
      } as never,
      { calories: 'known', addedSugar: 'partial', fiber: 'known' } as never,
    );
    expect(decided.responseState).toBe('fresh');
  });

  it('does not treat catalog-grounded component added sugar as known', () => {
    const component: MealComponent = {
      component_id: 'c1',
      name: 'Apple',
      quantity: 1,
      unit: 'serving',
      food_object_id: 'food-apple',
      calories: 52,
      macros: { protein_g: 0.3, carbs_g: 14, fat_g: 0.2, added_sugar_g: 10.3 },
      nutrition_basis: 'per_component',
      match_status: 'matched',
      source_kind: 'food_object',
      needs_review: false,
    };
    const day = normalizeConsumedDay(
      'person-1',
      '2026-09-12',
      [
        {
          id: 'e1',
          person_id: 'person-1',
          entry_type: 'intake',
          occurred_at: '2026-09-12T18:00:00.000Z',
          payload: {
            name: 'Apple bowl',
            quantity: 1,
            calories: 52,
            meal_group: {
              consumed_servings: 1,
              components: [component],
              totals: { calories: 52, macros: { protein_g: 0.3, carbs_g: 14, fat_g: 0.2 } },
            },
          },
        },
      ],
    );
    expect(day.entries[0].added_sugar_g.availability).not.toBe('known');
  });
});

describe('R06 distinct quantity bases', () => {
  it('scales catalog per-serving evidence by servings, not the snapshot factor of one', () => {
    const evidence = new Map<string, ConsumedFoodEvidence>([
      [
        'food-oats',
        {
          foodObjectId: 'food-oats',
          canonicalName: 'Oats',
          brandName: null,
          category: 'grain',
          tags: [],
          provenance: 'legacy_catalog_lookup',
          evidenceToken: 'food-oats:v1',
          processingClass: 'whole',
          processingClassOverride: null,
          perServing: {
            calories: 150,
            protein_g: 5,
            fiber_g: 4,
            added_sugar_g: null,
            omega3_g: 0.1,
            omega6_g: 1.2,
            micronutrients: {
              potassium_mg: 100,
              magnesium_mg: null,
              iron_mg: null,
              calcium_mg: null,
              zinc_mg: null,
              folate_ug: null,
              vitamin_a_ug_rae: null,
              vitamin_c_mg: null,
              vitamin_d_ug: null,
              vitamin_b12_ug: null,
              sodium_mg: null,
            },
          },
        },
      ],
    ]);
    const day = normalizeConsumedDay(
      'person-1',
      '2026-09-12',
      [
        {
          id: 'e1',
          person_id: 'person-1',
          entry_type: 'intake',
          occurred_at: '2026-09-12T18:00:00.000Z',
          payload: {
            name: 'Oat bowl',
            quantity: 1,
            calories: 300,
            meal_group: {
              consumed_servings: 1,
              components: [
                {
                  component_id: 'c1',
                  name: 'Oats',
                  quantity: 2,
                  unit: 'serving',
                  food_object_id: 'food-oats',
                  calories: 300,
                  macros: { protein_g: 10, carbs_g: 54, fat_g: 6 },
                  nutrition_basis: 'per_component',
                  match_status: 'matched',
                  source_kind: 'food_object',
                  needs_review: false,
                },
              ],
              totals: { calories: 300, macros: { protein_g: 10, carbs_g: 54, fat_g: 6 } },
            },
          },
        },
      ],
      { foodEvidence: evidence },
    );
    const oats = day.entries[0].components[0];
    expect(oats.calories).toBe(300);
    expect(oats.omega3_g).toBeCloseTo(0.2, 5);
    expect(oats.micronutrients.potassium_mg).toBeCloseTo(200, 5);
  });
});

describe('R08 unusable inputs are not a fresh score', () => {
  it('refuses a malformed group even when another entry has energy', () => {
    const decided = decideResponseState(
      {
        intakeCount: 2,
        eligibleEntryCount: 2,
        malformedGroupCount: 1,
        parentComponentMismatchCount: 0,
      } as never,
      { calories: 'known', addedSugar: 'known', fiber: 'known' } as never,
    );
    expect(decided.responseState).toBe('insufficient_data');
  });
});
