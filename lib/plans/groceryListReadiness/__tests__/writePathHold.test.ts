import fs from 'fs';
import path from 'path';

const manager = fs.readFileSync(
  path.join(process.cwd(), 'components/food/lists/ListsManager.tsx'),
  'utf8',
);

describe('Persistent List write boundaries after Packet 3', () => {
  it('loads the selected persistent List through the owner-protected API client', () => {
    expect(manager).toContain('getPersistentGroceryList(selectedListId)');
    expect(manager).toContain('getPersistentGroceryPurchasingChoices(selectedListId)');
  });

  it('adds only to the selected List', () => {
    expect(manager).toContain('addPersistentGroceryItem(selectedListId');
  });

  it('edits and removes only through List-scoped persistence', () => {
    expect(manager).toContain('updatePersistentGroceryItem(selectedListId, editItem.id');
    expect(manager).toContain('deletePersistentGroceryItem(selectedListId, editItem.id');
  });

  it('does not present trip-transfer or bought-state checkboxes', () => {
    expect(manager).not.toContain('type="checkbox"');
    expect(manager).not.toContain('Mark bought');
  });
});
