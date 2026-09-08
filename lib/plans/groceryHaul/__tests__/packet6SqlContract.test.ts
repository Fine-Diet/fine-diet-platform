import fs from 'fs';
import path from 'path';
import {
  GROCERY_HAUL_ADD_LISTS_RPC_NAME,
  HAUL_BUILDER_PERSISTENCE_SQL_PATH,
} from '../schema';

const sql = fs.readFileSync(
  path.join(process.cwd(), HAUL_BUILDER_PERSISTENCE_SQL_PATH),
  'utf8',
);

describe('Packet 6 Haul preparation SQL contract', () => {
  it('keeps source demand immutable and adds separate final quantity', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS final_quantity NUMERIC');
    expect(sql).toContain('SET final_quantity = COALESCE(quantity_snapshot, 1)');
    expect(sql).toContain('NEW.quantity_snapshot IS DISTINCT FROM OLD.quantity_snapshot');
    expect(sql).toContain("RAISE EXCEPTION 'HAUL_ITEM_SNAPSHOT_IMMUTABLE'");
    expect(sql).toContain('CHECK (final_quantity >= 0)');
    expect(sql).toContain('v_only_reference_cleanup');
    expect(sql).toContain('FOR UPDATE');
  });

  it('persists title, budget, product, store, and manual/sourced price state only', () => {
    for (const fragment of [
      'ADD COLUMN IF NOT EXISTS title TEXT',
      'ADD COLUMN IF NOT EXISTS budget_amount NUMERIC',
      'ADD COLUMN IF NOT EXISTS selected_food_object_id UUID',
      'ADD COLUMN IF NOT EXISTS store_location TEXT',
      'ADD COLUMN IF NOT EXISTS price_amount NUMERIC',
      "price_source IN ('manual', 'sourced')",
      "resolution_source IN ('source_list', 'haul_edit')",
    ]) {
      expect(sql).toContain(fragment);
    }
    expect(sql).not.toMatch(/\bin_basket\b|\bsubstitute_status\b|\bskip_status\b/i);
  });

  it('atomically adds only missing active same-owner List sources to a Draft', () => {
    expect(sql).toContain(
      `CREATE OR REPLACE FUNCTION public.${GROCERY_HAUL_ADD_LISTS_RPC_NAME}(`,
    );
    expect(sql).toContain("status = 'planned'");
    expect(sql).toContain('v_missing_list_ids');
    expect(sql).toContain('ON CONFLICT (haul_id, grocery_item_id) DO NOTHING');
    expect(sql).toContain("RAISE EXCEPTION 'HAUL_ADD_LISTS_NOT_DRAFT'");
    expect(sql).toContain("RAISE EXCEPTION 'HAUL_ADD_LISTS_LIST_NOT_FOUND'");
    expect(sql).toContain(
      `GRANT EXECUTE ON FUNCTION public.${GROCERY_HAUL_ADD_LISTS_RPC_NAME}(UUID, UUID, UUID[]) TO service_role`,
    );
  });

  it('snapshots active List choice/quote state without mutating source tables', () => {
    expect(sql).toContain('LEFT JOIN public.grocery_list_purchasing_choices choice');
    expect(sql).toContain('LEFT JOIN public.grocery_list_item_active_quotes active_price');
    expect(sql).toContain('LEFT JOIN public.grocery_list_price_observations price');
    expect(sql).toContain('price.purchasing_choice_id = choice.id');
    expect(sql).toContain('price.match_key = choice.match_key');
    expect(sql).toContain(
      'COALESCE(price.package_count, choice.purchase_quantity, gi.quantity, 1)',
    );
    expect(sql).not.toMatch(/UPDATE public\.grocery_(items|list_purchasing_choices|list_price_observations)/);
    expect(sql).not.toMatch(/DELETE FROM public\.grocery_(items|list_purchasing_choices|list_price_observations)/);
  });

  it('denies direct client writes while preserving service-role RPC/table access', () => {
    for (const table of [
      'grocery_hauls',
      'grocery_haul_items',
      'grocery_haul_source_lists',
    ]) {
      expect(sql).toContain(
        `REVOKE ALL PRIVILEGES ON public.${table} FROM anon, authenticated`,
      );
      expect(sql).toContain(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON public.${table} TO service_role`,
      );
    }
    expect(sql).toContain("OLD.status IS DISTINCT FROM 'planned'");
    expect(sql).toContain("RAISE EXCEPTION 'HAUL_STATUS_HISTORICAL'");
  });
});
