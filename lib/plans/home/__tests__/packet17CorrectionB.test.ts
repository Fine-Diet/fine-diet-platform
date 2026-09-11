import fs from 'fs';
import path from 'path';

import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { committedLogEntryHref } from '@/components/journal/plans/SlotCard';
import {
  countPlannedStructuralSlots,
  resolveEnsureOccasionScheduleSlots,
  resolveFrozenPlanEnabledScheduleSlots,
} from '@/lib/plans/frozenPlanSchedule';
import { presentationSlotsFromSchedule } from '@/lib/plans/resolveRequestedPlanDateState';
import type { Plan, PlannedMeal, ResolvedScheduleSlot } from '@/lib/plans/types';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

const frozenBreakfast: ResolvedScheduleSlot = {
  key: 'occasion_2',
  enabled: true,
  target_time: '08:00',
  label: 'Breakfast',
  slot_block: 'morning',
  source: 'profile',
};
const frozenLunch: ResolvedScheduleSlot = {
  key: 'occasion_4',
  enabled: true,
  target_time: '12:30',
  label: 'Lunch',
  slot_block: 'midday',
  source: 'profile',
};
const frozenSnack: ResolvedScheduleSlot = {
  key: 'occasion_5',
  enabled: true,
  target_time: '15:30',
  label: 'Afternoon snack',
  slot_block: 'midday',
  source: 'profile',
};
const frozenDinner: ResolvedScheduleSlot = {
  key: 'occasion_7',
  enabled: true,
  target_time: '19:00',
  label: 'Dinner',
  slot_block: 'evening',
  source: 'profile',
};

function frozenPlan(): Pick<Plan, 'input_snapshot_json'> {
  return {
    input_snapshot_json: {
      schedule_snapshot: {
        profile_schedule: {} as never,
        resolved_slots: [frozenBreakfast, frozenLunch, frozenSnack, frozenDinner],
        conflicts: [],
      },
    } as Plan['input_snapshot_json'],
  };
}

describe('Packet 17 Correction B frozen Plan schedule', () => {
  it('uses the Plan frozen schedule, not later live Profile occasions', () => {
    const liveProfileSlots: ResolvedScheduleSlot[] = [
      {
        key: 'occasion_2',
        enabled: true,
        target_time: '10:00',
        label: 'Late breakfast',
        slot_block: 'morning',
        source: 'profile',
      },
    ];
    const frozen = resolveFrozenPlanEnabledScheduleSlots(frozenPlan());
    const ensure = resolveEnsureOccasionScheduleSlots(frozenPlan(), liveProfileSlots);
    const rows = presentationSlotsFromSchedule(frozen);

    expect(ensure.source).toBe('frozen_plan');
    expect(rows.map((row) => row.slot.slot_label)).toEqual([
      'Breakfast',
      'Lunch',
      'Afternoon snack',
      'Dinner',
    ]);
    expect(rows.map((row) => row.slot.target_time)).toEqual([
      '08:00',
      '12:30',
      '15:30',
      '19:00',
    ]);
    expect(rows.map((row) => row.slot.slot_label)).not.toContain('Late breakfast');
    expect(ensure.slots).toEqual(frozen);
    expect(ensure.slots).not.toBe(liveProfileSlots);
  });

  it('does not let a later Profile schedule rewrite unmaterialized Day rows', () => {
    const before = presentationSlotsFromSchedule(
      resolveFrozenPlanEnabledScheduleSlots(frozenPlan()),
    );
    const laterLive: ResolvedScheduleSlot[] = [
      {
        key: 'occasion_7',
        enabled: true,
        target_time: '21:00',
        label: 'Midnight dinner',
        slot_block: 'evening',
        source: 'profile',
      },
    ];
    const after = presentationSlotsFromSchedule(
      resolveEnsureOccasionScheduleSlots(frozenPlan(), laterLive).slots,
    );

    expect(after.map((row) => `${row.slot.slot_label}:${row.slot.target_time}`)).toEqual(
      before.map((row) => `${row.slot.slot_label}:${row.slot.target_time}`),
    );
  });

  it('keeps Day presentation and Save ensure on the frozen Plan schedule', () => {
    const day = read('pages/journal/plans/day/[date].tsx');
    const ensure = read('lib/plans/planStructureServerService.ts');

    expect(day).toContain('resolveFrozenPlanEnabledScheduleSlots(plan)');
    expect(day).toContain('presentationSlotsFromSchedule(frozenScheduleSlots)');
    expect(day).not.toContain('getEnabledMealSlots');
    expect(ensure).toContain('resolveEnsureOccasionScheduleSlots(plan');
    expect(ensure.indexOf('getEnabledMealSlots(mealSchedule)')).toBeGreaterThan(
      ensure.indexOf("frozenResolution.source === 'live_profile'"),
    );
  });
});

