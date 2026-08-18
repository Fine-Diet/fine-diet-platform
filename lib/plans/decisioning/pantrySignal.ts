/**
 * Map existing pantry read models onto the NBA pantry signal.
 * Missing/errored optional reads become error/loading — never invented certainty.
 */

import type { PantryReadinessSummary } from '@/lib/plans/types';
import type { PlansPantryReadinessViewModel } from '@/lib/plans/home/types';
import type { PantryNbaSignal } from './types';

export function pantrySignalFromSummary(
  loadState: 'loading' | 'ready' | 'error',
  summary: PantryReadinessSummary | null,
): PantryNbaSignal {
  if (loadState === 'loading') return { kind: 'loading' };
  if (loadState === 'error') return { kind: 'error' };
  if (!summary) return { kind: 'error' };

  if (summary.state === 'no_pantry' || summary.pantry_items_saved === 0) {
    return {
      kind: 'weak',
      reason: summary.state === 'no_grocery_list' ? 'no_list' : 'no_pantry',
      pantryItemsSaved: summary.pantry_items_saved,
    };
  }

  return { kind: 'ok', pantryItemsSaved: summary.pantry_items_saved };
}

export function pantrySignalFromViewModel(
  pantry: PlansPantryReadinessViewModel,
): PantryNbaSignal {
  switch (pantry.status) {
    case 'loading':
      return { kind: 'loading' };
    case 'error':
      return { kind: 'error' };
    case 'empty':
      return { kind: 'weak', reason: 'empty', pantryItemsSaved: 0 };
    case 'no_list':
    case 'no_pricing':
      return { kind: 'weak', reason: 'no_list', pantryItemsSaved: 0 };
    case 'populated':
      return { kind: 'ok', pantryItemsSaved: null };
    default:
      return { kind: 'error' };
  }
}

export function groceryDemandFromSummary(summary: PantryReadinessSummary | null): boolean {
  if (!summary?.coverage) return false;
  return summary.coverage.rows_to_buy > 0 || summary.coverage.rows_partial > 0;
}

export function groceryDemandFromViewModel(pantry: PlansPantryReadinessViewModel): boolean {
  if (pantry.status !== 'populated') return false;
  return pantry.columns.some((column) => column.id === 'on_the_list');
}
