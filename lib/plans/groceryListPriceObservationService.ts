/**
 * List-scoped price quotes + active quote selection for durable Full Haul lists.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type {
  GroceryItem,
  GroceryListItemActiveQuote,
  GroceryListPriceObservation,
  GroceryListPurchasingChoice,
} from './types';
import { activePurchasingMatchKeyForItem } from './groceryListPurchasingChoiceDisplay';
import { getPurchasingChoiceForItem } from './groceryListPurchasingChoiceStore';
import {
  appendListPriceObservation,
  getListPriceObservationById,
  listAllListPriceObservations,
} from './groceryListPriceObservationStore';
import {
  compatibleQuotePoolForItem,
  isListPriceCompatibleWithActiveChoice,
  resolveActiveListPriceForItem,
  summarizeActiveRetailers,
} from './groceryListPriceObservationDisplay';
import { resolveListShoppingDisplayName } from './groceryListPurchasingChoiceDisplay';
import {
  clearActiveQuote,
  listActiveQuotesForList,
  upsertActiveQuote,
} from './groceryListActiveQuoteStore';

export {
  isListPriceCompatibleWithActiveChoice,
  resolveActiveListPriceForItem,
  compatibleQuotePoolForItem,
  summarizeActiveRetailers,
} from './groceryListPriceObservationDisplay';

export class GroceryListPriceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroceryListPriceValidationError';
  }
}

function normalizeUnitPrice(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new GroceryListPriceValidationError('unit_price must be a non-negative number.');
  }
  return Math.round(n * 100) / 100;
}

function normalizePackageCount(value: unknown): number {
  if (value == null || value === '') return 1;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new GroceryListPriceValidationError('package_count must be a positive number.');
  }
  return n;
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function loadOwnedDurableListItem(
  personId: string,
  listId: string,
  itemId: string,
): Promise<{ item: GroceryItem; choice: GroceryListPurchasingChoice | null }> {
  const { data: list, error: listErr } = await supabaseAdmin
    .from('generated_grocery_lists')
    .select('id, person_id, plan_id')
    .eq('id', listId)
    .eq('person_id', personId)
    .maybeSingle();
  if (listErr || !list) {
    throw new GroceryListPriceValidationError('Grocery list not found.');
  }
  if (list.plan_id) {
    throw new GroceryListPriceValidationError(
      'Use plan grocery pricing for plan-scoped lists.',
    );
  }

  const { data: item, error: itemErr } = await supabaseAdmin
    .from('grocery_items')
    .select('*')
    .eq('id', itemId)
    .eq('grocery_list_id', listId)
    .eq('person_id', personId)
    .maybeSingle();
  if (itemErr || !item) {
    throw new GroceryListPriceValidationError('Grocery item not found.');
  }

  let choice: GroceryListPurchasingChoice | null = null;
  try {
    choice = await getPurchasingChoiceForItem(personId, listId, itemId);
    if (choice?.status === 'unresolved') choice = null;
  } catch {
    choice = null;
  }

  return { item: item as unknown as GroceryItem, choice };
}

export type SaveManualListPriceInput = {
  unit_price: unknown;
  package_count?: unknown;
  currency?: unknown;
  product_title?: unknown;
  brand_name?: unknown;
  retailer?: unknown;
  postal_code?: unknown;
  package_size?: unknown;
  package_unit?: unknown;
};

export async function saveManualListGroceryPrice(options: {
  personId: string;
  listId: string;
  itemId: string;
  input: SaveManualListPriceInput;
}): Promise<GroceryListPriceObservation> {
  const { item, choice } = await loadOwnedDurableListItem(
    options.personId,
    options.listId,
    options.itemId,
  );
  const matchKey = activePurchasingMatchKeyForItem(item, choice);
  const unitPrice = normalizeUnitPrice(options.input.unit_price);
  const packageCount = normalizePackageCount(options.input.package_count);
  const lineTotal = Math.round(unitPrice * packageCount * 100) / 100;
  const productTitle =
    normalizeOptionalString(options.input.product_title) ??
    resolveListShoppingDisplayName({ item, choice });

  const packageSizeRaw = options.input.package_size;
  let packageSize: number | null = null;
  if (packageSizeRaw != null && packageSizeRaw !== '') {
    const n = typeof packageSizeRaw === 'number' ? packageSizeRaw : Number(packageSizeRaw);
    if (!Number.isFinite(n) || n <= 0) {
      throw new GroceryListPriceValidationError('package_size must be a positive number.');
    }
    packageSize = n;
  }

  const observation = await appendListPriceObservation({
    person_id: options.personId,
    grocery_list_id: options.listId,
    grocery_item_id: options.itemId,
    match_key: matchKey,
    purchasing_choice_id: choice?.id ?? null,
    food_object_id: choice?.food_object_id ?? item.food_object_id,
    source: 'manual',
    retailer: normalizeOptionalString(options.input.retailer),
    postal_code: normalizeOptionalString(options.input.postal_code),
    product_title: productTitle,
    brand_name: normalizeOptionalString(options.input.brand_name),
    package_size: packageSize,
    package_unit: normalizeOptionalString(options.input.package_unit),
    unit_price: unitPrice,
    currency:
      typeof options.input.currency === 'string' && options.input.currency.trim()
        ? options.input.currency.trim()
        : 'USD',
    package_count: packageCount,
    line_total: lineTotal,
    product_url: null,
    image_url: null,
  });

  try {
    await upsertActiveQuote({
      personId: options.personId,
      listId: options.listId,
      itemId: options.itemId,
      observationId: observation.id,
    });
  } catch {
    // Active-quote table may not exist yet — quote still saved.
  }

  return observation;
}

export async function setActiveListQuote(options: {
  personId: string;
  listId: string;
  itemId: string;
  observationId: string;
}): Promise<{
  active: GroceryListItemActiveQuote;
  observation: GroceryListPriceObservation;
}> {
  const { item, choice } = await loadOwnedDurableListItem(
    options.personId,
    options.listId,
    options.itemId,
  );
  const observation = await getListPriceObservationById(
    options.personId,
    options.listId,
    options.observationId,
  );
  if (!observation || observation.grocery_item_id !== options.itemId) {
    throw new GroceryListPriceValidationError(
      'Quote not found on this list item.',
    );
  }
  if (
    !isListPriceCompatibleWithActiveChoice({
      observation,
      item,
      choice,
    })
  ) {
    throw new GroceryListPriceValidationError(
      'Quote is incompatible with the current purchasing choice.',
    );
  }

  const active = await upsertActiveQuote({
    personId: options.personId,
    listId: options.listId,
    itemId: options.itemId,
    observationId: observation.id,
  });
  return { active, observation };
}

/**
 * Apply a retailer scenario: set active quotes for matched item→observation pairs.
 * Skips missing/stale. Safely resumable — returns per-item applied/failed.
 */