describe('Packet 17 Correction B Plans-to-Log boundary', () => {
  it('opens canonical draft-first Log with exact plannedMealId and does not eat from Day', () => {
    const day = read('pages/journal/plans/day/[date].tsx');
    const slotCard = read('components/journal/plans/SlotCard.tsx');
    const href = APP_ROUTE_BUILDERS.logNewPlanned({
      date: '2026-09-10',
      time: '08:00',
      mealSlot: 'occasion_2',
      plannedMealId: 'meal-exact',
      redirect: APP_ROUTE_BUILDERS.planDayWithPlan('2026-09-10', 'plan-1'),
    });

    expect(href).toContain('/app/log/new');
    expect(href).toContain('plannedMealId=meal-exact');
    expect(href).toContain('mode=planned');
    expect(day).toContain('APP_ROUTE_BUILDERS.logNewPlanned');
    expect(day).toContain('plannedMealId: meal.id');
    expect(day).toMatch(/executeMeal\(meal\.id, action\)/);
    expect(day).not.toMatch(/executeMeal\([^)]*'eat'/);
    expect(day).toContain("action: 'skip' | 'undo'");
    expect(slotCard).toContain('onAdjustLog(meal)');
    expect(slotCard).toContain('Quick Log');
    expect(slotCard).not.toContain("onExecute(meal, 'eat')");
    expect(slotCard).not.toContain('Log as planned');
  });

  it('routes a logged Meal with journal_entry_id to the committed editor', () => {
    const slotCard = read('components/journal/plans/SlotCard.tsx');
    expect(committedLogEntryHref('entry-abc')).toBe('/app/log/entry/entry-abc');
    expect(committedLogEntryHref(null)).toBeNull();
    expect(slotCard).toContain('committedLogEntryHref(meal.journal_entry_id)');
    expect(slotCard).not.toContain('${APP_ROUTES.log}?date=');
    expect(slotCard).not.toContain('Logged ✓');
  });

  it('keeps planning count binary regardless of logged execution state', () => {
    const meals = [
      { plan_slot_id: 'slot-1' },
      { plan_slot_id: 'slot-1' },
    ] as Array<Pick<PlannedMeal, 'plan_slot_id'>>;
    expect(countPlannedStructuralSlots(meals)).toBe(1);
    expect(countPlannedStructuralSlots([{ plan_slot_id: 'slot-1' }])).toBe(1);
    const day = read('pages/journal/plans/day/[date].tsx');
    const slotCard = read('components/journal/plans/SlotCard.tsx');
    expect(day).toContain('countPlannedStructuralSlots(meals)');
    expect(slotCard).toContain('<MealStateMarker planned={meals.length > 0} />');
  });

  it('keeps persisted removal on the shared composer confirmation path', () => {
    const dayView = read('components/journal/plans/DayView.tsx');
    const panel = read('components/journal/plans/PlanMealComposerPanel.tsx');
    const capture = read('components/meals/composer/NutritionCaptureDraft.tsx');
    const day = read('pages/journal/plans/day/[date].tsx');

    expect(dayView).not.toContain('onRemove={slotMeals.length > 0');
    expect(day).not.toContain('planService.deleteMeal');
    expect(capture).toContain('pendingRemovalId');
    expect(panel).toContain('await planService.deleteMeal(props.meal.id)');
    expect(panel).not.toContain('deleteMealTemplate');
    expect(panel).not.toContain('deleteSavedMeal');
  });
});
