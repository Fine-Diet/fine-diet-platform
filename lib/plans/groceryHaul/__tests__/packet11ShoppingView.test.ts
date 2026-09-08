import fs from 'fs';
import path from 'path';

import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { getActiveDrawerHubId } from '@/lib/navigation/appDrawerNavigation';
import {
  ACQUISITION_PATCH_FIELDS,
  allowedExecutionActions,
  acquisitionFormFromItem,
  acquisitionOutcomeDiverged,
  buildAcquisitionPatch,
  executionSourceDemandLabel,
  factualAcquiredSubtotal,
  findingItemLabel,
  haulHrefForStatus,
  preparedExecutionSubtotal,
} from '@/components/food/hauls/presentation';
import type {
  GroceryHaulExecutionItem,
} from '@/lib/plans/types';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

function executionItem(overrides: Partial<GroceryHaulExecutionItem> = {}): GroceryHaulExecutionItem {
  return {
    id: 'execution-1',
    person_id: 'person-1',
    haul_id: 'haul-1',
    haul_item_id: 'haul-item-1',
    sort_ordinal: 1,
    state: 'pending',
    source_grocery_list_id: 'list-1',
    source_list_title: 'Essentials',
    source_name_snapshot: 'Oats',
    source_quantity_snapshot: 4,
    source_unit_snapshot: 'cup',
    prepared_quantity: 2,
    prepared_selected_food_object_id: 'prepared-food',
    prepared_product_title: 'Prepared oats',
    prepared_brand_name: 'Prepared Brand',
    prepared_purchase_unit: 'box',
    prepared_package_size: 12,
    prepared_package_unit: 'oz',
    prepared_package_count: 1,
    prepared_retailer: 'Prepared Market',
    prepared_store_location: 'Downtown',
    prepared_postal_code: '60601',
    prepared_price_amount: 3,
    prepared_price_currency: 'USD',
    prepared_price_source: 'sourced',
    prepared_source_purchasing_choice_id: 'choice-1',
    prepared_source_price_observation_id: 'price-1',
    acquired_quantity: 2,
    acquired_food_object_id: 'prepared-food',
    acquired_product_title: 'Prepared oats',
    acquired_brand_name: 'Prepared Brand',
    acquired_purchase_unit: 'box',
    acquired_package_size: 12,
    acquired_package_unit: 'oz',
    acquired_package_count: 1,
    acquired_retailer: 'Prepared Market',
    acquired_store_location: 'Downtown',
    acquired_postal_code: '60601',
    acquired_price_amount: 3,
    acquired_price_currency: 'USD',
    state_changed_at: '2026-09-08T15:00:00.000Z',
    basketed_at: null,
    skipped_at: null,
    acquisition_updated_at: null,
    created_at: '2026-09-08T15:00:00.000Z',
    updated_at: '2026-09-08T15:00:00.000Z',
    ...overrides,
  };
}

