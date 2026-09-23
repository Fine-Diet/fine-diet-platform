import fs from 'fs';
import path from 'path';

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Packet 6 Lists item-management convergence', () => {
  const manager = read('components/food/lists/ListsManager.tsx');
  const editor = read('components/food/lists/ListsItemEditor.tsx');

  it('uses shared item-management primitives in the Lists editor', () => {
    expect(editor).toContain('ItemManagementDialog');
    expect(editor).toContain('ItemManagementSection');
    expect(editor).toContain('PurchaseDetailsSummary');
    expect(editor).toContain('PackageFields');
    expect(manager).toContain('<ListsItemEditor');
  });

  it('separates need change from purchasing product change', () => {
    expect(editor).toContain('Change need');
    expect(editor).toContain('Change product');
    expect(manager).toContain('resolvePersistentGroceryItemForList');
    expect(manager).toContain('changePersistentGroceryListItemNeed');
  });

  it('keeps notes progressive and hides currency in manual purchasing', () => {
    expect(editor).toContain('More details');
    expect(editor).not.toContain('>Currency<');
    expect(editor).toContain('PurchaseDetailsSummary');
  });

  it('routes list price discovery through item management', () => {
    expect(manager).toContain('openPriceSearchFromEditor');
    expect(manager).toContain('open={Boolean(editItem) && !pricePanelItem}');
    expect(manager).not.toContain('Find Price');
  });
});
