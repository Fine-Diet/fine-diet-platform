/**
 * Adapter from canonical consumed inputs to the pure daily calculator.
 *
 * NDS-01 checkpoint A. Preserves every protected product boundary:
 *
 *  - The three scoring blocks (morning / midday / evening) stay as they are;
 *    only the timezone the local hour is read in is corrected.
 *  - Isolated-snack eligibility is applied at the LOGGED-ENTRY level, before
 *    components are expanded into foods, so component expansion cannot change
 *    the existing policy.
 *  - Parent totals supply QUANTITY (calories, protein, fiber, added sugar) and
 *    components supply QUALITY evidence (processing class, plant colour,
 *    micronutrients, omegas). The same intake is never counted twice.
 *  - Added sugar is summed from its own field. Total sugar is never substituted
 *    and unknown is never scored as a measured zero; coverage is reported so the
 *    resolver can decide honestly.
 */

import type { DailyFoodData, DailyMealData } from '../dailyCalculator';
import { MAIN_MEAL_KCAL_THRESHOLD } from '../types';
import { calculateMealProteinScore } from '../tiers';
import type { TimeBlock } from '@/lib/journal/types';
import {
  deriveBlockForAttribution,
  summarizeDayProvenance,
  type ConsumedDayProvenance,
  type DayProvenanceSummary,
} from '../dayIdentity';
import type {
  NormalizedConsumedDay,
  NormalizedConsumedEntry,
  NutrientAvailability,
} from './types';
import { MICRONUTRIENT_KEYS } from './types';

/**
 * Isolated-snack policy, preserved exactly from the existing implementation:
 * intake below 200 kcal with no other entry within 90 minutes is excluded
 * before daily scoring.
 */
const SNACK_KCAL_THRESHOLD = 200;
const SNACK_ISOLATION_MINUTES = 90;

/** Protein source quality when rebuilding block protein scores (preserved). */
const BLOCK_PSQ_MULTIPLIER = 1.0;

export interface ConsumedDayCoverage {
  /** Availability of daily added sugar across every eligible entry. */
  addedSugar: NutrientAvailability;
  /** Availability of daily fiber across every eligible entry. */
  fiber: NutrientAvailability;
  /** Availability of daily energy across every eligible entry. */
  calories: NutrientAvailability;
  /** Eligible entries that reported no added-sugar evidence at all. */
  entriesMissingAddedSugar: number;
  /** Eligible entries that reported no energy at all. */
  entriesMissingCalories: number;
}

export interface ConsumedDayDiagnostics {
  entryCount: number;
  intakeCount: number;
  /** Logged ENTRIES excluded by the isolated-snack policy (not ingredients). */
  entriesExcludedAsIsolatedSnacks: number;
  eligibleEntryCount: number;
  mealCount: number;
  /** Components that carried no usable nutrition evidence. */
  unresolvedComponentCount: number;
  malformedGroupCount: number;
  parentComponentMismatchCount: number;
  dayProvenance: DayProvenanceSummary;
  entriesWithLegacyDayProvenance: number;
  blocks: Array<{
    block: TimeBlock;
    entryCount: number;
    calories: number;
    isMainMeal: boolean;
  }>;
}

export interface BuildDailyMealsResult {
  meals: DailyMealData[];
  coverage: ConsumedDayCoverage;
  diagnostics: ConsumedDayDiagnostics;
}

function availabilityOf(known: number, unknown: number): NutrientAvailability {
  if (known === 0) return 'unknown';
  return unknown > 0 ? 'partial' : 'known';
}

/**
 * Apply the isolated-snack policy to whole logged entries.
 *
 * Runs on entries, never on expanded components, so a grouped meal with many
 * ingredients is judged by the same rule as a single food.
 */
function excludeIsolatedSnackEntries(
  entries: readonly NormalizedConsumedEntry[],
): { eligible: NormalizedConsumedEntry[]; excluded: NormalizedConsumedEntry[] } {
  if (entries.length === 0) return { eligible: [], excluded: [] };

  const timestamps = entries.map((entry) => new Date(entry.occurredAtUtc).getTime());
  const radiusMs = SNACK_ISOLATION_MINUTES * 60 * 1000;

  const eligible: NormalizedConsumedEntry[] = [];
  const excluded: NormalizedConsumedEntry[] = [];

  entries.forEach((entry, index) => {
    const calories = entry.calories.value;

    // Unknown energy cannot be judged against a calorie threshold; keep the
    // entry and let coverage reporting surface the gap.
    if (calories === null || calories >= SNACK_KCAL_THRESHOLD) {
      eligible.push(entry);
      return;
    }

    const hasNeighbour = entries.some(
      (_, other) =>
        other !== index && Math.abs(timestamps[other] - timestamps[index]) <= radiusMs,
    );

    if (hasNeighbour) {
      eligible.push(entry);
    } else {
      excluded.push(entry);
    }
  });

  return { eligible, excluded };
}

/**
 * Quality-evidence foods for one entry.
 *
 * Component calories are the component's own consumed contribution. When the
 * parent is the only thing that knows the energy (no components resolved), a
 * single food stands in for the entry so the whole-food ratio still has a
 * denominator instead of silently dropping the intake.
 */
function foodsForEntry(entry: NormalizedConsumedEntry): DailyFoodData[] {
  if (entry.components.length > 0) {
    return entry.components.map((component) => {
      const nutrients: DailyFoodData['nutrients'] = {};
      for (const key of MICRONUTRIENT_KEYS) {
        nutrients[key] = component.micronutrients[key];
      }
      return {
        id: component.foodObjectId ?? component.componentId,
        canonicalName: component.name,
        brandName: component.brandName,
        category: component.category,
        tags: component.tags,
        calories: component.calories ?? 0,
        processingClass: component.processingClass,
        processingClassOverride: component.processingClassOverride,
        nutrients,
        omega3_g: component.omega3_g,
        omega6_g: component.omega6_g,
      };
    });
  }

  return [
    {
      id: entry.entryId,
      canonicalName: entry.displayName,
      calories: entry.calories.value ?? 0,
    },
  ];
}

