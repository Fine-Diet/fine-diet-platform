/**
 * Shared grocery presentation read model.
 *
 * Keeps Required amount as the primary truth and derives pantry/on-hand,
 * still-to-buy, buy suggestion, and review notes from one client-safe boundary.
 */

import type { GroceryItem, PantryOnHandItem } from './types';

export type GroceryStillToBuyState = 'none' | 'safe' | 'unsafe';

export interface GroceryItemReadModel {
  required: {
    quantity: number | null;
    unit: string | null;
    label: string;
    needsReview: boolean;
  };
  onHand: {
    pantryItem: PantryOnHandItem;
    label: string;
  } | null;
  stillToBuy: {
    state: GroceryStillToBuyState;
    quantity: number | null;
    label: string | null;
    note: string | null;
  };
  buySuggestion: string | null;
  reviewNotes: string[];
}

export function normalizeGroceryDisplayUnit(unit: string | null | undefined): string {
  return (unit ?? '').toLowerCase().trim().replace(/\.$/, '');
}

export function groceryPantryKey(
  foodObjectId: string,
  unit: string | null | undefined,
): string {
  return `${foodObjectId}::${normalizeGroceryDisplayUnit(unit)}`;
}

function pluralizeUnit(qty: number, unit: string): string {
  if (Math.abs(qty - 1) < 0.001) return unit;
  if (unit === 'cup') return 'cups';
  if (unit === 'serving') return 'servings';
  if (unit === 'item') return 'items';
  return unit;
}

export function formatGroceryAmount(quantity: number, unit: string | null): string {
  const rounded = Math.round(quantity * 100) / 100;
  const displayUnit = unit ? pluralizeUnit(rounded, unit) : '';
  return displayUnit ? `${rounded} ${displayUnit}` : String(rounded);
}

function formatRequiredAmount(item: GroceryItem): GroceryItemReadModel['required'] {
  if (item.quantity == null) {
    return {
      quantity: null,
      unit: item.unit,
      label: item.unit
        ? `Required: amount needs review (${item.unit})`
        : 'Required: amount needs review',
      needsReview: true,
    };
  }

  return {
    quantity: item.quantity,
    unit: item.unit,
    label: `Required: ${formatGroceryAmount(item.quantity, item.unit)}`,
    needsReview: false,
  };
}

function formatBuySuggestion(quantity: number | null, rawUnit: string | null): string | null {
  if (quantity == null || !rawUnit) return null;
  const q = quantity;
  const unit = normalizeGroceryDisplayUnit(rawUnit);

  if (unit === 'cup' && q >= 4) {
    if (q <= 4) return 'Buy suggestion: at least 1 quart';
    if (q <= 8) return 'Buy suggestion: at least 1 half-gallon';
    const gallons = Math.ceil(q / 16);
    return `Buy suggestion: about ${gallons} gallon${gallons === 1 ? '' : 's'}`;
  }
  if (unit === 'g' && q >= 1000) {
    const kg = Math.ceil(q / 100) / 10;
    return `Buy suggestion: about ${kg} kg`;
  }
  if (unit === 'oz' && q >= 16) {
    const lb = Math.ceil((q / 16) * 10) / 10;
    return `Buy suggestion: about ${lb} lb`;
  }
  if (unit === 'item' && q > 0) {
    const count = Math.ceil(q);
    return `Buy suggestion: ${count} item${count === 1 ? '' : 's'}`;
  }
  return null;
}

function groceryReviewNotes(
  item: GroceryItem,
  stillToBuy: GroceryItemReadModel['stillToBuy'],
): string[] {
  const notes: string[] = [];
  if (!item.food_object_id) notes.push('unresolved ingredient identity');
  if (item.notes) notes.push(item.notes);
  if (stillToBuy.note) notes.push(stillToBuy.note);
  return notes;
}

export function buildGroceryItemReadModel(
  item: GroceryItem,
  pantryItems: PantryOnHandItem[],
): GroceryItemReadModel {
  const required = formatRequiredAmount(item);

  if (!item.food_object_id) {
    const stillToBuy: GroceryItemReadModel['stillToBuy'] = {
      state: 'unsafe',
      quantity: null,
      label: null,
      note: 'Still to buy: resolve ingredient before pantry deduction',
    };
    return {
      required,
      onHand: null,
      stillToBuy,
      buySuggestion: null,
      reviewNotes: groceryReviewNotes(item, stillToBuy),
    };
  }

  const pantryItem = pantryItems.find(
    (it) => it.key === groceryPantryKey(item.food_object_id!, item.unit),
  );
  if (!pantryItem) {
    const stillToBuy: GroceryItemReadModel['stillToBuy'] = {
      state: 'none',
      quantity: null,
      label: null,
      note: null,
    };
    return {
      required,
      onHand: null,
      stillToBuy,
      buySuggestion: formatBuySuggestion(item.quantity, item.unit),
      reviewNotes: groceryReviewNotes(item, stillToBuy),
    };
  }

  const onHand = {
    pantryItem,
    label: `On hand: ${
      pantryItem.quantity == null
        ? 'amount saved'
        : formatGroceryAmount(pantryItem.quantity, pantryItem.unit)
    }`,
  };

  if (item.quantity == null || pantryItem.quantity == null || !item.unit || !pantryItem.unit) {
    const stillToBuy: GroceryItemReadModel['stillToBuy'] = {
      state: 'unsafe',
      quantity: null,
      label: null,
      note: 'Still to buy: amount needs review before pantry deduction',
    };
    return {
      required,
      onHand,
      stillToBuy,
      buySuggestion: null,
      reviewNotes: groceryReviewNotes(item, stillToBuy),
    };
  }

  if (normalizeGroceryDisplayUnit(item.unit) !== normalizeGroceryDisplayUnit(pantryItem.unit)) {
    const stillToBuy: GroceryItemReadModel['stillToBuy'] = {
      state: 'unsafe',
      quantity: null,
      label: null,
      note: 'Still to buy: pantry unit does not safely match this row',
    };
    return {
      required,
      onHand,
      stillToBuy,
      buySuggestion: null,
      reviewNotes: groceryReviewNotes(item, stillToBuy),
    };
  }

  const quantity = Math.max(
    0,
    Math.round((item.quantity - pantryItem.quantity) * 1000) / 1000,
  );
  const stillToBuy: GroceryItemReadModel['stillToBuy'] = {
    state: 'safe',
    quantity,
    label: `Still to buy: ${
      quantity <= 0 ? 'covered by pantry' : formatGroceryAmount(quantity, item.unit)
    }`,
    note: null,
  };

  return {
    required,
    onHand,
    stillToBuy,
    buySuggestion: formatBuySuggestion(quantity, item.unit),
    reviewNotes: groceryReviewNotes(item, stillToBuy),
  };
}
