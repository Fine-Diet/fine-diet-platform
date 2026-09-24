import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('PurchaseDetailsSummary standalone variant', () => {
  it('keeps the no-details helper at text-xs for Lists/Hauls', () => {
    const source = read('components/food/itemManagement/PurchaseDetailsSummary.tsx');
    expect(source).toContain("embedded ? 'text-sm' : 'text-xs'");
    expect(source).toContain('Add product and purchase details manually or search retail offers.');
  });
});