export async function applyRetailerScenarioActiveQuotes(options: {
  personId: string;
  listId: string;
  /** item_id → observation_id for matched scenario rows only */
  selections: Record<string, string>;
}): Promise<{
  applied: Array<{ item_id: string; observation_id: string }>;
  failed: Array<{ item_id: string; observation_id: string; error: string }>;
}> {
  const applied: Array<{ item_id: string; observation_id: string }> = [];
  const failed: Array<{ item_id: string; observation_id: string; error: string }> = [];

  for (const [itemId, observationId] of Object.entries(options.selections)) {
    if (!itemId || !observationId) continue;
    try {
      await setActiveListQuote({
        personId: options.personId,
        listId: options.listId,
        itemId,
        observationId,
      });
      applied.push({ item_id: itemId, observation_id: observationId });
    } catch (err) {
      failed.push({
        item_id: itemId,
        observation_id: observationId,
        error: err instanceof Error ? err.message : 'Failed to apply quote',
      });
    }
  }

  return { applied, failed };
}

export async function getListPriceQuotesBundle(
  personId: string,
  listId: string,
  items: GroceryItem[],
  choicesByItemId: Record<string, GroceryListPurchasingChoice>,
): Promise<{
  by_item_id: Record<string, GroceryListPriceObservation>;
  stale_by_item_id: Record<string, GroceryListPriceObservation>;
  pool_by_item_id: Record<string, GroceryListPriceObservation[]>;
  active_observation_id_by_item_id: Record<string, string>;
  mixed_retailers: boolean;
  retailer_summary: string | null;
}> {
  let observations: GroceryListPriceObservation[] = [];
  try {
    observations = await listAllListPriceObservations(personId, listId);
  } catch {
    return {
      by_item_id: {},
      stale_by_item_id: {},
      pool_by_item_id: {},
      active_observation_id_by_item_id: {},
      mixed_retailers: false,
      retailer_summary: null,
    };
  }

  let activeByItem: Record<string, string> = {};
  try {
    const actives = await listActiveQuotesForList(personId, listId);
    activeByItem = Object.fromEntries(
      actives.map((row) => [row.grocery_item_id, row.observation_id]),
    );
  } catch {
    activeByItem = {};
  }

  const byItem = new Map<string, GroceryListPriceObservation[]>();
  for (const obs of observations) {
    const list = byItem.get(obs.grocery_item_id) ?? [];
    list.push(obs);
    byItem.set(obs.grocery_item_id, list);
  }

  const by_item_id: Record<string, GroceryListPriceObservation> = {};
  const stale_by_item_id: Record<string, GroceryListPriceObservation> = {};
  const pool_by_item_id: Record<string, GroceryListPriceObservation[]> = {};
  const active_observation_id_by_item_id: Record<string, string> = {};

  for (const item of items) {
    const choice = choicesByItemId[item.id] ?? null;
    const pool = compatibleQuotePoolForItem({
      item,
      choice,
      observationsForItem: byItem.get(item.id) ?? [],
    });
    pool_by_item_id[item.id] = pool;

    const resolved = resolveActiveListPriceForItem({
      item,
      choice,
      observationsForItem: byItem.get(item.id) ?? [],
      activeObservationId: activeByItem[item.id] ?? null,
    });
    if (resolved.observation) {
      by_item_id[item.id] = resolved.observation;
      active_observation_id_by_item_id[item.id] = resolved.observation.id;
    } else if (resolved.stale) {
      stale_by_item_id[item.id] = resolved.stale;
    }
  }

  const retailerInfo = summarizeActiveRetailers(Object.values(by_item_id));
  return {
    by_item_id,
    stale_by_item_id,
    pool_by_item_id,
    active_observation_id_by_item_id,
    mixed_retailers: retailerInfo.mixed,
    retailer_summary: retailerInfo.summary,
  };
}

export async function getCurrentCompatibleListPrice(
  personId: string,
  listId: string,
  itemId: string,
): Promise<GroceryListPriceObservation | null> {
  const { item, choice } = await loadOwnedDurableListItem(personId, listId, itemId);
  let pool: GroceryListPriceObservation[] = [];
  try {
    const all = await listAllListPriceObservations(personId, listId);
    pool = all.filter((row) => row.grocery_item_id === itemId);
  } catch {
    return null;
  }
  let activeId: string | null = null;
  try {
    const actives = await listActiveQuotesForList(personId, listId);
    activeId = actives.find((row) => row.grocery_item_id === itemId)?.observation_id ?? null;
  } catch {
    activeId = null;
  }
  const compatible = resolveActiveListPriceForItem({
    item,
    choice,
    observationsForItem: pool,
    activeObservationId: activeId,
  });
  return compatible.observation;
}

export { clearActiveQuote, upsertActiveQuote };
