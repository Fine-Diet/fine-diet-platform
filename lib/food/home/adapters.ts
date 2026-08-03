/**
 * Food Home live adapters — readiness rows + Ready Anytime from plan/grocery
 * services on current main. Pure mappers only; Views own fetch boundaries.
 */

import type { GroceryItem, PantryReadinessSummary, Plan } from '@/lib/plans/types';
import type {
  FoodHomeViewModel,
  FoodReadinessIngredientRow,
  FoodReadinessViewModel,
  ReadyAnytimeViewModel,
} from './types';

const DEFAULT_LIST_LABEL = 'My Grocery List';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatQuantity(item: GroceryItem): string {
  if (item.quantity == null || Number.isNaN(item.quantity)) {
    return item.unit?.trim() || 'As needed';
  }
  const qty = Number.isInteger(item.quantity)
    ? String(item.quantity)
    : String(Number(item.quantity.toFixed(2)));
  return item.unit?.trim() ? `${qty} ${item.unit.trim()}` : qty;
}

function rowFromGroceryItem(item: GroceryItem): FoodReadinessIngredientRow {
  // Live rows come from an existing persistent grocery list, so they are
  // already on-list. Eligible rows require a separate demand-preview adapter.
  return {
    demandKey: item.id,
    name: item.name,
    quantityLabel: formatQuantity(item),
    contextLabel:
      item.status === 'have' || item.status === 'bought'
        ? 'Already covered on your list'
        : 'Already on your grocery list',
    status: 'already_added',
  };
}

export function buildFoodReadinessViewModel(args: {
  plan: Plan | null;
  readiness: PantryReadinessSummary | null;
  groceryListLabel?: string;
  groceryItems?: GroceryItem[];
  loading?: boolean;
  errorMessage?: string;
}): FoodReadinessViewModel {
  const groceryListLabel = args.groceryListLabel ?? DEFAULT_LIST_LABEL;

  if (args.loading) {
    return { status: 'loading', rows: [], groceryListLabel };
  }

  if (args.errorMessage) {
    return {
      status: 'error',
      rows: [],
      groceryListLabel,
      errorMessage: args.errorMessage,
    };
  }

  if (!args.plan) {
    return { status: 'no_active_plan', rows: [], groceryListLabel };
  }

  const items = args.groceryItems ?? [];
  if (items.length === 0) {
    return {
      status: 'no_planned_requirements',
      rows: [],
      groceryListLabel,
    };
  }

  const rows = items.slice(0, 4).map(rowFromGroceryItem);
  const coverage = args.readiness?.coverage;
  if (coverage && coverage.rows_total > 0 && coverage.rows_to_buy === 0) {
    return { status: 'all_ready', rows, groceryListLabel };
  }

  return { status: 'populated', rows, groceryListLabel };
}

export function buildReadyAnytimeViewModel(args: {
  plan: Plan | null;
  startDate?: string;
  endDate?: string;
  loading?: boolean;
}): ReadyAnytimeViewModel {
  const startDate = args.startDate ?? todayKey();
  const endDate = args.endDate ?? startDate;

  if (args.loading) {
    return {
      status: 'idle',
      startDate,
      endDate,
      hasActivePlan: Boolean(args.plan),
    };
  }

  if (!args.plan) {
    return {
      status: 'no_active_plan',
      startDate,
      endDate,
      hasActivePlan: false,
      message: 'Activate a plan to generate a grocery list from planned meals.',
    };
  }

  return {
    status: 'idle',
    startDate,
    endDate,
    hasActivePlan: true,
  };
}

export function buildLiveFoodHomeViewModel(args: {
  plan: Plan | null;
  readiness: PantryReadinessSummary | null;
  groceryListLabel?: string;
  groceryItems?: GroceryItem[];
  startDate?: string;
  endDate?: string;
  loading?: boolean;
  errorMessage?: string;
}): FoodHomeViewModel {
  return {
    fixtureId: 'live',
    readiness: buildFoodReadinessViewModel(args),
    readyAnytime: buildReadyAnytimeViewModel({
      plan: args.plan,
      startDate: args.startDate,
      endDate: args.endDate,
      loading: args.loading,
    }),
  };
}

export function mapEmptyReasonToReadyAnytimeStatus(
  emptyReason: string | null | undefined,
): ReadyAnytimeViewModel['status'] {
  switch (emptyReason) {
    case 'no_plan_days_in_range':
    case 'no_pending_meals':
    case 'no_derived_items':
      return 'no_meals_in_range';
    default:
      return emptyReason ? 'error' : 'success';
  }
}
