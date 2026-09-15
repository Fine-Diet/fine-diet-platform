/**
 * NDS-01B failing-first closures for A01–A06 that do not need a database.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { NDS_COMPUTATION_IDENTITY, NDS_DEPENDENCY_FINGERPRINT } from '../computationIdentity';
import { NDS_VERSION, CLASSIFIER_VERSION } from '../types';
import { NDS_NORMALIZER_VERSION } from '../consumedInputs/types';
import { NDS_DAY_POLICY_VERSION } from '../dayIdentity';
import { computeDependencyFingerprint } from '../resolveDailyNDS';
import { normalizeConsumedDay } from '../consumedInputs/normalizeConsumedEntry';
import { attachConsumedNutritionEvidence } from '../consumedEvidence';
import { computeQuantities } from '@/lib/units/convert';
import { journalService } from '@/lib/journal/journalService';
import type { MealComponent } from '@/lib/meals/types';

describe('A01 computation identity', () => {
  it('application constants agree with the canonical identity', () => {
    expect(NDS_VERSION).toBe(NDS_COMPUTATION_IDENTITY.nds_version);
    expect(CLASSIFIER_VERSION).toBe(NDS_COMPUTATION_IDENTITY.classifier_version);
    expect(NDS_NORMALIZER_VERSION).toBe(NDS_COMPUTATION_IDENTITY.normalizer_version);
    expect(NDS_DAY_POLICY_VERSION).toBe(NDS_COMPUTATION_IDENTITY.day_policy_version);
    expect(computeDependencyFingerprint()).toBe(NDS_DEPENDENCY_FINGERPRINT);
  });

  it('fresh-install SQL seeds the current identity, not the retired v1 strings', () => {
    const step02 = readFileSync(
      join(process.cwd(), 'scripts/sql/ndsIntegrityV1_02_resolverAndWorker.sql'),
      'utf8',
    );
    expect(step02).toContain(`'${NDS_COMPUTATION_IDENTITY.normalizer_version}'`);
    expect(step02).toContain(`'${NDS_COMPUTATION_IDENTITY.day_policy_version}'`);
    expect(step02).toContain(`'${NDS_DEPENDENCY_FINGERPRINT}'`);
    expect(step02).not.toMatch(/nds_consumed_normalizer_2026-09-12\.v1/);
    expect(step02).not.toMatch(/nds_day_policy_2026-09-12\.v1/);
  });
});

describe('A03 plan and grouped consumption notifications', () => {
  it('executeMeal notifies after eat, log_adjusted, and undo, not skip', () => {
    const source = readFileSync(join(process.cwd(), 'lib/plans/planService.ts'), 'utf8');
    const method = source.slice(source.indexOf('async executeMeal'));
    const body = method.slice(0, method.indexOf('async getMeal'));
    expect(body).toContain("action === 'eat'");
    expect(body).toContain("action === 'log_adjusted'");
    expect(body).toContain("action === 'undo'");
    expect(body).toContain('notifyNdsConsumptionCommitted');
    expect(body).not.toMatch(/if \(action === 'skip'\)[\s\S]*notifyNdsConsumptionCommitted/);
  });

  it('timestamp movement on grouped instances uses conservative invalidation', () => {
    const source = readFileSync(join(process.cwd(), 'lib/journal/journalService.ts'), 'utf8');
    const method = source.slice(source.indexOf('async updateGroupedMealInstance'));
    expect(method).toContain('patch.occurred_at');
    expect(method).toContain('notifyNdsConsumptionCommitted({ dateLocals: [] })');
  });
});

describe('A05 household conversion', () => {
  it('does not treat an unknown cup as a serving count', () => {
    const result = computeQuantities('cup', 2, 100, [], { refuseUnknownHousehold: true });
    expect(result.status).toBe('household_measure_unavailable');
    expect(result.quantityG).toBeNull();
  });

  it('converts a 200 g cup against a 100 g catalog serving exactly', () => {
    const result = computeQuantities('cup', 1, 100, [{ unit: 'cup', grams: 200 }]);
    expect(result.status).toBe('exact');
    expect(result.quantityG).toBe(200);
    expect(result.servingQty).toBe(2);
  });

  it('retains a write-time snapshot through a later client claim strip', () => {
    const first = attachConsumedNutritionEvidence(
      { calories: 120, macros: { protein: 10, added_sugar_g: 4, added_sugar_provenance: 'authored' } },
      { quantityG: 100, quantityConversion: 'exact' },
    );
    const evidence = (first as { consumed_nutrition_evidence: { added_sugar_g: number } })
      .consumed_nutrition_evidence;
    expect(evidence.added_sugar_g).toBe(4);
  });
});

describe('A06 parent sugar cannot override untrusted components', () => {
  const untrusted: MealComponent = {
    component_id: 'c1',
    name: 'Syrup',
    quantity: 1,
    unit: 'serving',
    food_object_id: 'food-syrup',
    calories: 50,
    macros: {
      protein_g: 0,
      carbs_g: 12,
      fat_g: 0,
      added_sugar_g: 12,
      added_sugar_provenance: 'untrusted_catalog_total_sugar',
    },
    nutrition_basis: 'per_component',
    match_status: 'matched',
    source_kind: 'food_object',
    needs_review: false,
  };

  it('keeps grouped sugar unknown when only a derived parent total is present', () => {
    const day = normalizeConsumedDay('person-1', '2026-09-12', [
      {
        id: 'e1',
        person_id: 'person-1',
        entry_type: 'intake',
        occurred_at: '2026-09-12T18:00:00.000Z',
        payload: {
          name: 'Syrup bowl',
          quantity: 1,
          calories: 50,
          meal_group: {
            consumed_servings: 1,
            components: [untrusted],
            totals: { calories: 50, macros: { protein_g: 0, added_sugar_g: 12 } },
          },
        },
      },
    ]);
    expect(day.entries[0].added_sugar_g.availability).not.toBe('known');
  });

  it('accepts an authored whole-meal sugar assertion', () => {
    const day = normalizeConsumedDay('person-1', '2026-09-12', [
      {
        id: 'e1',
        person_id: 'person-1',
        entry_type: 'intake',
        occurred_at: '2026-09-12T18:00:00.000Z',
        payload: {
          name: 'Authored meal',
          quantity: 1,
          calories: 50,
          added_sugar_provenance: 'authored',
          meal_group: {
            consumed_servings: 1,
            components: [],
            totals: {
              calories: 50,
              macros: { protein_g: 0, added_sugar_g: 3, added_sugar_provenance: 'authored' },
            },
          },
        },
      },
    ]);
    expect(day.entries[0].added_sugar_g.availability).toBe('known');
    expect(day.entries[0].added_sugar_g.value).toBe(3);
  });
});