/**
 * Group eligible entries into the three preserved scoring blocks and rebuild
 * block-level meals for the pure calculator.
 */
export function buildDailyMealsFromConsumedDay(
  day: NormalizedConsumedDay,
  options: { totalEntryCount?: number } = {},
): BuildDailyMealsResult {
  const intakeEntries = day.entries;
  const { eligible, excluded } = excludeIsolatedSnackEntries(intakeEntries);

  const provenances: ConsumedDayProvenance[] = [];
  let legacyProvenanceCount = 0;

  const blockGroups = new Map<TimeBlock, NormalizedConsumedEntry[]>();
  for (const entry of eligible) {
    // Each entry's block is read in the timezone that entry itself recorded, so
    // the server process timezone can never decide a scoring block.
    const entryAttribution = entry.dayAttribution;
    provenances.push(entryAttribution.provenance);
    if (entryAttribution.provenance === 'legacy_unverified') legacyProvenanceCount += 1;

    const block = deriveBlockForAttribution(entryAttribution);
    const group = blockGroups.get(block) ?? [];
    group.push(entry);
    blockGroups.set(block, group);
  }

  const meals: DailyMealData[] = [];
  const blockDiagnostics: ConsumedDayDiagnostics['blocks'] = [];

  let addedSugarKnown = 0;
  let addedSugarUnknown = 0;
  let fiberKnown = 0;
  let fiberUnknown = 0;
  let caloriesKnown = 0;
  let caloriesUnknown = 0;

  for (const [block, group] of Array.from(blockGroups.entries())) {
    let blockCalories = 0;
    let blockProtein = 0;
    let blockFiber = 0;
    let blockAddedSugar = 0;
    let blockAddedSugarKnown = false;
    const blockFoods: DailyFoodData[] = [];

    for (const entry of group) {
      if (entry.calories.value !== null) {
        blockCalories += entry.calories.value;
        caloriesKnown += 1;
      } else {
        caloriesUnknown += 1;
      }

      if (entry.protein_g.value !== null) blockProtein += entry.protein_g.value;

      if (entry.fiber_g.availability === 'known') {
        blockFiber += entry.fiber_g.value ?? 0;
        fiberKnown += 1;
      } else if (entry.fiber_g.availability === 'partial') {
        blockFiber += entry.fiber_g.value ?? 0;
        fiberKnown += 1;
        fiberUnknown += 1;
      } else {
        fiberUnknown += 1;
      }

      if (entry.added_sugar_g.availability === 'known') {
        blockAddedSugar += entry.added_sugar_g.value ?? 0;
        blockAddedSugarKnown = true;
        addedSugarKnown += 1;
      } else if (entry.added_sugar_g.availability === 'partial') {
        blockAddedSugar += entry.added_sugar_g.value ?? 0;
        blockAddedSugarKnown = true;
        addedSugarKnown += 1;
        addedSugarUnknown += 1;
      } else {
        addedSugarUnknown += 1;
      }

      blockFoods.push(...foodsForEntry(entry));
    }

    const isMainMeal = blockCalories >= MAIN_MEAL_KCAL_THRESHOLD;
    const proteinScore10 = calculateMealProteinScore(
      blockProtein,
      blockCalories,
      BLOCK_PSQ_MULTIPLIER,
    );

    meals.push({
      id: `block-${block}`,
      calories: blockCalories,
      protein_g: blockProtein,
      fiber_g: blockFiber,
      // Undefined, not 0, when nothing in the block reported added sugar. The
      // resolver decides what an incomplete day may claim; the calculator is
      // never handed a fabricated zero disguised as a measurement.
      ...(blockAddedSugarKnown ? { added_sugar_g: blockAddedSugar } : {}),
      is_main_meal: isMainMeal,
      protein_score_10: proteinScore10,
      foods: blockFoods,
    });

    blockDiagnostics.push({
      block,
      entryCount: group.length,
      calories: Math.round(blockCalories),
      isMainMeal,
    });
  }

  const unresolvedComponentCount = eligible.reduce(
    (sum, entry) =>
      sum + entry.components.filter((component) => component.provenance === 'unresolved').length,
    0,
  );

  return {
    meals,
    coverage: {
      addedSugar: availabilityOf(addedSugarKnown, addedSugarUnknown),
      fiber: availabilityOf(fiberKnown, fiberUnknown),
      calories: availabilityOf(caloriesKnown, caloriesUnknown),
      entriesMissingAddedSugar: addedSugarUnknown,
      entriesMissingCalories: caloriesUnknown,
    },
    diagnostics: {
      entryCount: options.totalEntryCount ?? intakeEntries.length,
      intakeCount: intakeEntries.length,
      entriesExcludedAsIsolatedSnacks: excluded.length,
      eligibleEntryCount: eligible.length,
      mealCount: meals.length,
      unresolvedComponentCount,
      malformedGroupCount: intakeEntries.filter((entry) => entry.shape === 'malformed_group').length,
      parentComponentMismatchCount: intakeEntries.filter(
        (entry) => entry.parentComponentConsistency === 'mismatch',
      ).length,
      dayProvenance: summarizeDayProvenance(provenances),
      entriesWithLegacyDayProvenance: legacyProvenanceCount,
      blocks: blockDiagnostics,
    },
  };
}
