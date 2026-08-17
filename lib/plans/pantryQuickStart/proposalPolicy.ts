/**
 * Pantry Quick Start assumption policy v1.
 *
 * Deterministic proposal. Never writes. Existing saved Pantry truth is
 * excluded from default writes. Product defaults are suggestions, not facts.
 *
 * "Usually have" is habitual availability only. It is not deductable Pantry
 * quantity. Canonical quantity is written only after the user confirms they
 * currently have the item now (`have_now` → 1 item) or enters a tracked amount.
 */

import type { PantryOnHandItem } from '@/lib/plans/types';
import {
  PANTRY_QUICK_START_CATEGORIES,
  PANTRY_QUICK_START_POLICY_ID,
  PANTRY_QUICK_START_POLICY_VERSION,
  PANTRY_QUICK_START_STAPLES,
  type PantryStapleCategoryId,
} from './catalog';

export type PantryQuickStartProposalSource = 'saved_pantry' | 'product_default';
export type PantryQuickStartQuantityMode = 'usually_have' | 'have_now' | 'tracked';

export interface ResolvedStapleFood {
  id: string;
  canonicalName: string;
}

export interface PantryQuickStartItemProposal {
  stapleId: string;
  categoryId: PantryStapleCategoryId;
  lookupQuery: string;
  accepted: boolean;
  alreadySaved: boolean;
  resolvable: boolean;
  foodObjectId: string | null;
  defaultQuantity: number;
  defaultUnit: string;
  quantityMode: PantryQuickStartQuantityMode;
  quantity: number;
  unit: string;
}

export interface PantryQuickStartCategoryProposal {
  id: PantryStapleCategoryId;
  skipped: boolean;
  stapleIds: string[];
}

export interface PantryQuickStartProposal {
  policyId: typeof PANTRY_QUICK_START_POLICY_ID;
  policyVersion: typeof PANTRY_QUICK_START_POLICY_VERSION;
  source: PantryQuickStartProposalSource;
  confidence: 'unknown';
  reasonCodes: string[];
  categories: PantryQuickStartCategoryProposal[];
  items: PantryQuickStartItemProposal[];
  alreadySavedCount: number;
  resolvableCount: number;
  acceptedCount: number;
}

export interface PantryQuickStartWrite {
  stapleId: string;
  foodObjectId: string;
  quantity: number;
  unit: string;
}

function savedFoodObjectIds(savedItems: PantryOnHandItem[]): Set<string> {
  return new Set(savedItems.map((item) => item.food_object_id).filter(Boolean));
}

export function proposePantryQuickStart(args: {
  savedItems: PantryOnHandItem[];
  resolvedFoods: Record<string, ResolvedStapleFood | null>;
}): PantryQuickStartProposal {
  const foodIds = savedFoodObjectIds(args.savedItems);
  const items: PantryQuickStartItemProposal[] = PANTRY_QUICK_START_STAPLES.map((staple) => {
    const resolved = args.resolvedFoods[staple.id] ?? null;
    const foodObjectId = resolved?.id ?? null;
    const alreadySaved = foodObjectId != null && foodIds.has(foodObjectId);
    const resolvable = foodObjectId != null;
    return {
      stapleId: staple.id,
      categoryId: staple.categoryId,
      lookupQuery: staple.lookupQuery,
      accepted: resolvable && !alreadySaved,
      alreadySaved,
      resolvable,
      foodObjectId,
      defaultQuantity: staple.defaultQuantity,
      defaultUnit: staple.defaultUnit,
      quantityMode: 'usually_have',
      quantity: staple.defaultQuantity,
      unit: staple.defaultUnit,
    };
  });

  const alreadySavedCount = items.filter((item) => item.alreadySaved).length;
  const resolvableCount = items.filter((item) => item.resolvable).length;
  const unresolvedCount = items.filter((item) => !item.resolvable).length;
  const reasonCodes = [
    'product_default_assumption',
    'history_inference_deferred',
    'purchase_inference_deferred',
    'usually_have_not_persisted',
  ];
  if (args.savedItems.length > 0) reasonCodes.push('saved_pantry_excluded');
  if (unresolvedCount > 0) reasonCodes.push('unresolved_catalog_foods');

  return {
    policyId: PANTRY_QUICK_START_POLICY_ID,
    policyVersion: PANTRY_QUICK_START_POLICY_VERSION,
    source: args.savedItems.length > 0 ? 'saved_pantry' : 'product_default',
    confidence: 'unknown',
    reasonCodes,
    categories: PANTRY_QUICK_START_CATEGORIES.map((category) => ({
      id: category.id,
      skipped: false,
      stapleIds: [...category.stapleIds],
    })),
    items,
    alreadySavedCount,
    resolvableCount,
    acceptedCount: items.filter((item) => item.accepted).length,
  };
}

