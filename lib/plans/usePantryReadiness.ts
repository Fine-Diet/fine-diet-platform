'use client';

/**
 * Packet D — shared client access to the Packet C Pantry Readiness endpoint.
 *
 * Home and Plans both surface planning-context derived from the same
 * read-only readiness endpoint. This hook is the single fetch boundary so we
 * never recompute readiness on the client and never duplicate the request
 * logic. It performs NO mutation, NO grocery generation, and persists nothing.
 */

import { useCallback, useEffect, useState } from 'react';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { planService } from './planService';
import type {
  PantryReadinessCoverage,
  PantryReadinessSummary,
} from './types';

export type PantryReadinessLoadState = 'loading' | 'ready' | 'error';

export interface UsePantryReadinessResult {
  summary: PantryReadinessSummary | null;
  state: PantryReadinessLoadState;
  /** Re-fetch readiness (e.g. after a Pantry add/edit/delete). Soft-fails. */
  reload: () => void;
}

/**
 * Conservative, planning-oriented copy shared across every readiness surface.
 * Centralized so wording rules stay consistent and never imply a deduction
 * happened when identity/units were unsafe.
 */
export const PANTRY_READINESS_COPY = {
  coveredByPantry: 'Covered by Pantry',
  stillToBuy: 'Still to buy',
  partiallyCovered: 'Partially covered',
  needsReview: 'Needs review',
  resolveToUsePantry: 'Resolve to use Pantry',
  noActiveGroceryList: 'No active grocery list yet',
  managePantry: 'Manage Pantry',
  reviewGrocery: 'Review Grocery',
  openGrocery: 'Open Grocery Plan',
  openPlans: 'Open Plans',
  addPantryItem: 'Add Pantry Item',
  pantryItemsSaved: 'Pantry items saved',
} as const;

/**
 * Build the grocery link for a readiness summary's active plan + scope,
 * mirroring the Plans page grocery link (date + optional date_end). Returns
 * null when there is no plan/scope to link to.
 */
export function readinessGroceryHref(
  summary: PantryReadinessSummary | null,
): string | null {
  if (!summary || !summary.active_plan || !summary.grocery_scope) return null;
  const params = new URLSearchParams({ date: summary.grocery_scope.date_start });
  if (summary.grocery_scope.date_end !== summary.grocery_scope.date_start) {
    params.set('date_end', summary.grocery_scope.date_end);
  }
  return `${APP_ROUTE_BUILDERS.planGrocery(summary.active_plan.id)}?${params.toString()}`;
}

/** True when some grocery rows cannot use Pantry until they are reviewed/resolved. */
export function readinessHasBlockers(
  coverage: PantryReadinessCoverage | null,
): boolean {
  if (!coverage) return false;
  return (
    coverage.rows_unresolved_identity > 0 ||
    coverage.rows_unit_or_amount_review > 0
  );
}

export function usePantryReadiness(): UsePantryReadinessResult {
  const [summary, setSummary] = useState<PantryReadinessSummary | null>(null);
  const [state, setState] = useState<PantryReadinessLoadState>('loading');

  const reload = useCallback(async () => {
    setState('loading');
    try {
      const next = await planService.getPantryReadiness();
      setSummary(next);
      setState('ready');
    } catch {
      // Readiness is non-critical planning context; fail soft so Home/Plans
      // (and Pantry management) keep working if the endpoint is unavailable.
      setState('error');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { summary, state, reload };
}
