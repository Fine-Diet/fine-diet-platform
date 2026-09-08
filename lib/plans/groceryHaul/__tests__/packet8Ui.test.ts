import fs from 'fs';
import path from 'path';

import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { sourceDemandLabel } from '@/components/food/hauls/presentation';
import type { GroceryHaulItem } from '@/lib/plans/types';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Packet 8 Hauls Library and Draft Builder', () => {
  it('keeps the canonical collection/detail routes and uses thin route pages', () => {
    expect(APP_ROUTE_BUILDERS.foodHaul('haul-1')).toBe('/app/food/hauls/haul-1');
    expect(read('pages/app/food/hauls/index.tsx')).toContain('HaulsLibrary');
    expect(read('pages/app/food/hauls/[haulId].tsx')).toContain('<HaulBuilder haulId={haulId}');
  });

  it('creates through the canonical multi-List API with a stable retry token', () => {
    const dialog = read('components/food/hauls/StartHaulDialog.tsx');
    expect(dialog).toContain('planService.startGroceryHaulFromLists');
    expect(dialog).toContain('source_grocery_list_ids: selectedIds');
    expect(dialog).toContain('creationToken ?? crypto.randomUUID()');
    expect(dialog).toContain('selectedIds.length === 0');
    expect(dialog).not.toContain('title:');
  });

  it('uses complete memberships, one-open accordions, and natural page scrolling', () => {
    const builder = read('components/food/hauls/HaulBuilder.tsx');
    expect(builder).toContain('detail.source_lists.map');
    expect(builder).toContain('setOpenSourceId(next)');
    expect(builder).toContain("header.scrollIntoView({ behavior: 'smooth', block: 'start' })");
    expect(builder).not.toMatch(/max-h-\[[^\]]+\].*sourceItems/);
    expect(builder).toContain('planService.addGroceryListsToHaul');
  });

  it('preserves Need → product → store/price → final quantity and never patches source demand', () => {
    const builder = read('components/food/hauls/HaulBuilder.tsx');
    const need = builder.indexOf('sourceDemandLabel(item)');
    const product = builder.indexOf('item.product_title', need);
    const store = builder.indexOf('itemStoreLabel(item)', need);
    const quantity = builder.indexOf('final_quantity: nextQuantity', need);
    expect(need).toBeGreaterThan(-1);
    expect(product).toBeGreaterThan(need);
    expect(store).toBeGreaterThan(need);
    expect(quantity).toBeGreaterThan(product);
    expect(builder).toContain('Choose Product');
    expect(builder).toContain('quantity_snapshot is immutable provenance');
    expect(builder).not.toContain('quantity_snapshot: nextQuantity');
  });

  it('keeps quantity zero visible, muted, and represented as final Haul truth', () => {
    const builder = read('components/food/hauls/HaulBuilder.tsx');
    expect(builder).toContain('const excluded = item.final_quantity === 0');
    expect(builder).toContain("excluded ? 'opacity-45' : ''");
    expect(builder).toContain('Excluded from estimate and shopping execution');
    expect(sourceDemandLabel({
      quantity_snapshot: 4,
      unit_snapshot: 'lb',
    } as GroceryHaulItem)).toBe('Need · 4 lb');
  });

  it('offers one overflow Edit action and Haul-only manual pricing', () => {
    const builder = read('components/food/hauls/HaulBuilder.tsx');
    const editor = read('components/food/hauls/HaulItemEditor.tsx');
    expect(builder).toContain('More actions for');
    expect(builder).toContain('Edit');
    expect(editor).toContain('These purchasing details belong to this Haul only');
    expect(editor).toContain('patch.price_amount = nextPrice');
    expect(editor).not.toContain('updatePersistentGroceryItem');
  });

  it('autosaves metadata quietly, renders the canonical estimate, and defers Shopping View', () => {
    const builder = read('components/food/hauls/HaulBuilder.tsx');
    expect(builder).toContain('planService.updateGroceryHaul');
    expect(builder).toContain('Retry');
    expect(builder).not.toMatch(/>\s*Saved\s*</);
    expect(builder).toContain('detail.estimate.estimated_total');
    expect(builder).toContain('detail.estimate.by_store.map');
    expect(builder).toContain('Tax is not included');
    expect(builder).not.toContain('/shop');
    expect(builder).not.toMatch(/>\s*Open Shopping View\s*</);
  });
});