describe('Packet 11 visual Shopping View + execution UI', () => {
  it('keeps the canonical same-Haul shop route and a thin shop page', () => {
    expect(APP_ROUTE_BUILDERS.foodHaulShop('haul-1')).toBe('/app/food/hauls/haul-1/shop');
    expect(read('pages/app/food/hauls/[haulId]/shop.tsx')).toContain('<HaulShoppingView haulId={haulId}');
    expect(getActiveDrawerHubId('/app/food/hauls/haul-1/shop')).toBe('food');
  });

  it('calls readiness before start and only starts after an explicit continue when review is needed', () => {
    const builder = read('components/food/hauls/HaulBuilder.tsx');
    const readinessCall = builder.indexOf('planService.getGroceryHaulExecutionReadiness(haulId)');
    const startCall = builder.indexOf('planService.startGroceryHaulExecution(haulId)');
    expect(readinessCall).toBeGreaterThan(-1);
    expect(startCall).toBeGreaterThan(readinessCall);
    expect(builder).toContain('Open Shopping View');
    expect(builder).toContain('needsReview');
    expect(builder).toContain('if (!readiness?.can_start) return');
    expect(builder).toContain('router.push(APP_ROUTE_BUILDERS.foodHaulShop(haulId))');
  });

  it('keeps the zero-executable-item blocker in the Builder and does not start', () => {
    const dialog = read('components/food/hauls/HaulExecutionReadinessDialog.tsx');
    const builder = read('components/food/hauls/HaulBuilder.tsx');
    expect(dialog).toContain('readiness.blockers');
    expect(dialog).toContain('At least one item must have a final quantity above zero');
    expect(dialog).toContain('Return to preparation');
    expect(dialog).toContain('readiness.can_start &&');
    expect(dialog).toContain('Continue to Shopping View');
    expect(builder).toContain('planService.startGroceryHaulExecution(haulId)');
    expect(builder.indexOf("status: 'active'")).toBe(-1);
  });

  it('renders missing product/store/price as warnings and deferred findings as not evaluated', () => {
    const dialog = read('components/food/hauls/HaulExecutionReadinessDialog.tsx');
    expect(dialog).toContain('readiness.warnings');
    expect(dialog).toContain('readiness.deferred_findings');
    expect(dialog).toContain('Not evaluated');
    expect(dialog).toContain('do not automatically block shopping');
    expect(dialog).toContain("evaluation === 'not_evaluated'");
    expect(findingItemLabel(
      { code: 'missing_price', severity: 'warning', haul_item_id: 'haul-item-1', message: 'Price is missing.' },
      [{ id: 'haul-item-1', name_snapshot: 'Oats' }],
    )).toBe('Oats');
  });

  it('keeps start failure on the Builder without marking execution started client-side', () => {
    const builder = read('components/food/hauls/HaulBuilder.tsx');
    expect(builder).toContain('Unable to open Shopping View.');
    expect(builder).toContain('setActivationError');
    expect(builder).not.toContain("haul.status = 'active'");
    expect(builder).not.toContain("status: 'active'");
  });

  it('does not silently activate planned /shop access and routes closed hauls back to history', () => {
    const shop = read('components/food/hauls/HaulShoppingView.tsx');
    expect(shop).toContain("haulDetail.haul.status === 'planned'");
    expect(shop).toContain('router.replace(APP_ROUTE_BUILDERS.foodHaul(haulId))');
    expect(shop).toContain("haulDetail.haul.status === 'closed'");
    expect(shop).toContain("haulDetail.haul.status === 'cancelled'");
    expect(shop).not.toContain('startGroceryHaulExecution');
    expect(shop).toContain('planService.getGroceryHaulExecution(haulId)');
  });

  it('renders execution rows, provenance, prepared instruction, and progress counts', () => {
    const shop = read('components/food/hauls/HaulShoppingView.tsx');
    expect(shop).toContain('execution.items.map');
    expect(shop).toContain('execution.summary.pending_count');
    expect(shop).toContain('execution.summary.in_basket_count');
    expect(shop).toContain('execution.summary.skipped_count');
    expect(shop).toContain('executionSourceDemandLabel(item)');
    expect(shop).toContain('preparedInstructionLabel(item)');
    expect(shop).toContain('acquisitionOutcomeDiverged(item)');
    expect(shop).toContain('Active shopping');
    expect(executionSourceDemandLabel(executionItem())).toBe('Need · 4 cup');
  });

  it('only offers pending ↔ in_basket and pending ↔ skipped, never a direct shortcut', () => {
    expect(allowedExecutionActions('pending')).toEqual({
      markInBasket: true,
      skip: true,
      returnToPending: false,
      substitute: true,
    });
    expect(allowedExecutionActions('in_basket')).toEqual({
      markInBasket: false,
      skip: false,
      returnToPending: true,
      substitute: true,
    });
    expect(allowedExecutionActions('skipped')).toEqual({
      markInBasket: false,
      skip: false,
      returnToPending: true,
      substitute: false,
    });
    const shop = read('components/food/hauls/HaulShoppingView.tsx');
    expect(shop).toContain("onClick={() => onState('in_basket')}");
    expect(shop).toContain("onClick={() => onState('skipped')}");
    expect(shop).toContain("onClick={() => onState('pending')}");
    expect(shop).toContain("state === 'in_basket' && !allowed.markInBasket");
    expect(shop).toContain("state === 'skipped' && !allowed.skip");
    expect(shop).toContain('In Basket');
    expect(shop).toContain('Skip');
    expect(shop).toContain('Remove from basket');
    expect(shop).toContain('Return to pending');
  });

  it('patches only acquisition outcome fields and never prepared snapshots or source demand', () => {
    const editor = read('components/food/hauls/HaulAcquisitionEditor.tsx');
    const shop = read('components/food/hauls/HaulShoppingView.tsx');
    expect(ACQUISITION_PATCH_FIELDS).toEqual([
      'quantity',
      'food_object_id',
      'product_title',
      'brand_name',
      'purchase_unit',
      'package_size',
      'package_unit',
      'package_count',
      'retailer',
      'store_location',
      'postal_code',
      'price_amount',
      'price_currency',
    ]);
    const item = executionItem();
    const draft = {
      ...acquisitionFormFromItem(item),
      productTitle: 'Actual substitute',
      priceAmount: '2.5',
    };
    const patch = buildAcquisitionPatch(draft, item);
    expect(patch).toEqual({
      product_title: 'Actual substitute',
      price_amount: 2.5,
    });
    expect(Object.keys(patch)).not.toEqual(expect.arrayContaining([
      'quantity_snapshot',
      'final_quantity',
      'prepared_quantity',
      'prepared_product_title',
      'source_quantity_snapshot',
    ]));
    expect(editor).toContain('acquisition,');
    expect(editor).toContain('planService.updateGroceryHaulExecutionItem');
    expect(editor).not.toContain('quantity_snapshot');
    expect(editor).not.toContain('final_quantity');
    expect(editor).not.toContain('prepared_quantity');
    expect(editor).not.toContain('updateGroceryHaulItem');
    expect(editor).not.toContain('updatePersistentGroceryItem');
    expect(shop).not.toContain('updatePersistentGroceryItem');
    expect(shop).not.toContain('updateGroceryHaulItem');
    expect(shop).not.toContain('addGroceryListsToHaul');
  });

  it('routes active Hauls to Shopping View and keeps closed/cancelled Hauls in history', () => {
    expect(haulHrefForStatus('haul-1', 'planned')).toBe('/app/food/hauls/haul-1');
    expect(haulHrefForStatus('haul-1', 'active')).toBe('/app/food/hauls/haul-1/shop');
    expect(haulHrefForStatus('haul-1', 'closed')).toBe('/app/food/hauls/haul-1');
    expect(haulHrefForStatus('haul-1', 'cancelled')).toBe('/app/food/hauls/haul-1');
    const library = read('components/food/hauls/HaulsLibrary.tsx');
    const builder = read('components/food/hauls/HaulBuilder.tsx');
    expect(library).toContain('Shopping in progress');
    expect(library).toContain("haul.status === 'active'");
    expect(library).toContain("haul.status === 'closed' || haul.status === 'cancelled'");
    expect(library).toContain('haulHrefForStatus(haul.id, haul.status)');
    expect(builder).toContain("detail.haul.status === 'active'");
    expect(builder).toContain('APP_ROUTE_BUILDERS.foodHaulShop(haulId)');
    expect(builder).toContain('Continue to Shopping View');
    expect(builder).toContain('<HistoricalHaul detail={detail} />');
  });

  it('shows a factual acquired subtotal only from persisted price × quantity and does not invent completion', () => {
    expect(factualAcquiredSubtotal([
      executionItem({ acquired_price_amount: 3, acquired_quantity: 2 }),
      executionItem({ id: 'execution-2', acquired_price_amount: null, acquired_quantity: 1 }),
    ])).toBe(6);
    expect(factualAcquiredSubtotal([
      executionItem({ acquired_price_amount: null, acquired_quantity: 1 }),
    ])).toBeNull();
    expect(preparedExecutionSubtotal([executionItem()])).toBe(6);
    expect(acquisitionOutcomeDiverged(executionItem({ acquired_product_title: 'Actual substitute' }))).toBe(true);
    const shop = read('components/food/hauls/HaulShoppingView.tsx');
    expect(shop).toContain('Prepared estimate');
    expect(shop).toContain('Acquired subtotal');
    expect(shop).toContain('Tax is not included');
    expect(shop).not.toContain('Complete Shopping');
    expect(shop).not.toContain('Finish Haul');
    expect(shop).not.toMatch(/\$\d+\s*[–-]\s*\$?\d+/);
    expect(shop).toContain('no executable shopping rows');
  });

  it('does not add completion, Pantry side effects, or DDL', () => {
    const files = [
      'components/food/hauls/HaulBuilder.tsx',
      'components/food/hauls/HaulsLibrary.tsx',
      'components/food/hauls/HaulShoppingView.tsx',
      'components/food/hauls/HaulAcquisitionEditor.tsx',
      'components/food/hauls/HaulExecutionReadinessDialog.tsx',
      'pages/app/food/hauls/[haulId]/shop.tsx',
    ].map(read).join('\n');
    expect(files).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP POLICY|CREATE POLICY/i);
    expect(files).not.toMatch(/\bpantry_/i);
    expect(files).not.toContain('Complete Shopping');
    expect(files).not.toContain('Finish Haul');
    expect(files).not.toContain("status: 'closed'");
    expect(files).not.toContain('apply_migration');
  });
});
