import fs from 'fs';
import path from 'path';

import { PANTRY_PURCHASE_FIELD_PLACEHOLDERS } from '../pantryPurchaseFieldPlaceholders';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Pantry purchase field placeholders', () => {
  it('defines founder example copy for editable fields', () => {
    expect(PANTRY_PURCHASE_FIELD_PLACEHOLDERS.productTitle).toBe('e.g. Baby Spinach');
    expect(PANTRY_PURCHASE_FIELD_PLACEHOLDERS.brandName).toBe('e.g. Organic Girl');
    expect(PANTRY_PURCHASE_FIELD_PLACEHOLDERS.productSearchRetailer).toBe(
      'e.g. Whole Foods Market',
    );
    expect(PANTRY_PURCHASE_FIELD_PLACEHOLDERS.productSearchPostal).toBe('ZIP or postal code');
  });

  it('wires placeholders through PantryPurchaseEditor without date placeholders', () => {
    const editor = read('components/food/pantry/PantryPurchaseEditor.tsx');
    expect(editor).toContain('PANTRY_PURCHASE_FIELD_PLACEHOLDERS');
    expect(editor).toContain('placeholder={PANTRY_PURCHASE_FIELD_PLACEHOLDERS.amountAcquired}');
    expect(editor).not.toMatch(/type="date"[\s\S]{0,120}placeholder=/);
  });

  it('keeps shared PackageFields without default placeholders for Lists/Hauls', () => {
    const packageFields = read('components/food/itemManagement/PackageFields.tsx');
    const listsEditor = read('components/food/lists/ListsItemEditor.tsx');
    expect(packageFields).toContain('packageSizePlaceholder?: string');
    expect(packageFields).not.toContain("placeholder='");
    expect(listsEditor).toContain('<PackageFields');
    expect(listsEditor).not.toContain('packageSizePlaceholder');
  });
});
