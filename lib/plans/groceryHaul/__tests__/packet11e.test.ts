import fs from 'fs';
import path from 'path';

import { APP_ROUTES, APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { APP_DRAWER_HUBS, getActiveDrawerHubId } from '@/lib/navigation/appDrawerNavigation';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Packet 11E contracts after Packet 3 Lists migration', () => {
  it('keeps Lists and Hauls as distinct canonical Food destinations', () => {
    const food = APP_DRAWER_HUBS.find((hub) => hub.id === 'food');
    expect(food?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'food-lists', href: APP_ROUTES.foodLists }),
        expect.objectContaining({ id: 'food-hauls', href: APP_ROUTES.foodHauls }),
      ]),
    );
    expect(getActiveDrawerHubId('/app/food/lists')).toBe('food');
    expect(getActiveDrawerHubId('/app/food/hauls/haul-1')).toBe('food');
  });

  it('addresses one Haul by Haul id and one selected List in the manager', () => {
    expect(APP_ROUTE_BUILDERS.foodHaul('haul-1')).toBe('/app/food/hauls/haul-1');
    expect(APP_ROUTE_BUILDERS.foodGroceryList('list-1')).toBe(
      '/app/food/lists?listId=list-1',
    );
  });

  it('creates a Haul only from the explicit manager action', () => {
    const manager = read('components/food/lists/ListsManager.tsx');
    const legacyIndex = read('pages/app/food/groceries/index.tsx');
    expect(manager).toContain('onClick={() => void buildHaul()}');
    expect(manager).toContain('planService.startGroceryHaulFromList(selectedListId');
    expect(legacyIndex).not.toContain('startGroceryHaulFromList');
  });
});
