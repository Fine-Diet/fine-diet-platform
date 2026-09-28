import fs from 'fs';
import path from 'path';
import {
  GROCERY_HAUL_REMOVE_STORE_RPC_NAME,
  GROCERY_HAUL_STORE_ROSTER_SQL_PATH,
} from '../schema';

const sql = fs.readFileSync(
  path.join(process.cwd(), GROCERY_HAUL_STORE_ROSTER_SQL_PATH),
  'utf8',
);

describe('Haul store roster SQL contract', () => {
  it('pins remove RPC to SECURITY INVOKER and safe search_path', () => {
    expect(sql).toContain(
      `CREATE OR REPLACE FUNCTION public.${GROCERY_HAUL_REMOVE_STORE_RPC_NAME}(`,
    );
    expect(sql).toContain('SECURITY INVOKER');
    expect(sql).not.toContain('SECURITY DEFINER');
    expect(sql).toContain('SET search_path = public, pg_temp');
  });

  it('restricts roster table writes and RPC execute to service_role', () => {
    expect(sql).toContain(
      'REVOKE ALL PRIVILEGES ON public.grocery_haul_stores FROM anon, authenticated',
    );
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.grocery_haul_stores TO service_role',
    );
    expect(sql).toContain(
      `REVOKE EXECUTE ON FUNCTION public.${GROCERY_HAUL_REMOVE_STORE_RPC_NAME}(UUID, UUID, UUID) FROM PUBLIC`,
    );
    expect(sql).toContain(
      `GRANT EXECUTE ON FUNCTION public.${GROCERY_HAUL_REMOVE_STORE_RPC_NAME}(UUID, UUID, UUID) TO service_role`,
    );
  });

  it('guards roster mutation to planned hauls only', () => {
    expect(sql).toContain("RAISE EXCEPTION 'HAUL_STORE_ROSTER_NOT_DRAFT'");
    expect(sql).toContain('guard_grocery_haul_store_roster');
  });
});
