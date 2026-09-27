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

  it('keeps Lists/Hauls on shared workspace shell separate from Pantry workspace', () => {
    expect(listsEditor).toContain('shell="workspace"');
    expect(haulEditor).toContain('shell="workspace"');
    expect(purchaseEditor).toContain('shell="pantry-workspace"');
    expect(purchaseEditor).not.toContain('shell="workspace"');
    expect(dialog).toContain("pantry-workspace");
    expect(dialog).toContain('WORKSPACE_PANEL_CLASS');
    expect(dialog).toContain('PANTRY_WORKSPACE_PANEL_CLASS');
  });

  it('opts Pantry purchase editor into pantry-workspace shell geometry', () => {
    expect(dialog).toContain('SIGNED_IN_DESKTOP_DRAWER_LEFT_CLASS');
    expect(dialog).toContain('lg:w-[800px]');
    expect(dialog).toContain('lg:max-w-[800px]');
    expect(dialog).toContain('PANTRY_WORKSPACE_PANEL_CLASS');
    expect(dialog).toContain('px-[30px]');
    expect(dialog).toContain('sm:px-11');
    expect(dialog).toContain('max-w-none');
    expect(dialog).toContain('app-chrome-offset');
    expect(dialog).toContain('DEFAULT_PANEL_CLASS');
    expect(dialog).toContain("shell = 'default'");
  });

  it('locks purchase field grids without visible Remaining or lifecycle controls', () => {
    expect(purchaseEditor).toContain('PANTRY_PURCHASE_DATE_GRID_CLASS');
    expect(purchaseEditor).toContain('lg:gap-7');
    expect(purchaseEditor).toContain('PANTRY_PURCHASE_AMOUNT_GRID_CLASS');
    expect(purchaseEditor).toContain('Amount acquired');
    expect(purchaseEditor).not.toContain('>Remaining<');
    expect(purchaseEditor).not.toContain('End this purchase record');
    expect(purchaseEditor).not.toContain('Mark completed / used');
    expect(purchaseEditor).not.toContain('Discard remaining');
    expect(purchaseEditor).not.toContain('onResolvePurchase');
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
    expect(dialog).toContain('PANTRY_WORKSPACE_FOOTER_CLASS');
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

  it('uses helpful example placeholders on empty Pantry fields', () => {
    expect(purchaseEditor).toContain('pantryPurchaseFieldPlaceholders');
    expect(purchaseEditor).toContain('PANTRY_PURCHASE_FIELD_PLACEHOLDERS.productTitle');
    expect(lookup).toContain('productSearchPlaceholder');
  });

  it('removes header explanatory sentence and uppercase purchase section', () => {
    expect(purchaseEditor).toContain('Edit purchase');
    expect(purchaseEditor).not.toContain('uppercase tracking');
    expect(purchaseEditor).not.toContain(
      'Purchase details do not change your total on-hand amount.',
    );
    expect(purchaseEditor).not.toContain('ItemManagementSection');
  });

  it('uses responsive purchase title scale 36/40 → 40/44 → 44/44', () => {
    expect(purchaseEditor).toContain('PANTRY_PURCHASE_TITLE_CLASS');
    expect(purchaseEditor).toContain('text-[36px]');
    expect(purchaseEditor).toContain('leading-10');
    expect(purchaseEditor).toContain('sm:text-[40px]');
    expect(purchaseEditor).toContain('sm:leading-[44px]');
    expect(purchaseEditor).toContain('lg:text-[44px]');
    expect(purchaseEditor).toContain('lg:leading-[44px]');
    expect(purchaseEditor).toContain('lg:font-semibold');
    expect(purchaseEditor).toContain('mt-5 space-y-6');
    expect(purchaseEditor).toContain('lg:text-[1.275rem]');
    expect(purchaseEditor).toContain('mt-3 overflow-hidden');
    expect(purchaseEditor).toContain('PANTRY_PURCHASE_DATE_GRID_CLASS');
    expect(purchaseEditor).toContain('PANTRY_PURCHASE_AMOUNT_GRID_CLASS');
  });
});
