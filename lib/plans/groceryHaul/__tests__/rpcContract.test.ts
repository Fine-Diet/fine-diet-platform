import fs from 'fs';
import path from 'path';
import {
  GROCERY_HAUL_CREATE_OUTCOMES,
  GROCERY_HAUL_CREATE_RPC_ERRORS,
  GROCERY_HAUL_CREATE_RPC_NAME,
  GROCERY_HAUL_CREATE_RPC_ROLLBACK_SQL_PATH,
  GROCERY_HAUL_CREATE_RPC_SQL_PATH,
  GROCERY_HAUL_CREATE_RPC_VERIFY_SQL_PATH,
  GROCERY_HAUL_CREATION_TOKEN_UNIQUE,
  GROCERY_HAUL_OPEN_LIST_DATE_UNIQUE,
} from '../schema';

function readSql(): string {
  return fs.readFileSync(path.join(process.cwd(), GROCERY_HAUL_CREATE_RPC_SQL_PATH), 'utf8');
}

function readRollback(): string {
  return fs.readFileSync(
    path.join(process.cwd(), GROCERY_HAUL_CREATE_RPC_ROLLBACK_SQL_PATH),
    'utf8',
  );
}

function readVerify(): string {
  return fs.readFileSync(path.join(process.cwd(), GROCERY_HAUL_CREATE_RPC_VERIFY_SQL_PATH), 'utf8');
}

