import fs from 'fs';
import path from 'path';

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

const manager = read('components/food/lists/ListsManager.tsx');
const haulsLibrary = read('components/food/hauls/HaulsLibrary.tsx');

describe('Packet 11F presentation after Packet 3 Lists migration', () => {
  it('uses the approved Lists title, selector, intake, and quiet count', () => {
    expect(manager).toContain('Manage your lists');
    expect(manager).toContain('Select a List');
    expect(manager).toContain('+ New List');
    expect(manager).toContain('Search to add item(s)');
    expect(manager).toContain('total item');
    expect(manager).toContain('max-w-[950px]');
    expect(manager).toContain('<FoodShoppingViewSwitcher currentView="lists" />');
    expect(manager).toContain('text-[2.5rem] font-regular tracking-tight');
    expect(manager).toContain('sm:text-[2.75rem]');
    expect(manager).toContain('appearance-none');
    expect(manager).toContain('polygon points="12,18 2,6 22,6"');
    expect(manager).toContain("list.is_default ? 'Essentials'");
    expect(manager).not.toContain('min-h-14 flex-1 rounded-full');
    expect(manager).not.toContain('Delete');
    expect(manager).toContain('Remove from List');
    expect(manager).not.toMatch(/\bScan\b/);
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
    expect(manager).toContain("readiness.state === 'needs_resolution'");
    expect(manager).toContain('Build a Haul');
    expect(manager).toContain('<SignedInPageScroll');
    expect(manager).toContain('<JournalFooterNav');
  });

  it('uses the approved Hauls foundational page treatment', () => {
    expect(haulsLibrary).toContain('max-w-[950px]');
    expect(haulsLibrary).toContain('bg-gradient-to-b from-[#17130f] via-brand-900 to-neutral-700');
    expect(haulsLibrary).toContain('<FoodShoppingViewSwitcher currentView="hauls" />');
    expect(haulsLibrary).toContain('Start or continue your haul preparation.');
    expect(haulsLibrary).toContain('text-[2.5rem] font-regular tracking-tight');
    expect(haulsLibrary).toContain('sm:text-[2.75rem]');
  });
});
