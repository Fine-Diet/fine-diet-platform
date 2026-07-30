/**
 * Full Haul Estimate — canonical household cost summary + segment attribution.
 *
 * Pure read-model math. Does not touch reconciliation, provenance writes, or
 * observation storage. Each priced grocery row is counted once in the Full
 * Haul merchandise subtotal; segments explain origin without creating a second
 * financial truth.
 *
 * Tax applies only at Full Haul level. Without shopping-location taxability,
 * tax is disclosed as excluded/incomplete rather than guessed.
 */

import type { GroceryItem, GroceryItemSourceType } from './types';
import type {
  FullHaulAllocationMode,
  FullHaulContributionShare,
  FullHaulCostSegment,
  FullHaulEstimate,
  FullHaulSegmentKind,
  FullHaulTaxContext,
  FullHaulTaxStatus,
  GroceryPriceObservation,
} from './groceryPricingTypes';
import { groceryItemMatchKey } from './groceryMatchKeys';
import { GROCERY_PRICE_CACHE_TTL_DAYS } from './groceryPricingConfig';

export type {
  FullHaulAllocationMode,
  FullHaulContributionShare,
  FullHaulCostSegment,
  FullHaulEstimate,
  FullHaulSegmentKind,
  FullHaulTaxContext,
  FullHaulTaxStatus,
};

export type ComputeFullHaulEstimateInput = {
  groceryListId: string;
  items: GroceryItem[];
  /**
   * Match-key observation map (plan-scoped lists). Used when
   * `observationsByItemId` does not contain a row for the item.
   */
  observationsByMatchKey?: Map<string, Pick<
    GroceryPriceObservation,
    | 'line_total'
    | 'currency'
    | 'source'
    | 'match_confidence'
    | 'retrieved_at'
    | 'package_size'
  >>;
  /**
   * Preferred for durable multi-batch lists: same match_key can have different
   * prices across plan/date scopes, so item-id lookup is collision-safe.
   */
  observationsByItemId?: Map<string, Pick<
    GroceryPriceObservation,
    | 'line_total'
    | 'currency'
    | 'source'
    | 'match_confidence'
    | 'retrieved_at'
    | 'package_size'
  >>;
  /**
   * Optional plan id when the list itself is plan-scoped and items lack
   * foundation provenance (`source_type` / `source_id`).
   */
  listPlanId?: string | null;
  planLabels?: Record<string, string>;
  /**
   * Optional per-item quantity shares for merged multi-source rows.
   * Keyed by grocery item id. When absent or unreliable, multi-source costs
   * land in Shared / Unallocated.
   */
  contributionSharesByItemId?: Record<string, FullHaulContributionShare[]>;
  tax?: FullHaulTaxContext | null;
  now?: Date;
};

const SHARED_UNALLOCATED_KEY = 'shared_unallocated';
const HOUSEHOLD_MANUAL_KEY = 'household_manual';
const QTY_EPSILON = 1e-6;

const DEFAULT_TAX_DISCLOSURE_EXCLUDED =
  'Estimated tax is excluded — shopping location and item taxability are not available yet.';
const DEFAULT_TAX_DISCLOSURE_INCOMPLETE =
  'Estimated tax is incomplete — shopping location or item taxability is missing.';
