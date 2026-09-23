import fs from 'fs';
import path from 'path';

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Packet 5 Pantry v2 manager', () => {
  const manager = read('components/food/pantry/PantryManager.tsx');
  const page = read('pages/app/food/pantry.tsx');

  it('uses one Pantry manager and retires the visible readiness composition', () => {
    expect(page).toContain('<PantryManager');
    expect(page).not.toContain('PantryReadinessSection');
    expect(manager).not.toContain('Decision load');
    expect(manager).not.toContain('How your Pantry affects planning');
  });

  it('keeps Add and Search as first-class actions', () => {
    expect(manager).toContain('Add Pantry Item');
    expect(manager).toContain('Search Pantry');
    expect(manager).toContain('Search items, products, brands, or retailers');
  });

  it('uses one batch lot read and separate aggregate and lot writes', () => {
    const purchaseEditor = read('components/food/pantry/PantryPurchaseEditor.tsx');
    expect(manager).toContain('planService.listPantryAcquisitionLots()');
    expect(manager).toContain('planService.updatePantryOnHandItem');
    expect(manager).toContain('planService.createPantryAcquisitionLot');
    expect(manager).toContain('planService.updatePantryAcquisitionLot');
    expect(purchaseEditor).toContain(
      'Purchase details do not change your total on-hand amount.',
    );
    expect(manager).toContain('Purchase history stays unchanged.');
  });

  it('uses approved shell/dialog primitives and empty-only Quick Start', () => {
    expect(manager).toContain('<SignedInPageScroll');
    expect(manager).toContain('<AppDialog');
    expect(manager).toContain('<JournalFooterNav');
    expect(manager).toContain('pantryKnownEmpty &&');
    expect(manager).not.toContain('Add common staples');
  });

  it('maps provider_error outcomes to controlled product-search copy', () => {
    expect(manager).toContain('formatPantryProductSearchProviderErrorMessage(result.provider_error)');
    expect(manager).not.toContain('result.provider_error?.message');
  });

  it('requires postal search location and optional retailer in product lookup', () => {
    const purchaseEditor = read('components/food/pantry/PantryPurchaseEditor.tsx');
    const lookupPanel = read('components/food/pantry/PantryProductLookupPanel.tsx');
    const summary = read('components/food/itemManagement/PurchaseDetailsSummary.tsx');
    expect(lookupPanel).toContain('ZIP/postal code');
    expect(lookupPanel).toContain('Retailer filter (optional)');
    expect(manager).toContain('loadGroceryPriceSearchPrefs');
    expect(manager).toContain('saveGroceryPriceSearchPrefs');
    expect(summary).toContain('Find / update details');
    expect(manager).not.toContain('navigator.geolocation');
    expect(manager).not.toContain('Use my location');
  });

  it('uses item-management purchase editor contract', () => {
    const purchaseEditor = read('components/food/pantry/PantryPurchaseEditor.tsx');
    expect(manager).toContain('<PantryPurchaseEditor');
    expect(manager).toContain('validatePantryLotSave');
    expect(manager).toContain('deletePantryAcquisitionLot');
    expect(manager).toContain('deletePurchaseLot');
    expect(purchaseEditor).toContain('expectedShelfLifeDetailsProps');
    expect(purchaseEditor).not.toMatch(/open=\{!hasExactExpiration/);
    expect(purchaseEditor).toContain('Remove purchase');
    expect(purchaseEditor).toContain('onRemovePurchase');
    expect(purchaseEditor).toContain('Edit purchase');
    expect(purchaseEditor).toContain('Amount acquired');
    expect(purchaseEditor).toContain('Purchased on');
    expect(purchaseEditor).toContain('PurchaseDetailsSummary');
    expect(manager).not.toContain('Quantity remaining must be between');
    expect(purchaseEditor).not.toContain('>Currency<');
    expect(purchaseEditor).not.toContain('Remaining *');
  });

  it('exposes only factual Pantry filters and does not invent a Food Group', () => {
    expect(manager).toContain('Perishability');
    expect(manager).toContain('Inventory Status');
    expect(manager).toContain('Expiration evidence');
    expect(manager).toContain('Exactly zero');
    expect(manager).not.toContain('Use Soon');
    expect(manager).not.toContain('Almost Out');
    expect(manager).not.toContain('Low Stock');
    expect(manager).not.toContain('Food Group');
  });

  it('uses Plans Home meal-row disclosure and single parent expiration line', () => {
    expect(manager).not.toContain('DisclosureTriangle');
    expect(manager).toContain('grid h-7 w-8');
    expect(manager).toContain('h-[15px] w-[15px]');
    expect(manager).toContain('polygon points="12,18 2,6 22,6"');
    expect(manager).toContain('rotate-180');
    const triangleButtonClass = manager.match(
      /className="[^"]*grid h-7 w-8[^"]*"/,
    )?.[0] ?? '';
    expect(triangleButtonClass).not.toContain('focus:ring');
    expect(triangleButtonClass).toContain('focus-visible:text-white');
    expect(manager).not.toContain('parentExpirationShortState');
    expect(manager).toContain('parentDisplayExpirationEvidence');
    expect(manager).not.toContain('MoreHorizontal');
    expect(manager).not.toContain('ChevronDown');
    expect(manager).toContain('Purchase history');
    expect(manager).toContain('Each purchase is tracked separately from your total on hand.');
    expect(manager).toContain('Add purchase');
    expect(manager).toContain('Edit on-hand amount');
    expect(manager).toContain('formatPurchaseStateLabel');
    expect(manager).toContain('No purchases recorded yet.');
    expect((manager.match(/\+ Add purchase/g) ?? []).length).toBe(1);
    expect(manager).not.toContain('Acquisition details');
    expect(manager).not.toContain('Lot history does not change the aggregate on-hand amount.');
    expect(manager).not.toContain('bg-red-400 animate-pulse');
  });
});
