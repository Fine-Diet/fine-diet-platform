import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('List to Haul write-path hold after Packet 3', () => {
  it('does not create a Haul during Lists manager load or switching', () => {
    const manager = read('components/food/lists/ListsManager.tsx');
    const loadEffect = manager.slice(
      manager.indexOf('const loadSelectedList'),
      manager.indexOf('function selectList'),
    );
    expect(loadEffect).not.toContain('startGroceryHaulFromList');
  });

  it('uses the deployed one-List writer and then opens the returned Haul', () => {
    const manager = read('components/food/lists/ListsManager.tsx');
    expect(manager).toContain('startGroceryHaulFromList(selectedListId');
    expect(manager).toContain('router.push(APP_ROUTE_BUILDERS.foodHaul(result.haul_id))');
    expect(manager).not.toContain('grocery_haul_source_lists');
  });

  it('does not delete, archive, finalize, or clear the source List in buildHaul', () => {
    const manager = read('components/food/lists/ListsManager.tsx');
    const build = manager.slice(manager.indexOf('async function buildHaul()'), manager.indexOf('return ('));
    expect(build).not.toMatch(/delete|archive|finalize|clear/i);
  });
});
