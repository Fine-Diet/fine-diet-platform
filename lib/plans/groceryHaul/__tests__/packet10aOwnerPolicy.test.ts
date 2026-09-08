import fs from 'fs';
import path from 'path';
import {
  SHOPPING_EXECUTION_OWNER_POLICY_SQL_PATH,
  SHOPPING_EXECUTION_OWNER_POLICY_VERIFY_SQL_PATH,
  SHOPPING_VIEW_EXECUTION_SQL_PATH,
} from '../schema';

const sql = fs.readFileSync(
  path.join(process.cwd(), SHOPPING_EXECUTION_OWNER_POLICY_SQL_PATH),
  'utf8',
);
const verifySql = fs.readFileSync(
  path.join(process.cwd(), SHOPPING_EXECUTION_OWNER_POLICY_VERIFY_SQL_PATH),
  'utf8',
);
const packet9Sql = fs.readFileSync(
  path.join(process.cwd(), SHOPPING_VIEW_EXECUTION_SQL_PATH),
  'utf8',
);

describe('Packet 10A shopping execution owner SELECT policy', () => {
  it('replaces only the execution-items owner SELECT policy with initplan-safe auth evaluation', () => {
    expect(sql).toContain(
      'DROP POLICY IF EXISTS "Users can read own grocery_haul_execution_items"',
    );
    expect(sql).toContain(
      'CREATE POLICY "Users can read own grocery_haul_execution_items"',
    );
    expect(sql).toContain('FOR SELECT USING');
    expect(sql).toContain('SELECT people.id');
    expect(sql).toContain('FROM public.people');
    expect(sql).toContain('people.auth_user_id = (select auth.uid())');
    expect(sql).toContain(
      'ALTER TABLE public.grocery_haul_execution_items ENABLE ROW LEVEL SECURITY',
    );
    expect(sql).not.toMatch(/Users can (read|insert|update|delete) own grocery_hauls\b/);
    expect(sql).not.toMatch(/Users can (read|insert|update|delete) own grocery_haul_items/);
    expect(sql).not.toMatch(
      /Users can (read|insert|update|delete) own grocery_haul_source_lists/,
    );
    expect(sql).not.toMatch(/\bGRANT\b|\bREVOKE\b/);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION/);
    expect(sql).not.toMatch(/\bpantry_/i);
  });

  it('does not rewrite Packet 9 SQL and keeps ownership equivalent', () => {
    expect(packet9Sql).toContain(
      'person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())',
    );
    expect(sql).toContain('person_id IN (');
    expect(sql).toContain('WHERE people.auth_user_id = (select auth.uid())');
  });

  it('verifies RLS, owner SELECT scope, client DML denial, RPC ACL, and three-truth guards', () => {
    expect(verifySql).toContain("relname = 'grocery_haul_execution_items'");
    expect(verifySql).toContain('relrowsecurity IS NOT TRUE');
    expect(verifySql).toContain(
      "pol.polname = 'Users can read own grocery_haul_execution_items'",
    );
    expect(verifySql).toContain('people\\.auth_user_id');
    expect(verifySql).toContain('\\(\\s*SELECT\\s+auth\\.uid\\(\\)');
    expect(verifySql).toContain('authenticated_select');
    expect(verifySql).toContain('authenticated_insert_denied');
    expect(verifySql).toContain('service_role_delete');
    expect(verifySql).toContain('get_grocery_haul_execution_readiness');
    expect(verifySql).toContain('start_grocery_haul_execution');
    expect(verifySql).toContain('HAUL_EXECUTION_SNAPSHOT_IMMUTABLE');
    expect(verifySql).toContain('HAUL_EXECUTION_INVALID_TRANSITION');
    expect(verifySql).toContain('grocery_haul_execution_items_guard');
    expect(verifySql).toContain('quantity_snapshot');
    expect(verifySql).toContain('prepared_quantity');
    expect(verifySql).toContain('acquired_quantity');
  });
});