function section(sql: string, beginMarker: string, endMarker: string): string {
  const start = sql.indexOf(beginMarker);
  const end = sql.indexOf(endMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe('create_grocery_haul_from_list RPC contract', () => {
  const sql = readSql();

  it('defines the authorized SECURITY INVOKER function with pinned search_path', () => {
    expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${GROCERY_HAUL_CREATE_RPC_NAME}(`);
    expect(sql).toContain('p_person_id UUID');
    expect(sql).toContain('p_source_grocery_list_id UUID');
    expect(sql).toContain('p_shopping_date DATE');
    expect(sql).toContain('p_creation_token UUID');
    expect(sql).toContain('RETURNS JSONB');
    expect(sql).toContain('SECURITY INVOKER');
    expect(sql).not.toContain('SECURITY DEFINER');
    expect(sql).toContain('SET search_path = public, pg_temp');
    expect(sql).toContain(
      `REVOKE ALL ON FUNCTION public.${GROCERY_HAUL_CREATE_RPC_NAME}(UUID, UUID, DATE, UUID) FROM PUBLIC`,
    );
    expect(sql).toContain(
      `GRANT EXECUTE ON FUNCTION public.${GROCERY_HAUL_CREATE_RPC_NAME}(UUID, UUID, DATE, UUID) TO service_role`,
    );
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]*TO authenticated/);
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]*TO anon/);
  });

  it('returns canonical Haul identity, item_count, and created/reused outcome', () => {
    for (const key of [
      "'haul_id'",
      "'person_id'",
      "'source_grocery_list_id'",
      "'shopping_date'",
      "'status'",
      "'creation_token'",
      "'item_count'",
      "'outcome'",
    ]) {
      expect(sql).toContain(key);
    }
    for (const outcome of GROCERY_HAUL_CREATE_OUTCOMES) {
      expect(sql).toContain(`'${outcome}'`);
    }
    for (const code of GROCERY_HAUL_CREATE_RPC_ERRORS) {
      expect(sql).toContain(`'${code}'`);
    }
  });

  it('validates caller and list ownership before insert and snapshots pending items only', () => {
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain('HAUL_CREATE_FORBIDDEN');
    expect(sql).toContain('FROM public.generated_grocery_lists');
    expect(sql).toContain('HAUL_CREATE_LIST_NOT_FOUND');
    expect(sql).toContain("gi.status = 'pending'");
    expect(sql).toContain('gi.grocery_list_id = p_source_grocery_list_id');
    expect(sql).toContain('gi.person_id = p_person_id');
    expect(sql).toContain('name_snapshot');
    expect(sql).toContain('quantity_snapshot');
    expect(sql).toContain('unit_snapshot');
    expect(sql).toContain('food_object_id_snapshot');
    expect(sql).toContain('source_status_snapshot');
    expect(sql).toContain('source_type_snapshot');
    expect(sql).toContain('source_id_snapshot');
  });

  it('uses Packet 11A unique indexes as collision authority rather than check-then-insert', () => {
    const haulInsert = section(sql, 'HAUL_INSERT_BEGIN', 'HAUL_INSERT_END');
    expect(haulInsert).toContain('INSERT INTO public.grocery_hauls');
    expect(haulInsert).toContain('WHEN unique_violation THEN');
    expect(haulInsert).toContain(GROCERY_HAUL_CREATION_TOKEN_UNIQUE);
    expect(haulInsert).toContain(GROCERY_HAUL_OPEN_LIST_DATE_UNIQUE);
    expect(haulInsert).toContain('HAUL_CREATE_OPEN_EXISTS');
    const insertAt = haulInsert.indexOf('INSERT INTO public.grocery_hauls');
    const reuseSelectAt = haulInsert.indexOf('FROM public.grocery_hauls');
    expect(insertAt).toBeGreaterThan(0);
    expect(reuseSelectAt).toBeGreaterThan(insertAt);
    expect(sql).toContain('pg_advisory_xact_lock');
  });

  it('reuses creation_token only on exact person/list/date semantic replay', () => {
    const haulInsert = section(sql, 'HAUL_INSERT_BEGIN', 'HAUL_INSERT_END');
    expect(haulInsert).toContain('HAUL_CREATE_TOKEN_MISMATCH');
    expect(haulInsert).toContain(
      'v_haul.source_grocery_list_id IS DISTINCT FROM p_source_grocery_list_id',
    );
    expect(haulInsert).toContain(
      'v_haul.shopping_date IS DISTINCT FROM p_shopping_date',
    );
    const mismatchAt = haulInsert.indexOf("RAISE EXCEPTION 'HAUL_CREATE_TOKEN_MISMATCH'");
    const reuseFlagAt = haulInsert.indexOf('v_created := FALSE');
    expect(mismatchAt).toBeGreaterThan(0);
    expect(reuseFlagAt).toBeGreaterThan(mismatchAt);
    // Token mismatch must not fall through to open-Haul handling.
    const openExistsAt = haulInsert.indexOf("RAISE EXCEPTION 'HAUL_CREATE_OPEN_EXISTS'");
    expect(openExistsAt).toBeGreaterThan(mismatchAt);
    expect(sql).toContain("'reused'");
  });

  it('rolls back the Haul when item insert fails or no pending items exist', () => {
    const itemInsert = section(sql, 'ITEM_INSERT_BEGIN', 'ITEM_INSERT_END');
    expect(itemInsert).toContain('INSERT INTO public.grocery_haul_items');
    expect(itemInsert).not.toMatch(/^\s*EXCEPTION\b/m);
    expect(itemInsert).not.toContain('WHEN unique_violation');
    expect(itemInsert).not.toMatch(/\bCOMMIT\b/);
    expect(itemInsert).not.toMatch(/\bROLLBACK\b/);

    const haulInsertAt = sql.indexOf('INSERT INTO public.grocery_hauls');
    const itemInsertAt = sql.indexOf('INSERT INTO public.grocery_haul_items');
    const zeroPendingAt = sql.indexOf("RAISE EXCEPTION 'HAUL_CREATE_NO_PENDING_ITEMS'");
    expect(haulInsertAt).toBeGreaterThan(0);
    expect(itemInsertAt).toBeGreaterThan(haulInsertAt);
    expect(zeroPendingAt).toBeGreaterThan(itemInsertAt);

    expect(sql).toContain(
      'rolls back the Haul row',
    );
    expect(sql).toContain('no EXCEPTION handler');
  });

  it('does not add tables/columns or mutate List/Pantry/pricing/checkout', () => {
    const body = sql.slice(sql.indexOf('AS $$'), sql.lastIndexOf('$$;'));
    expect(body).not.toMatch(/CREATE TABLE/i);
    expect(body).not.toMatch(/ALTER TABLE/i);
    expect(body).not.toMatch(/UPDATE public\.grocery_items/i);
    expect(body).not.toMatch(/UPDATE public\.generated_grocery_lists/i);
    expect(body).not.toMatch(/DELETE FROM public\.grocery_items/i);
    expect(body).not.toMatch(/INSERT INTO public\.\w*pantry/i);
    expect(body).not.toMatch(/UPDATE public\.\w*pantry/i);
    expect(body).not.toMatch(/\bretailer\b/i);
    expect(body).not.toMatch(/\bstore_id\b/i);
    expect(body).not.toContain('estimated_total');
    expect(body).not.toContain('checkout');
    expect(body).not.toContain('receipt');
    expect(body).not.toContain('cart_id');
  });

  it('rollback drops only the RPC function', () => {
    const rollback = readRollback();
    expect(rollback).toContain(
      `DROP FUNCTION IF EXISTS public.${GROCERY_HAUL_CREATE_RPC_NAME}(UUID, UUID, DATE, UUID)`,
    );
    expect(rollback).not.toContain('DROP TABLE');
    expect(rollback).not.toContain('DROP TABLE IF EXISTS public.grocery_hauls');
    expect(rollback).not.toContain('DROP TABLE IF EXISTS public.generated_grocery_lists');
  });

  it('documents an isolated forced item-insert failure proof that leaves no Haul row', () => {
    const verify = readVerify();
    expect(verify).toContain('scratch');
    expect(verify).toContain('FORCED_ITEM_INSERT_FAILURE');
    expect(verify).toContain('HAUL_CREATE_NO_PENDING_ITEMS');
    expect(verify).toContain('HAUL_CREATE_TOKEN_MISMATCH');
    expect(verify).toContain('HAUL_CREATE_OPEN_EXISTS');
    expect(verify).toContain('prosecdef');
    expect(verify).toContain('is_security_definer');
    expect(verify).toContain('Do NOT run against production');
  });
});
