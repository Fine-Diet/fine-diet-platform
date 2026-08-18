import fs from 'fs';
import path from 'path';
import {
  GROCERY_HAUL_CREATION_TOKEN_UNIQUE,
  GROCERY_HAUL_ITEM_SOURCE_STATUSES,
  GROCERY_HAUL_OPEN_LIST_DATE_UNIQUE,
  GROCERY_HAUL_OPEN_STATUSES,
  GROCERY_HAUL_ROLLBACK_SQL_PATH,
  GROCERY_HAUL_SOURCE_TYPES,
  GROCERY_HAUL_SQL_PATH,
  GROCERY_HAUL_STATUSES,
  isGroceryHaulStatus,
  isOpenGroceryHaulStatus,
} from '../schema';

function readSql(): string {
  return fs.readFileSync(path.join(process.cwd(), GROCERY_HAUL_SQL_PATH), 'utf8');
}

function readRollback(): string {
  return fs.readFileSync(path.join(process.cwd(), GROCERY_HAUL_ROLLBACK_SQL_PATH), 'utf8');
}

describe('grocery haul schema contract', () => {
  const sql = readSql();

  it('creates canonical grocery_hauls with required identity fields and no retailer/price/checkout columns', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.grocery_hauls');
    const haulTable = sql.slice(
      sql.indexOf('CREATE TABLE IF NOT EXISTS public.grocery_hauls'),
      sql.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS idx_grocery_hauls_id_person'),
    );
    expect(haulTable).toContain('id UUID PRIMARY KEY DEFAULT gen_random_uuid()');
    expect(haulTable).toContain('person_id UUID NOT NULL');
    expect(haulTable).toContain('source_grocery_list_id UUID NOT NULL');
    expect(haulTable).toContain('shopping_date DATE NOT NULL');
    expect(haulTable).toContain('creation_token UUID NOT NULL');
    expect(haulTable).toContain('created_at TIMESTAMPTZ NOT NULL DEFAULT now()');
    expect(haulTable).toContain('updated_at TIMESTAMPTZ NOT NULL DEFAULT now()');
    for (const status of GROCERY_HAUL_STATUSES) {
      expect(haulTable).toContain(`'${status}'`);
    }
    expect(haulTable).not.toMatch(/\bretailer\b/);
    expect(haulTable).not.toMatch(/\bstore_id\b/);
    expect(haulTable).not.toContain('estimated_total');
    expect(haulTable).not.toContain('cart_id');
    expect(haulTable).not.toContain('checkout_id');
    expect(haulTable).not.toContain('receipt_id');
  });

  it('creates grocery_haul_items with haul FK, source item reference, and frozen snapshots', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.grocery_haul_items');
    expect(sql).toContain('haul_id UUID NOT NULL');
    expect(sql).toContain('grocery_item_id UUID');
    expect(sql).not.toContain('grocery_item_id UUID NOT NULL');
    expect(sql).toContain('name_snapshot TEXT NOT NULL');
    expect(sql).toContain('quantity_snapshot NUMERIC');
    expect(sql).toContain('unit_snapshot TEXT');
    expect(sql).toContain('food_object_id_snapshot UUID');
    expect(sql).toContain('source_status_snapshot TEXT NOT NULL');
    expect(sql).toContain('UNIQUE (haul_id, grocery_item_id)');
    for (const status of GROCERY_HAUL_ITEM_SOURCE_STATUSES) {
      expect(sql).toContain(`'${status}'`);
    }
    for (const sourceType of GROCERY_HAUL_SOURCE_TYPES) {
      expect(sql).toContain(`'${sourceType}'`);
    }
  });

  it('enforces retry safety and open-haul uniqueness at the database', () => {
    expect(sql).toContain(GROCERY_HAUL_CREATION_TOKEN_UNIQUE);
    expect(sql).toContain('ON public.grocery_hauls (person_id, creation_token)');
    expect(sql).toContain(GROCERY_HAUL_OPEN_LIST_DATE_UNIQUE);
    expect(sql).toContain(
      'ON public.grocery_hauls (person_id, source_grocery_list_id, shopping_date)',
    );
    expect(sql).toContain(
      `WHERE status IN ('${GROCERY_HAUL_OPEN_STATUSES.join("', '")}')`,
    );
  });

  it('binds Haul owner to source list and does not cascade-delete lists', () => {
    expect(sql).toContain(
      'FOREIGN KEY (source_grocery_list_id, person_id)',
    );
    expect(sql).toContain('CONSTRAINT grocery_hauls_list_owner_fk');
    expect(sql).toContain('REFERENCES public.generated_grocery_lists (id, person_id)');
    expect(sql).toContain('ON DELETE NO ACTION');
    expect(sql).not.toContain(
      'REFERENCES public.generated_grocery_lists (id, person_id)\n    ON DELETE CASCADE',
    );
    expect(sql).toContain('FOREIGN KEY (haul_id, person_id)');
    expect(sql).toContain('REFERENCES public.grocery_hauls (id, person_id)\n    ON DELETE CASCADE');
  });

  it('preserves haul-item snapshots when a source grocery item is hard-deleted', () => {
    expect(sql).toContain('REFERENCES public.grocery_items(id) ON DELETE SET NULL');
    expect(sql).not.toContain('grocery_haul_items_item_owner_fk');
    expect(sql).not.toContain('grocery_haul_items_item_list_fk');
    expect(sql).not.toContain('FOREIGN KEY (grocery_item_id, person_id)');
    expect(sql).not.toContain('FOREIGN KEY (grocery_item_id, source_grocery_list_id)');
    expect(sql).not.toMatch(
      /REFERENCES public\.grocery_items\(id\) ON DELETE CASCADE/,
    );
    expect(sql).toContain('revalidate');
  });

  it('uses owner-only RLS with WITH CHECK on writes', () => {
    expect(sql).toContain('ALTER TABLE public.grocery_hauls ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE public.grocery_haul_items ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('Users can insert own grocery_hauls');
    expect(sql).toContain('Users can insert own grocery_haul_items');
    expect(sql).toContain('WITH CHECK');
    expect(sql).toContain('auth_user_id = auth.uid()');
  });

  it('rollback drops haul tables only and does not drop lists or estimates', () => {
    const rollback = readRollback();
    expect(rollback).toContain('DROP TABLE IF EXISTS public.grocery_haul_items');
    expect(rollback).toContain('DROP TABLE IF EXISTS public.grocery_hauls');
    expect(rollback).not.toContain('DROP TABLE IF EXISTS public.generated_grocery_lists');
    expect(rollback).not.toContain('DROP TABLE IF EXISTS public.grocery_items');
    expect(rollback).not.toContain('grocery_list_purchasing_choices');
    expect(rollback).not.toContain('idx_grocery_items_id_person');
    expect(rollback).not.toContain('idx_grocery_items_id_list');
  });

  it('treats planned/active as open and closed/cancelled as historical', () => {
    expect(isGroceryHaulStatus('planned')).toBe(true);
    expect(isGroceryHaulStatus('shopping')).toBe(false);
    expect(isOpenGroceryHaulStatus('planned')).toBe(true);
    expect(isOpenGroceryHaulStatus('active')).toBe(true);
    expect(isOpenGroceryHaulStatus('closed')).toBe(false);
    expect(isOpenGroceryHaulStatus('cancelled')).toBe(false);
  });
});
