import fs from 'fs';
import path from 'path';
import {
  FOOD_PERSISTENCE_FOUNDATION_SQL_PATH,
  GROCERY_HAUL_CREATE_MULTI_RPC_NAME,
  GROCERY_HAUL_CREATE_RPC_NAME,
} from '../schema';

function readSql(): string {
  return fs.readFileSync(path.join(process.cwd(), FOOD_PERSISTENCE_FOUNDATION_SQL_PATH), 'utf8');
}

describe('Packet 2 Food persistence foundation', () => {
  const sql = readSql();

  it('backfills exactly one membership from every legacy one-List Haul idempotently', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.grocery_haul_source_lists');
    expect(sql).toContain('PRIMARY KEY (haul_id, grocery_list_id)');
    const backfill = sql.slice(
      sql.indexOf('-- Backfill every legacy one-List Haul'),
      sql.indexOf('-- Replace the legacy'),
    );
    expect(backfill).toContain('gh.source_grocery_list_id');
    expect(backfill).toContain('gh.person_id');
    expect(backfill).toContain('ON CONFLICT (haul_id, grocery_list_id) DO NOTHING');
    expect(backfill).not.toMatch(/\bUPDATE\b|\bDELETE\b/);
  });

  it('replaces same-primary-List enforcement with owner-safe membership provenance', () => {
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS grocery_haul_items_haul_list_fk');
    expect(sql).toContain('CONSTRAINT grocery_haul_items_source_membership_fk');
    expect(sql).toContain('FOREIGN KEY (haul_id, source_grocery_list_id, person_id)');
    expect(sql).toContain(
      'REFERENCES public.grocery_haul_source_lists (\n        haul_id,\n        grocery_list_id,\n        person_id',
    );
    expect(sql).toContain('grocery_haul_source_lists_list_owner_fk');
    expect(sql).toContain('REFERENCES public.generated_grocery_lists (id, person_id)');
    expect(sql).toContain('ON DELETE NO ACTION');
  });

  it('creates owner-indexed membership RLS without weakening existing Haul policies', () => {
    expect(sql).toContain('idx_grocery_haul_source_lists_person_haul');
    expect(sql).toContain('idx_grocery_haul_source_lists_person_list');
    expect(sql).toContain('ALTER TABLE public.grocery_haul_source_lists ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('Users can insert own grocery_haul_source_lists');
    expect(sql).toContain('WITH CHECK');
    expect(sql).toContain('auth_user_id = auth.uid()');
    expect(sql).not.toContain('DISABLE ROW LEVEL SECURITY');
  });

  it('keeps pantry_on_hand_items aggregate-compatible and adds multi-lot truth', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.pantry_acquisition_lots');
    expect(sql).toContain('FOREIGN KEY (pantry_item_id, person_id)');
    expect(sql).toContain('REFERENCES public.pantry_on_hand_items (id, person_id)');
    expect(sql).toContain('quantity_acquired NUMERIC NOT NULL');
    expect(sql).toContain('quantity_remaining NUMERIC NOT NULL');
    expect(sql).toContain('acquired_on DATE NOT NULL');
    expect(sql).toContain('expires_on DATE');
    expect(sql).toContain('expected_shelf_life_days INTEGER');
    expect(sql).toContain('source_haul_item_id UUID');
    expect(sql).not.toMatch(/ALTER TABLE public\.pantry_on_hand_items\s+(DROP|ALTER COLUMN)/);
    expect(sql).not.toMatch(/\buse_soon\b/i);
  });

  it('preserves historical lot provenance and adds focused owner/parent indexes and RLS', () => {
    expect(sql).toContain('pantry_acquisition_lots_haul_owner_fk');
    expect(sql).toContain('pantry_acquisition_lots_haul_item_owner_fk');
    expect(sql).toContain('ON DELETE NO ACTION');
    expect(sql).toContain('idx_pantry_acquisition_lots_person_acquired');
    expect(sql).toContain('idx_pantry_acquisition_lots_pantry_acquired');
    expect(sql).toContain('idx_pantry_acquisition_lots_source_haul');
    expect(sql).toContain('ALTER TABLE public.pantry_acquisition_lots ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('Users can insert own pantry_acquisition_lots');
  });

  it('adds atomic multi-List creation while retaining the one-List RPC signature', () => {
    expect(sql).toContain(
      `CREATE OR REPLACE FUNCTION public.${GROCERY_HAUL_CREATE_MULTI_RPC_NAME}(`,
    );
    expect(sql).toContain('p_source_grocery_list_ids UUID[]');
    expect(sql).toContain('GROUP BY source_id');
    expect(sql).toContain('INSERT INTO public.grocery_haul_source_lists');
    expect(sql).toContain('gi.grocery_list_id = ANY(v_source_list_ids)');
    expect(sql).toContain('gi.source_type');
    expect(sql).toContain('gi.source_id');
    expect(sql).toContain("'source_grocery_list_ids'");
    expect(sql).toContain(
      `CREATE OR REPLACE FUNCTION public.${GROCERY_HAUL_CREATE_RPC_NAME}(`,
    );
    expect(sql).toContain('ARRAY[p_source_grocery_list_id]');
  });

  it('checks every source List owner and keeps both RPCs service-role-only', () => {
    expect(sql).toContain('person_id = p_person_id');
    expect(sql).toContain('<> cardinality(v_source_list_ids)');
    expect(sql).toContain("RAISE EXCEPTION 'HAUL_CREATE_LIST_NOT_FOUND'");
    for (const signature of [
      `${GROCERY_HAUL_CREATE_MULTI_RPC_NAME}(UUID, UUID[], DATE, UUID)`,
      `${GROCERY_HAUL_CREATE_RPC_NAME}(UUID, UUID, DATE, UUID)`,
    ]) {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${signature} FROM authenticated`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role`);
    }
  });
});