function recount(proposal: PantryQuickStartProposal): PantryQuickStartProposal {
  return {
    ...proposal,
    acceptedCount: proposal.items.filter((item) => item.accepted).length,
  };
}

export function togglePantryQuickStartItem(
  proposal: PantryQuickStartProposal,
  stapleId: string,
  accepted: boolean,
): PantryQuickStartProposal {
  const items = proposal.items.map((item) => {
    if (item.stapleId !== stapleId) return item;
    if (item.alreadySaved || !item.resolvable) return { ...item, accepted: false };
    return { ...item, accepted };
  });
  const categories = proposal.categories.map((category) => {
    const categoryItems = items.filter((item) => item.categoryId === category.id);
    const anyAccepted = categoryItems.some((item) => item.accepted);
    return { ...category, skipped: categoryItems.length > 0 && !anyAccepted };
  });
  return recount({ ...proposal, items, categories });
}

export function skipPantryQuickStartCategory(
  proposal: PantryQuickStartProposal,
  categoryId: PantryStapleCategoryId,
): PantryQuickStartProposal {
  const items = proposal.items.map((item) =>
    item.categoryId === categoryId ? { ...item, accepted: false } : item,
  );
  const categories = proposal.categories.map((category) =>
    category.id === categoryId ? { ...category, skipped: true } : category,
  );
  return recount({ ...proposal, items, categories });
}

export function acceptPantryQuickStartCategory(
  proposal: PantryQuickStartProposal,
  categoryId: PantryStapleCategoryId,
): PantryQuickStartProposal {
  const items = proposal.items.map((item) => {
    if (item.categoryId !== categoryId) return item;
    if (item.alreadySaved || !item.resolvable) return { ...item, accepted: false };
    return { ...item, accepted: true };
  });
  const categories = proposal.categories.map((category) =>
    category.id === categoryId ? { ...category, skipped: false } : category,
  );
  return recount({ ...proposal, items, categories });
}

export function setPantryQuickStartQuantity(
  proposal: PantryQuickStartProposal,
  stapleId: string,
  input: { quantityMode: PantryQuickStartQuantityMode; quantity?: number; unit?: string },
): PantryQuickStartProposal {
  const items = proposal.items.map((item) => {
    if (item.stapleId !== stapleId) return item;
    if (input.quantityMode === 'usually_have') {
      return {
        ...item,
        quantityMode: 'usually_have' as const,
        quantity: item.defaultQuantity,
        unit: item.defaultUnit,
      };
    }
    if (input.quantityMode === 'have_now') {
      return {
        ...item,
        quantityMode: 'have_now' as const,
        quantity: item.defaultQuantity,
        unit: item.defaultUnit,
      };
    }
    const quantity =
      typeof input.quantity === 'number' && Number.isFinite(input.quantity) && input.quantity >= 0
        ? input.quantity
        : item.quantity;
    const unit = typeof input.unit === 'string' && input.unit.trim() ? input.unit.trim() : item.unit;
    return {
      ...item,
      quantityMode: 'tracked' as const,
      quantity,
      unit,
    };
  });
  return recount({ ...proposal, items });
}

export function confirmHaveNowForAcceptedStaples(
  proposal: PantryQuickStartProposal,
): PantryQuickStartProposal {
  const items = proposal.items.map((item) => {
    if (!item.accepted || item.alreadySaved || !item.resolvable) return item;
    if (item.quantityMode === 'tracked') return item;
    return {
      ...item,
      quantityMode: 'have_now' as const,
      quantity: item.defaultQuantity,
      unit: item.defaultUnit,
    };
  });
  return recount({ ...proposal, items });
}

export function isDeductableQuickStartWrite(item: PantryQuickStartItemProposal): boolean {
  return (
    item.accepted &&
    item.resolvable &&
    !item.alreadySaved &&
    Boolean(item.foodObjectId) &&
    (item.quantityMode === 'have_now' || item.quantityMode === 'tracked') &&
    Number.isFinite(item.quantity) &&
    item.quantity >= 0
  );
}

export function writesForAcceptedStaples(
  proposal: PantryQuickStartProposal,
): PantryQuickStartWrite[] {
  return proposal.items.filter(isDeductableQuickStartWrite).map((item) => ({
    stapleId: item.stapleId,
    foodObjectId: item.foodObjectId as string,
    quantity: item.quantity,
    unit: item.unit,
  }));
}
