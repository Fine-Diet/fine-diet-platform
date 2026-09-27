import fs from 'fs';
import path from 'path';

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Packet 5 Pantry feed convergence', () => {
  const manager = read('components/food/pantry/PantryManager.tsx');
  const page = read('pages/app/food/pantry.tsx');
  const policy = read('components/food/pantry/pantryPolicy.ts');

  it('uses one Pantry manager and retires the visible readiness composition', () => {
    expect(page).toContain('<PantryManager');
    expect(page).not.toContain('PantryReadinessSection');
    expect(manager).not.toContain('Decision load');
  });

  it('keeps joined Add/Search geometry with inline search input', () => {
    expect(manager).toContain('Add Pantry Item');
    expect(manager).toContain('aria-label="Search Pantry"');
    expect(manager).toContain('py-2.5 pl-10 pr-10 text-base text-white');
    expect(manager).toContain('sm:text-xl');
    expect(manager).toContain('text-base font-semibold text-[#16110d] sm:flex-none sm:min-w-48 sm:text-xl');
    expect(manager).not.toContain('setSearchOpen');
  });

  it('uses hard feed sections and removes legacy filter controls', () => {
    expect(manager).toContain('Perishing & Low Stock');
    expect(manager).toContain('Your Inventory');
    expect(manager).toContain('buildPantryFeedSections');
    expect(manager).not.toContain('Perishability');
    expect(manager).not.toContain('Inventory Status');
  });

  it('uses one batch lot read, on-hand updates, and resolution actions', () => {
    const purchaseEditor = read('components/food/pantry/PantryPurchaseEditor.tsx');
    expect(manager).toContain('planService.listPantryAcquisitionLots()');
    expect(manager).toContain('planService.updatePantryOnHandItem');
    expect(manager).toContain('planService.resolvePantryAcquisitionLot');
    expect(purchaseEditor).not.toContain('>Remaining<');
    expect(purchaseEditor).not.toContain('Mark completed / used');
    expect(purchaseEditor).not.toContain('Discard remaining');
    expect(purchaseEditor).not.toContain('End this purchase record');
    expect(manager).not.toContain('End this purchase record');
    expect(purchaseEditor).not.toContain(
      'Purchase details do not change your total on-hand amount.',
    );
  });

  it('uses inline on-hand editing instead of the aggregate modal', () => {
    expect(manager).toContain('Edit on-hand amount');
    expect(manager).not.toContain('edit-pantry-title');
    expect(manager).not.toContain('openAggregateEdit');
  });

  it('uses feed headline copy and disclosure geometry', () => {
    expect(manager).toContain('Your inventory truth as a feed');
    expect(manager).not.toContain('<br />');
    expect(manager).toContain('h-[15px] w-[15px]');
    expect(manager).toContain('polygon points="12,18 2,6 22,6"');
    expect(manager).toContain('parentPantryStatus');
    expect(manager).toContain('parentPantryStatusDot');
    expect(manager).toContain('bg-amber-400');
    expect(manager).toContain('pantryInventoryReading');
    expect(manager).toContain('Purchase History');
    expect(manager).not.toMatch(/Purchase History[\s\S]{0,180}sm:justify-between/);
    expect(manager).toContain('Resolve expired item');
  });

  it('keeps policy constants for low stock and section classification', () => {
    expect(policy).toContain('LOW_STOCK_RATIO = 0.25');
    expect(policy).toContain('buildPantryFeedSections');
    expect(read('scripts/sql/addPantryAcquisitionLotResolution.sql')).toContain(
      'resolve_pantry_acquisition_lot',
    );
  });
});
