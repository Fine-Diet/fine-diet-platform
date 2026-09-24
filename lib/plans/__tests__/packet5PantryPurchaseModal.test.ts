import fs from 'fs';
import path from 'path';

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Packet 5 Pantry purchase modal convergence', () => {
  const dialog = read('components/food/itemManagement/ItemManagementDialog.tsx');
  const listsEditor = read('components/food/lists/ListsItemEditor.tsx');
  const haulEditor = read('components/food/hauls/HaulItemEditor.tsx');
  const purchaseEditor = read('components/food/pantry/PantryPurchaseEditor.tsx');
  const lookup = read('components/food/pantry/PantryProductLookupPanel.tsx');
  const manager = read('components/food/pantry/PantryManager.tsx');

  it('keeps Lists/Hauls on default ItemManagementDialog shell', () => {
    expect(dialog).toContain("shell = 'default'");
    expect(listsEditor).toContain('<ItemManagementDialog');
    expect(listsEditor).not.toContain('shell=');
    expect(haulEditor).toContain('<ItemManagementDialog');
    expect(haulEditor).not.toContain('shell=');
  });

  it('opts Pantry purchase editor into workspace shell geometry', () => {
    expect(purchaseEditor).toContain('shell="workspace"');
    expect(dialog).toContain('SIGNED_IN_DESKTOP_DRAWER_LEFT_CLASS');
    expect(dialog).toContain('lg:max-w-[800px]');
    expect(dialog).toContain('app-chrome-offset');
    expect(dialog).toContain('DEFAULT_PANEL_CLASS');
  });

  it('locks purchase field grid and Remaining label', () => {
    expect(purchaseEditor).toContain('PANTRY_PURCHASE_DATE_GRID_CLASS');
    expect(purchaseEditor).toContain('grid-cols-2');
    expect(purchaseEditor).toContain('PANTRY_PURCHASE_AMOUNT_GRID_CLASS');
    expect(purchaseEditor).toContain('Amount acquired');
    expect(purchaseEditor).toContain('col-span-2 sm:col-span-1');
    expect(purchaseEditor).toContain('>Remaining<');
    expect(purchaseEditor).toContain('rounded-full');
  });

  it('locks responsive multi-column groups and rounded product-detail tabs', () => {
    expect(purchaseEditor).toContain('PANTRY_PURCHASE_PRODUCT_TITLE_GRID_CLASS');
    expect(purchaseEditor).toContain('PANTRY_PURCHASE_RETAILER_PRICE_GRID_CLASS');
    expect(purchaseEditor).toContain('PANTRY_PRODUCT_DETAIL_TAB_CLASS');
    expect(purchaseEditor).toContain('rounded-t-xl');
    expect(purchaseEditor).toContain('densePhoneLayout');
    expect(lookup).toContain('grid min-w-0 grid-cols-3 gap-3');
    expect(lookup).toContain('col-span-2');
    expect(dialog).toContain('WORKSPACE_MOBILE_FOOTER_CLASS');
  });

  it('uses inline expected shelf life disclosure copy', () => {
    expect(purchaseEditor).toContain(
      "* Don&apos;t know the exact date? Use expected shelf life",
    );
    expect(purchaseEditor).not.toContain('rounded-xl border border-white/[0.06]');
  });

  it('integrates persistent summary with two tabs and no summary-only mode', () => {
    expect(purchaseEditor).toContain('variant="embedded"');
    expect(purchaseEditor).toContain('Edit manually');
    expect(purchaseEditor).toContain('Find / update details');
    expect(purchaseEditor).not.toContain('Back to summary');
    expect(purchaseEditor).not.toContain("purchaseDetailsMode === 'summary'");
    expect(manager).toContain("useState<PurchaseDetailsMode>('manual')");
  });

  it('maps manual fields to brandName and retailer without schema expansion', () => {
    expect(purchaseEditor).toContain('Brand (optional)');
    expect(purchaseEditor).toContain('brandName: event.target.value');
    expect(purchaseEditor).toContain('Purchased at');
    expect(purchaseEditor).toContain('retailer: event.target.value');
  });

  it('uses embedded flat product search presentation', () => {
    expect(purchaseEditor).toContain('variant="embedded"');
    expect(lookup).toContain('grid-cols-3');
    expect(lookup).toContain('col-span-2');
    expect(lookup).toContain('w-full rounded-full bg-white/10');
    expect(lookup).toContain('divide-y divide-white/10');
  });

  it('returns to manual tab after offer selection', () => {
    expect(manager).toContain("setPurchaseDetailsMode('manual')");
    expect(manager).toContain('applyPantryProductOfferToLotDraft');
  });

  it('locks terminal lots as fully read-only in the modal', () => {
    expect(purchaseEditor).toContain('isPantryLotTerminal');
    expect(purchaseEditor).toContain('expiresOn: event.target.value');
    expect(purchaseEditor).toContain('expectedShelfLifeDays: event.target.value');
    expect(purchaseEditor).toContain('disabled={readOnly}');
    expect(purchaseEditor).toContain('disabled={readOnly}');
    expect(purchaseEditor).toContain("purchaseDetailsMode === 'manual' || readOnly");
    expect(purchaseEditor).toContain('onClick={switchToSearch}');
    expect(purchaseEditor).toContain('disabled={readOnly}');
    expect(purchaseEditor).toContain('disabled={readOnly}');
    expect(purchaseEditor).toContain('PANTRY_EMBEDDED_SUMMARY_FORMAT');
  });

  it('removes header explanatory sentence and uppercase purchase section', () => {
    expect(purchaseEditor).toContain('Edit purchase');
    expect(purchaseEditor).not.toContain('uppercase tracking');
    expect(purchaseEditor).not.toContain(
      'Purchase details do not change your total on-hand amount.',
    );
    expect(purchaseEditor).not.toContain('ItemManagementSection');
  });
});
