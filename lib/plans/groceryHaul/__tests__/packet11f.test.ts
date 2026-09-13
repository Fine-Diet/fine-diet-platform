import fs from 'fs';
import path from 'path';

const manager = fs.readFileSync(
  path.join(process.cwd(), 'components/food/lists/ListsManager.tsx'),
  'utf8',
);

describe('Packet 11F presentation after Packet 3 Lists migration', () => {
  it('uses the approved Lists title, selector, intake, and quiet count', () => {
    expect(manager).toContain('Manage your lists');
    expect(manager).toContain('Select a List');
    expect(manager).toContain('+ New List');
    expect(manager).toContain('Search to add item(s)');
    expect(manager).toContain('total item');
  });

  it('uses the approved need/product grammar', () => {
    expect(manager).toContain('{item.name}</h2>');
    expect(manager).toContain('{product}</p>');
    expect(manager).toContain('Choose Product');
    expect(manager).toContain('{price.retailer}</p>');
    expect(manager).toContain('formatGroceryCurrency(price.line_total');
  });

  it('uses the approved bottom handoff and reserves app-footer clearance', () => {
    expect(manager).toContain('Ready to shop?');
    expect(manager).toContain('Create a haul to combine items from one or more lists.');
    expect(manager).toContain('Build a Haul');
    expect(manager).toContain('<SignedInPageScroll');
    expect(manager).toContain('<JournalFooterNav');
  });
});
