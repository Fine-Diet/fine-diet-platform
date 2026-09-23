import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Packet 7 Haul item-management convergence', () => {
  const editor = read('components/food/hauls/HaulItemEditor.tsx');

  it('uses shared item-management primitives', () => {
    expect(editor).toContain('ItemManagementDialog');
    expect(editor).toContain('ItemManagementSection');
    expect(editor).toContain('PurchaseDetailsSummary');
    expect(editor).toContain('PackageFields');
  });

  it('keeps source need read-only and final quantity off the modal', () => {
    expect(editor).toContain('sourceDemandLabel(item)');
    expect(editor).not.toContain('final_quantity');
    expect(editor).not.toContain('Final Haul quantity');
  });

  it('routes List quote selection through source_price_observation_id', () => {
    expect(editor).toContain('getPersistentGroceryPriceQuotes');
    expect(editor).toContain('buildHaulItemPreparationPatch');
    expect(read('components/food/hauls/haulItemSave.ts')).toContain(
      'source_price_observation_id',
    );
  });
});
