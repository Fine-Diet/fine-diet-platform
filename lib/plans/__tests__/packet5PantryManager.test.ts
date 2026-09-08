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
    expect(manager).toContain('planService.listPantryAcquisitionLots()');
    expect(manager).toContain('planService.updatePantryOnHandItem');
    expect(manager).toContain('planService.createPantryAcquisitionLot');
    expect(manager).toContain('planService.updatePantryAcquisitionLot');
    expect(manager).toContain('This will not change the aggregate on-hand amount.');
    expect(manager).toContain('Acquisition history stays unchanged.');
  });

  it('uses approved shell/dialog primitives and empty-only Quick Start', () => {
    expect(manager).toContain('<SignedInPageScroll');
    expect(manager).toContain('<AppDialog');
    expect(manager).toContain('<JournalFooterNav');
    expect(manager).toContain('pantryKnownEmpty &&');
    expect(manager).not.toContain('Add common staples');
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
});
