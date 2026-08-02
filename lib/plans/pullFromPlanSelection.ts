/**
 * Range-aware plan selection for the grocery-list "Pull from Plan" panel.
 * Pure helpers — no I/O, no global listPlansForPerson ordering changes.
 */

export type PullPlanStatus = 'draft' | 'active' | 'archived';

export type PullPlanCandidate = {
  id: string;
  status: PullPlanStatus;
  start_date: string;
  end_date: string | null;
  updated_at?: string | null;
  title?: string | null;
};

export type PlanRangeCoverage = 'full' | 'partial' | 'none';

export type PullPlanSelectionMode = 'auto' | 'manual';

export type RankedPlanForRange = {
  plan: PullPlanCandidate;
  coverage: PlanRangeCoverage;
  overlapDays: number;
  fullyCovers: boolean;
};

export type ResolvePullFromPlanSelectionResult = {
  selectedPlanId: string | null;
  selectionMode: PullPlanSelectionMode;
  coverage: PlanRangeCoverage;
  overlapDays: number;
  /** True when the chosen plan overlaps but does not fully cover the range. */
  partialCoverage: boolean;
  /** True when selectionMode flipped from manual→auto because overlap went to zero. */
  reboundFromZeroOverlap: boolean;
  ranked: RankedPlanForRange[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value: string, label: string): string {
  if (!DATE_RE.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD.`);
  }
  return value;
}

/** Inclusive calendar-day count between two YYYY-MM-DD strings (UTC date parts). */
export function inclusiveDayCount(start: string, end: string): number {
  const a = assertDate(start, 'start');
  const b = assertDate(end, 'end');
  if (b < a) return 0;
  const startMs = Date.UTC(
    Number(a.slice(0, 4)),
    Number(a.slice(5, 7)) - 1,
    Number(a.slice(8, 10)),
  );
  const endMs = Date.UTC(
    Number(b.slice(0, 4)),
    Number(b.slice(5, 7)) - 1,
    Number(b.slice(8, 10)),
  );
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

export function planEffectiveEndDate(plan: Pick<PullPlanCandidate, 'start_date' | 'end_date'>): string {
  return plan.end_date && DATE_RE.test(plan.end_date) ? plan.end_date : plan.start_date;
}

export function planRangeOverlapDays(
  plan: Pick<PullPlanCandidate, 'start_date' | 'end_date'>,
  rangeStart: string,
  rangeEnd: string,
): number {
  const start = assertDate(rangeStart, 'rangeStart');
  const end = assertDate(rangeEnd, 'rangeEnd');
  if (end < start) return 0;
  const planStart = assertDate(plan.start_date, 'plan.start_date');
  const planEnd = planEffectiveEndDate(plan);
  const overlapStart = planStart > start ? planStart : start;
  const overlapEnd = planEnd < end ? planEnd : end;
  if (overlapEnd < overlapStart) return 0;
  return inclusiveDayCount(overlapStart, overlapEnd);
}

export function planFullyCoversRange(
  plan: Pick<PullPlanCandidate, 'start_date' | 'end_date'>,
  rangeStart: string,
  rangeEnd: string,
): boolean {
  const start = assertDate(rangeStart, 'rangeStart');
  const end = assertDate(rangeEnd, 'rangeEnd');
  if (end < start) return false;
  return plan.start_date <= start && planEffectiveEndDate(plan) >= end;
}

function statusRank(status: PullPlanStatus): number {
  if (status === 'active') return 3;
  if (status === 'draft') return 2;
  return 1; // archived
}

function compareRanked(a: RankedPlanForRange, b: RankedPlanForRange): number {
  // Full coverage outranks partial; zero-overlap last.
  const tier = (r: RankedPlanForRange) => (r.fullyCovers ? 2 : r.overlapDays > 0 ? 1 : 0);
  const tierDiff = tier(b) - tier(a);
  if (tierDiff !== 0) return tierDiff;

  if (!a.fullyCovers) {
    const overlapDiff = b.overlapDays - a.overlapDays;
    if (overlapDiff !== 0) return overlapDiff;
  }

  const statusDiff = statusRank(b.plan.status) - statusRank(a.plan.status);
  if (statusDiff !== 0) return statusDiff;

  const aUpdated = a.plan.updated_at ?? '';
  const bUpdated = b.plan.updated_at ?? '';
  if (aUpdated !== bUpdated) return bUpdated < aUpdated ? -1 : 1;

  // Newest start_date wins
  if (a.plan.start_date !== b.plan.start_date) {
    return b.plan.start_date < a.plan.start_date ? -1 : 1;
  }
  return a.plan.id < b.plan.id ? -1 : a.plan.id > b.plan.id ? 1 : 0;
}

export function rankPlansForDateRange(
  plans: PullPlanCandidate[],
  rangeStart: string,
  rangeEnd: string,
): RankedPlanForRange[] {
  assertDate(rangeStart, 'rangeStart');
  assertDate(rangeEnd, 'rangeEnd');
  const ranked = plans.map((plan) => {
    const overlapDays = planRangeOverlapDays(plan, rangeStart, rangeEnd);
    const fullyCovers = planFullyCoversRange(plan, rangeStart, rangeEnd);
    const coverage: PlanRangeCoverage = fullyCovers ? 'full' : overlapDays > 0 ? 'partial' : 'none';
    return { plan, coverage, overlapDays, fullyCovers };
  });
  return ranked.sort(compareRanked);
}

export function bestPlanForDateRange(
  plans: PullPlanCandidate[],
  rangeStart: string,
  rangeEnd: string,
): RankedPlanForRange | null {
  const ranked = rankPlansForDateRange(plans, rangeStart, rangeEnd);
  const best = ranked[0];
  if (!best || best.overlapDays <= 0) return null;
  return best;
}

/**
 * Resolve which plan should be selected in the Pull from Plan panel.
 *
 * - Auto mode always follows the best range match.
 * - Manual mode keeps the current plan while it still overlaps.
 * - Zero overlap never sticks: rebinds to the best match (or clears) and
 *   returns to auto mode.
 */
export function resolvePullFromPlanSelection(args: {
  plans: PullPlanCandidate[];
  rangeStart: string;
  rangeEnd: string;
  currentPlanId: string | null;
  selectionMode: PullPlanSelectionMode;
}): ResolvePullFromPlanSelectionResult {
  const { plans, rangeStart, rangeEnd, currentPlanId, selectionMode } = args;
  const ranked = rankPlansForDateRange(plans, rangeStart, rangeEnd);
  const best = ranked.find((r) => r.overlapDays > 0) ?? null;

  if (selectionMode === 'manual' && currentPlanId) {
    const current = ranked.find((r) => r.plan.id === currentPlanId) ?? null;
    if (current && current.overlapDays > 0) {
      return {
        selectedPlanId: current.plan.id,
        selectionMode: 'manual',
        coverage: current.coverage,
        overlapDays: current.overlapDays,
        partialCoverage: current.coverage === 'partial',
        reboundFromZeroOverlap: false,
        ranked,
      };
    }
    // Zero overlap (or unknown id): rebind honestly.
    return {
      selectedPlanId: best?.plan.id ?? null,
      selectionMode: 'auto',
      coverage: best?.coverage ?? 'none',
      overlapDays: best?.overlapDays ?? 0,
      partialCoverage: best?.coverage === 'partial',
      reboundFromZeroOverlap: true,
      ranked,
    };
  }

  // Auto (or no current selection)
  return {
    selectedPlanId: best?.plan.id ?? null,
    selectionMode: 'auto',
    coverage: best?.coverage ?? 'none',
    overlapDays: best?.overlapDays ?? 0,
    partialCoverage: best?.coverage === 'partial',
    reboundFromZeroOverlap: false,
    ranked,
  };
}

export function formatPullFromPlanOptionLabel(plan: PullPlanCandidate): string {
  const title = plan.title?.trim() || 'Untitled plan';
  const end = planEffectiveEndDate(plan);
  const range = plan.start_date === end ? plan.start_date : `${plan.start_date}–${end}`;
  return `${title} (${plan.status}, ${range})`;
}

export type GroceryDemandEmptyReason =
  | 'no_plan_days_in_range'
  | 'no_pending_meals'
  | 'no_derived_items';

export function computeGroceryDemandEmptyReason(diagnostics: {
  source_day_count: number;
  pending_meal_count: number;
  derived_item_count: number;
}): GroceryDemandEmptyReason | null {
  if (diagnostics.derived_item_count > 0) return null;
  if (diagnostics.source_day_count === 0) return 'no_plan_days_in_range';
  if (diagnostics.pending_meal_count === 0) return 'no_pending_meals';
  return 'no_derived_items';
}

export function groceryPullEmptyMessage(reason: GroceryDemandEmptyReason | null | undefined): string {
  switch (reason) {
    case 'no_plan_days_in_range':
      return 'No plan days in this date range for that plan.';
    case 'no_pending_meals':
      return 'That plan has days in this range, but no pending meals to shop for.';
    case 'no_derived_items':
      return 'Pending meals exist, but no grocery demand could be derived.';
    default:
      return 'No pending grocery needs were added for this plan and date range.';
  }
}
