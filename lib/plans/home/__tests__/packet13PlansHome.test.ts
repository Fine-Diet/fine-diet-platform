import fs from 'fs';
import path from 'path';

import { APP_DRAWER_HUBS } from '@/lib/navigation/appDrawerNavigation';
import { buildPlansHomeGuidance } from '../buildGuidance';
import { buildPlansHomeLogHref } from '../plansHomeActionRoutes';
import type { Plan, PlanDay, PlannedMeal, PlanSlot, ResolvedScheduleSlot } from '../../types';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

const plan: Plan = {
  id: 'plan-1',
  person_id: 'person-1',
  title: 'Week plan',
  plan_shape: 'week',
  source: 'user_manual',
  status: 'active',
  start_date: '2026-09-06',
  end_date: '2026-09-12',
  program_slug: null,
  program_run_id: null,
  input_snapshot_json: {} as Plan['input_snapshot_json'],
  nds_version: '1',
  classifier_version: '1',
  created_at: '',
  updated_at: '',
};

const day: PlanDay = {
  id: 'day-1',
  plan_id: plan.id,
  person_id: 'person-1',
  date_local: '2026-09-08',
  projected_nds_100: null,
  projected_wfr_10: null,
  projected_ps_10: null,
  projected_pnd_10: null,
  projected_fp_10: null,
  projected_as_10: null,
  projected_mnc_10: null,
  projected_ob_10: null,
  projection_confidence: null,
  projection_debug_json: null,
  notes: null,
  nds_version: '1',
  classifier_version: '1',
  created_at: '',
  updated_at: '',
};

const slots: PlanSlot[] = [
  {
    id: 'slot-breakfast',
    plan_day_id: day.id,
    person_id: 'person-1',
    slot_block: 'morning',
    slot_ordinal: 1,
    slot_label: 'Breakfast',
    target_time: '08:00',
    created_at: '',
    updated_at: '',
  },
  {
    id: 'slot-lunch',
    plan_day_id: day.id,
    person_id: 'person-1',
    slot_block: 'midday',
    slot_ordinal: 2,
    slot_label: 'Lunch',
    target_time: '12:00',
    created_at: '',
    updated_at: '',
  },
];

const schedule = [
  {
    key: 'occasion_1',
    label: 'Breakfast',
    target_time: '08:00',
    slot_block: 'morning',
    enabled: true,
    source: 'saved',
  },
  {
    key: 'occasion_4',
    label: 'Lunch',
    target_time: '12:00',
    slot_block: 'midday',
    enabled: true,
    source: 'saved',
  },
] as ResolvedScheduleSlot[];

function meal(
  executionState: PlannedMeal['execution_state'],
  journalEntryId: string | null,
): PlannedMeal {
  return {
    id: `meal-${executionState}`,
    plan_id: plan.id,
    plan_day_id: day.id,
    plan_slot_id: slots[0]!.id,
    person_id: 'person-1',
    name: 'Oats',
    meal_type: 'breakfast',
    payload: {},
    protein_score_10: null,
    is_main_meal: false,
    psq_multiplier: 1,
    meal_derived_data: {
      protein_score_10: null,
      is_main_meal: false,
      meal_calories: null,
      meal_protein_g: null,
      psq_multiplier: 1,
    },
    nds_confidence: 'medium',
    source_template_id: null,
    source_imported_meal_id: null,
    reusable_provenance: null,
    nds_version: '1',
    classifier_version: '1',
    execution_state: executionState,
    journal_entry_id: journalEntryId,
    created_at: '',
    updated_at: '',
  };
}

describe('Packet 13 Plans Home contract', () => {
  it.each([
    ['pending', null],
    ['eaten', 'entry-1'],
    ['skipped', null],
  ] as const)('counts a %s meal as planned', (executionState, journalEntryId) => {
    const model = buildPlansHomeGuidance({
      plan,
      days: [day],
      slots,
      meals: [meal(executionState, journalEntryId)],
      scheduleSlots: schedule,
      selectedDate: day.date_local,
      hasSchedule: true,
    });

    expect(model.plannedCount).toBe(1);
    expect(model.totalCount).toBe(2);
    expect(model.rows[0]?.state).toBe(executionState);
    expect(model.rows[0]?.journalEntryId).toBe(journalEntryId);
    expect(model.days[2]?.markers[0]?.planned).toBe(true);
    expect(model.days[2]?.markers[1]?.planned).toBe(false);
  });

  it('uses the existing planned-meal Log handoff without a consumption mutation', () => {
    const row = buildPlansHomeGuidance({
      plan,
      days: [day],
      slots,
      meals: [meal('pending', null)],
      scheduleSlots: schedule,
      selectedDate: day.date_local,
      hasSchedule: true,
    }).rows[0]!;
    const href = buildPlansHomeLogHref({ row, selectedDate: day.date_local });

    expect(href).toContain('/app/log/new');
    expect(href).toContain(`plannedMealId=${row.mealId}`);
    expect(href).toContain('mode=planned');
    expect(read('components/plans/home/PlansHomeView.tsx')).not.toContain('executeMeal(');
  });

  it('retires Food reporting and execution markers from canonical Plans Home', () => {
    const view = read('components/plans/home/PlansHomeView.tsx');
    const module = read('components/plans/home/MealGuidanceModule.tsx');
    const marker = read('components/plans/home/MealStateMarker.tsx');

    expect(view).not.toMatch(/PantryReadiness|usePantryReadiness|pantryHook|buildLivePlansNbaInput/);
    expect(module).toContain('Planned {model.plannedCount} of {model.totalCount}');
    expect(module).toContain("row.state === 'eaten'");
    expect(module).toContain('Open Log entry');
    expect(marker).not.toMatch(/check|skipped|eaten/);
    expect(marker).toContain('planned');
  });

  it('uses the existing rhythm overlay and latest reusable-plan taxonomy', () => {
    const view = read('components/plans/home/PlansHomeView.tsx');
    const plans = APP_DRAWER_HUBS.find((hub) => hub.id === 'plans');

    expect(view).toContain('openMealRhythm');
    expect(view).toContain("trigger: 'plans'");
    expect(plans?.items?.filter((item) => item.group === 'library').map((item) => item.label))
      .toEqual(['Meals', 'Day Plans', 'Week Plans']);
  });

  it('keeps Plans Home month navigation local while Month remains objectless', () => {
    const view = read('components/plans/home/PlansHomeView.tsx');
    expect(view).toContain('shiftMonthDateKey');
    expect(view).toContain('router.replace');
    expect(view).not.toMatch(/MonthPlan/);
    expect(fs.existsSync(path.join(process.cwd(), 'pages/app/plans/month.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), 'pages/app/plans/month/index.tsx'))).toBe(false);
  });
});