const DEFAULT_TAX_DISCLOSURE_ESTIMATED =
  'Estimated tax only — not confirmed by a retailer or cart.';

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function isStale(retrievedAt: string, now: Date): boolean {
  const retrieved = new Date(retrievedAt);
  const ageMs = now.getTime() - retrieved.getTime();
  return ageMs > GROCERY_PRICE_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

function planSegmentKey(planId: string): string {
  return `plan:${planId}`;
}

function planLabel(planId: string, planLabels?: Record<string, string>): string {
  return planLabels?.[planId] ?? `Plan ${planId.slice(0, 8)}`;
}

function exclusiveSegmentFromProvenance(
  item: GroceryItem,
  listPlanId: string | null | undefined,
  planLabels?: Record<string, string>,
): Omit<FullHaulCostSegment, 'estimated_merchandise_subtotal' | 'priced_item_count' | 'allocation_mode'> | null {
  const sourceType = item.source_type as GroceryItemSourceType | undefined;

  if (sourceType === 'manual') {
    return {
      segment_key: HOUSEHOLD_MANUAL_KEY,
      kind: 'household_manual',
      label: 'Household / Manual',
      source_id: null,
    };
  }

  if (sourceType === 'planned_meal' && typeof item.source_id === 'string' && item.source_id) {
    return {
      segment_key: planSegmentKey(item.source_id),
      kind: 'plan',
      label: planLabel(item.source_id, planLabels),
      source_id: item.source_id,
    };
  }

  if (sourceType === 'pantry_restocks') {
    return {
      segment_key: 'pantry_restocks',
      kind: 'other',
      label: 'Pantry restocks',
      source_id: null,
    };
  }

  if (sourceType === 'food_recommendation' || sourceType === 'recipe' || sourceType === 'system') {
    return {
      segment_key: `other:${sourceType}`,
      kind: 'other',
      label: sourceType.replace(/_/g, ' '),
      source_id: item.source_id ?? null,
    };
  }

  // Plan-scoped lists often lack foundation provenance; fall back to list plan.
  if (listPlanId) {
    return {
      segment_key: planSegmentKey(listPlanId),
      kind: 'plan',
      label: planLabel(listPlanId, planLabels),
      source_id: listPlanId,
    };
  }

  return null;
}

function sharesAreReliable(
  item: GroceryItem,
  shares: FullHaulContributionShare[] | undefined,
): shares is FullHaulContributionShare[] {
  if (!shares || shares.length < 2) return false;
  if (item.quantity == null || !(item.quantity > 0)) return false;
  if (shares.some((share) => !(share.quantity > 0))) return false;
  const sum = shares.reduce((acc, share) => acc + share.quantity, 0);
  return Math.abs(sum - item.quantity) <= QTY_EPSILON;
}

function resolveTax(tax: FullHaulTaxContext | null | undefined): {
  estimated_tax: number | null;
  tax_status: FullHaulTaxStatus;
  tax_disclosure: string;
} {
  if (!tax || tax.status === 'excluded') {
    return {
      estimated_tax: null,
      tax_status: 'excluded',
      tax_disclosure: tax?.disclosure ?? DEFAULT_TAX_DISCLOSURE_EXCLUDED,
    };
  }
  if (tax.status === 'incomplete') {
    return {
      estimated_tax: null,
      tax_status: 'incomplete',
      tax_disclosure: tax.disclosure ?? DEFAULT_TAX_DISCLOSURE_INCOMPLETE,
    };
  }
  const amount = typeof tax.estimated_tax === 'number' && Number.isFinite(tax.estimated_tax)
    ? roundMoney(tax.estimated_tax)
    : null;
  if (amount == null) {
    return {
      estimated_tax: null,
      tax_status: 'incomplete',
      tax_disclosure: tax.disclosure ?? DEFAULT_TAX_DISCLOSURE_INCOMPLETE,
    };
  }
  return {
    estimated_tax: amount,
    tax_status: 'estimated',
    tax_disclosure: tax.disclosure ?? DEFAULT_TAX_DISCLOSURE_ESTIMATED,
  };
}

interface MutableSegment {
  segment_key: string;
  kind: FullHaulSegmentKind;
  label: string;
  source_id: string | null;
  estimated_merchandise_subtotal: number;
  priced_item_count: number;
  allocation_mode: FullHaulAllocationMode;
}

function ensureSegment(
  byKey: Map<string, MutableSegment>,
  seed: Omit<MutableSegment, 'estimated_merchandise_subtotal' | 'priced_item_count'> & {
    estimated_merchandise_subtotal?: number;
    priced_item_count?: number;
  },
): MutableSegment {
  const existing = byKey.get(seed.segment_key);
  if (existing) return existing;
  const created: MutableSegment = {
    segment_key: seed.segment_key,
    kind: seed.kind,
    label: seed.label,
    source_id: seed.source_id,
    estimated_merchandise_subtotal: 0,
    priced_item_count: 0,
    allocation_mode: seed.allocation_mode,
  };
  byKey.set(seed.segment_key, created);
  return created;
}

function addExclusive(
  byKey: Map<string, MutableSegment>,
  seed: Omit<MutableSegment, 'estimated_merchandise_subtotal' | 'priced_item_count' | 'allocation_mode'>,
  lineTotal: number,
): void {
  const segment = ensureSegment(byKey, { ...seed, allocation_mode: 'exclusive' });
  segment.estimated_merchandise_subtotal = roundMoney(
    segment.estimated_merchandise_subtotal + lineTotal,
  );
  segment.priced_item_count += 1;
}

function addSharedUnallocated(byKey: Map<string, MutableSegment>, lineTotal: number): void {
  const segment = ensureSegment(byKey, {
    segment_key: SHARED_UNALLOCATED_KEY,
    kind: 'shared_unallocated',
    label: 'Shared / Unallocated',
    source_id: null,
    allocation_mode: 'unallocated',
  });
  segment.estimated_merchandise_subtotal = roundMoney(
    segment.estimated_merchandise_subtotal + lineTotal,
  );
  segment.priced_item_count += 1;
}

function addQuantityShares(
  byKey: Map<string, MutableSegment>,
  shares: FullHaulContributionShare[],
  lineTotal: number,
  itemQuantity: number,
): void {
  let allocated = 0;
  shares.forEach((share, index) => {
    const isLast = index === shares.length - 1;
    const portion = isLast
      ? roundMoney(lineTotal - allocated)
      : roundMoney(lineTotal * (share.quantity / itemQuantity));
    allocated = roundMoney(allocated + portion);
    const segment = ensureSegment(byKey, {
      segment_key: share.segment_key,
      kind: share.kind,
      label: share.label,
      source_id: share.source_id,
      allocation_mode: 'quantity_share',
    });
    // Prefer quantity_share when any share lands here; exclusive stays if mixed.
    if (segment.allocation_mode === 'exclusive') {
      segment.allocation_mode = 'quantity_share';
    }
    segment.estimated_merchandise_subtotal = roundMoney(
      segment.estimated_merchandise_subtotal + portion,
    );
    segment.priced_item_count += 1;
  });
}

function segmentSortRank(kind: FullHaulSegmentKind): number {
  switch (kind) {
    case 'plan':
      return 0;
    case 'meal_map':
      return 1;
    case 'household_manual':
      return 2;
    case 'other':
      return 3;
    case 'shared_unallocated':
      return 4;
    default:
      return 5;
  }
}

/**
 * Compute the canonical Full Haul Estimate from already-loaded items and
 * current price observations. Safe to call from plan-scoped or durable lists.
 */
export function computeFullHaulEstimate(input: ComputeFullHaulEstimateInput): FullHaulEstimate {
  const now = input.now ?? new Date();
  const eligibleItems = input.items.filter((item) => item.status !== 'skipped');
  const segmentsByKey = new Map<string, MutableSegment>();

  let manualSubtotal = 0;
  let sourcedSubtotal = 0;
  let pricedCount = 0;
  let staleCount = 0;
  let incomplete = false;
  let confidenceTotal = 0;
  let confidenceCount = 0;
  let newest: string | null = null;
  let oldest: string | null = null;
  let currency = 'USD';

  for (const item of eligibleItems) {
    const observation =
      input.observationsByItemId?.get(item.id) ??
      input.observationsByMatchKey?.get(groceryItemMatchKey(item));
    if (!observation) continue;

    pricedCount += 1;
    currency = observation.currency || currency;
    const lineTotal = observation.line_total;

    if (observation.source === 'manual') {
      manualSubtotal += lineTotal;
    } else {
      sourcedSubtotal += lineTotal;
    }

    if (isStale(observation.retrieved_at, now)) staleCount += 1;
    if (observation.match_confidence != null) {
      confidenceTotal += observation.match_confidence;
      confidenceCount += 1;
    }
    if (!newest || observation.retrieved_at > newest) newest = observation.retrieved_at;
    if (!oldest || observation.retrieved_at < oldest) oldest = observation.retrieved_at;

    const hasRequiredQty = item.quantity != null && item.quantity > 0;
    const hasPackageSize = observation.package_size != null && observation.package_size > 0;
    if (hasRequiredQty && !hasPackageSize) {
      incomplete = true;
    }

    const shares = input.contributionSharesByItemId?.[item.id];
    if (sharesAreReliable(item, shares)) {
      addQuantityShares(segmentsByKey, shares, lineTotal, item.quantity as number);
      continue;
    }

    // Multi-share provided but unreliable → do not guess; leave unallocated.
    if (shares && shares.length >= 2) {
      addSharedUnallocated(segmentsByKey, lineTotal);
      continue;
    }

    const exclusive = exclusiveSegmentFromProvenance(item, input.listPlanId, input.planLabels);
    if (exclusive) {
      addExclusive(segmentsByKey, exclusive, lineTotal);
    } else {
      addSharedUnallocated(segmentsByKey, lineTotal);
    }
  }

  const eligibleCount = eligibleItems.length;
  const unpricedCount = Math.max(0, eligibleCount - pricedCount);
  const merchandise = roundMoney(manualSubtotal + sourcedSubtotal);
  const coverage = eligibleCount === 0 ? 0 : Math.round((pricedCount / eligibleCount) * 1000) / 10;
  const averageConfidence = confidenceCount > 0
    ? Math.round((confidenceTotal / confidenceCount) * 1000) / 1000
    : null;

  let estimateConfidence: string | null = null;
  if (pricedCount === 0) {
    estimateConfidence = 'No priced items yet';
  } else if (incomplete) {
    estimateConfidence = 'Incomplete estimate — some rows lack safe package conversion';
  } else if (staleCount > 0) {
    estimateConfidence = `${staleCount} priced row(s) may be stale`;
  } else if (averageConfidence != null && averageConfidence >= 0.7) {
    estimateConfidence = 'High-confidence priced coverage';
  } else {
    estimateConfidence = 'Mixed-confidence priced coverage';
  }

  const tax = resolveTax(input.tax);
  const estimatedTotal = tax.estimated_tax != null
    ? roundMoney(merchandise + tax.estimated_tax)
    : merchandise;

  const segments = Array.from(segmentsByKey.values())
    .map((segment) => ({
      ...segment,
      estimated_merchandise_subtotal: roundMoney(segment.estimated_merchandise_subtotal),
    }))
    .sort((a, b) => {
      const rank = segmentSortRank(a.kind) - segmentSortRank(b.kind);
      if (rank !== 0) return rank;
      return a.label.localeCompare(b.label);
    });

  // Integrity: segment merchandise must equal Full Haul merchandise (no double-count).
  const segmentSum = roundMoney(
    segments.reduce((acc, segment) => acc + segment.estimated_merchandise_subtotal, 0),
  );
  if (pricedCount > 0 && Math.abs(segmentSum - merchandise) > 0.02) {
    // Defensive residual — never invent a second total; park drift in Shared.
    const drift = roundMoney(merchandise - segmentSum);
    const shared = ensureSegment(segmentsByKey, {
      segment_key: SHARED_UNALLOCATED_KEY,
      kind: 'shared_unallocated',
      label: 'Shared / Unallocated',
      source_id: null,
      allocation_mode: 'unallocated',
    });
    shared.estimated_merchandise_subtotal = roundMoney(
      shared.estimated_merchandise_subtotal + drift,
    );
  }

  const finalSegments = Array.from(segmentsByKey.values())
    .map((segment) => ({
      ...segment,
      estimated_merchandise_subtotal: roundMoney(segment.estimated_merchandise_subtotal),
    }))
    .filter((segment) => segment.priced_item_count > 0 || segment.estimated_merchandise_subtotal !== 0)
    .sort((a, b) => {
      const rank = segmentSortRank(a.kind) - segmentSortRank(b.kind);
      if (rank !== 0) return rank;
      return a.label.localeCompare(b.label);
    });

  return {
    grocery_list_id: input.groceryListId,
    currency,
    estimated_merchandise_subtotal: merchandise,
    estimated_tax: tax.estimated_tax,
    tax_status: tax.tax_status,
    tax_disclosure: tax.tax_disclosure,
    estimated_total: estimatedTotal,
    priced_item_count: pricedCount,
    eligible_item_count: eligibleCount,
    unpriced_item_count: unpricedCount,
    priced_coverage_percent: coverage,
    stale_item_count: staleCount,
    average_match_confidence: averageConfidence,
    newest_price_at: newest,
    oldest_price_at: oldest,
    is_incomplete_estimate: incomplete,
    estimate_confidence: estimateConfidence,
    observation_manual_subtotal: roundMoney(manualSubtotal),
    observation_sourced_subtotal: roundMoney(sourcedSubtotal),
    segments: finalSegments,
  };
}
