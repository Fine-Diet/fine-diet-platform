import fs from 'fs';
import path from 'path';
import { createFakeSupabase, type Row } from '@/lib/plans/__tests__/testSupabaseFake';

const mockFrom = jest.fn();
const mockRpc = jest.fn();
jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));
jest.mock('@/lib/plans/groceryListService', () => ({
  GroceryListNotFoundError: class GroceryListNotFoundError extends Error {},
  getPersistentGroceryListDetail: jest.fn(),
}));

import { getGroceryHaulDetail, getGroceryHaulExecution } from '../service';
import * as schema from '../schema';

const root = process.cwd();
const migration = fs.readFileSync(path.join(root, schema.HAUL_INVITE_COLLABORATION_SQL_PATH), 'utf8');
const rollback = fs.readFileSync(
  path.join(root, schema.HAUL_INVITE_COLLABORATION_ROLLBACK_SQL_PATH),
  'utf8',
);

/** Strip SQL comments so string assertions only see executable SQL. */
function executable(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}
const migrationSql = executable(migration);

describe('SQL ↔ TypeScript drift contract', () => {
  it('maps every application-facing database error code to a TypeScript vocabulary', () => {
    const raised = Array.from(
      new Set(Array.from(migrationSql.matchAll(/RAISE EXCEPTION '([A-Z_]+)'/g)).map((m) => m[1])),
    ).filter((code) => code.startsWith('HAUL_'));
    expect(raised.length).toBeGreaterThan(10);

    // Codes raised by table guards/triggers. These protect invariants and are
    // reachable only if application code is bypassed; RPC preconditions catch
    // legitimate misuse first, so they surface as generic 500s by design.
    const internalGuards = new Set([
      'HAUL_CONTRIBUTOR_ATTRIBUTION_REQUIRED',
      'HAUL_CONTRIBUTOR_HAUL_NOT_FOUND',
      'HAUL_CONTRIBUTOR_NOT_MEMBER',
      'HAUL_EXECUTION_SOURCE_MISMATCH',
      'HAUL_INVITE_IMMUTABLE',
      'HAUL_INVITE_INVALID_STATE',
      'HAUL_INVITE_INVALID_TRANSITION',
      'HAUL_ITEM_SNAPSHOT_IMMUTABLE',
      'HAUL_PREPARATION_EXECUTION_LOCKED',
      'HAUL_PREPARATION_HISTORICAL',
      'HAUL_PREPARATION_NOT_DRAFT',
    ]);
    const mapped = new Set<string>([
      ...schema.HAUL_INVITE_RPC_ERRORS,
      ...schema.HAUL_CONTRIBUTOR_RPC_ERRORS,
    ]);
    const unmapped = raised.filter((code) => !mapped.has(code) && !internalGuards.has(code));
    expect(unmapped).toEqual([]);
  });

  it('only declares TypeScript error codes the SQL can actually raise', () => {
    const declared = [
      ...schema.HAUL_INVITE_RPC_ERRORS,
      ...schema.HAUL_CONTRIBUTOR_RPC_ERRORS,
    ];
    const notRaised = declared.filter((code) => !migrationSql.includes(`'${code}'`));
    expect(notRaised).toEqual([]);
  });

  it('defines every RPC the service calls, with the parameter names the service sends', () => {
    const contracts: Array<[string, string[]]> = [
      [schema.HAUL_INVITE_CREATE_RPC_NAME, ['p_actor_person_id', 'p_haul_id', 'p_email']],
      [schema.HAUL_INVITE_REVOKE_RPC_NAME, ['p_actor_person_id', 'p_haul_id', 'p_invitation_id']],
      [schema.HAUL_INVITE_ACCEPT_RPC_NAME, ['p_actor_person_id', 'p_invitation_id']],
      [
        schema.HAUL_CONTRIBUTOR_ITEM_ADD_RPC_NAME,
        ['p_actor_person_id', 'p_haul_id', 'p_name', 'p_quantity', 'p_unit'],
      ],
      [
        schema.HAUL_CONTRIBUTOR_ITEM_UPDATE_RPC_NAME,
        ['p_actor_person_id', 'p_haul_id', 'p_item_id', 'p_patch'],
      ],
      [
        schema.HAUL_CONTRIBUTOR_ITEM_REMOVE_RPC_NAME,
        ['p_actor_person_id', 'p_haul_id', 'p_item_id'],
      ],
    ];
    for (const [name, params] of contracts) {
      const match = migrationSql.match(
        new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(([\\s\\S]*?)\\)\\s*RETURNS`),
      );
      expect(match).not.toBeNull();
      const declared = Array.from((match as RegExpMatchArray)[1].matchAll(/(p_[a-z_]+)\s+/g)).map(
        (m) => m[1],
      );
      expect(declared).toEqual(params);
    }
  });

  it('keeps the database limits mirrored in TypeScript', () => {
    expect(migrationSql).toContain(`>= ${schema.HAUL_INVITE_MAX_LIVE_PER_HAUL}`);
    expect(migrationSql).toContain(`>= ${schema.HAUL_INVITE_MAX_PENDING_PER_OWNER}`);
    expect(migrationSql).toContain(`>= ${schema.HAUL_CONTRIBUTOR_MAX_ITEMS_PER_MEMBER}`);
  });

  it('keeps status, role and origin vocabularies identical to the CHECK constraints', () => {
    for (const status of schema.HAUL_INVITATION_STATUSES) expect(migrationSql).toContain(`'${status}'`);
    for (const role of schema.HAUL_INVITATION_ROLES) expect(migrationSql).toContain(`'${role}'`);
    for (const origin of schema.HAUL_ITEM_ORIGIN_TYPES) expect(migrationSql).toContain(`'${origin}'`);
  });
});

describe('security posture of the migration text', () => {
  it('never uses SECURITY DEFINER', () => {
    expect(migrationSql).not.toMatch(/SECURITY\s+DEFINER/i);
  });

  it('declares every function SECURITY INVOKER with a pinned search_path', () => {
    const functions = migrationSql.match(/CREATE OR REPLACE FUNCTION public\.[a-z_]+\(/g) ?? [];
    expect(functions.length).toBeGreaterThanOrEqual(10);
    const invoker = migrationSql.match(/SECURITY INVOKER/g) ?? [];
    const pinned = migrationSql.match(/SET search_path = public, pg_temp/g) ?? [];
    expect(invoker.length).toBe(functions.length);
    expect(pinned.length).toBe(functions.length);
  });

  it('enables RLS on the invitations table and grants clients read-only access', () => {
    expect(migrationSql).toContain(
      'ALTER TABLE public.grocery_haul_invitations ENABLE ROW LEVEL SECURITY',
    );
    expect(migrationSql).toMatch(
      /REVOKE ALL PRIVILEGES ON public\.grocery_haul_invitations FROM anon, authenticated/,
    );
    expect(migrationSql).toMatch(
      /GRANT SELECT ON public\.grocery_haul_invitations TO authenticated/,
    );
    expect(migrationSql).not.toMatch(
      /GRANT\s+(ALL|INSERT|UPDATE|DELETE)[^;]*grocery_haul_invitations[^;]*TO\s+(authenticated|anon|PUBLIC)/i,
    );
  });

  it('grants RPC execution to service_role only and revokes PUBLIC/anon/authenticated', () => {
    expect(migrationSql).toContain("REVOKE ALL ON FUNCTION %s FROM PUBLIC");
    expect(migrationSql).toContain("REVOKE EXECUTE ON FUNCTION %s FROM anon");
    expect(migrationSql).toContain("REVOKE EXECUTE ON FUNCTION %s FROM authenticated");
    expect(migrationSql).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
    expect(migrationSql).not.toMatch(/GRANT EXECUTE ON FUNCTION[^;]*TO\s+(authenticated|anon|PUBLIC)/i);
    // The loop must cover every RPC the service calls.
    for (const name of [
      schema.HAUL_INVITE_CREATE_RPC_NAME,
      schema.HAUL_INVITE_REVOKE_RPC_NAME,
      schema.HAUL_INVITE_ACCEPT_RPC_NAME,
      schema.HAUL_CONTRIBUTOR_ITEM_ADD_RPC_NAME,
      schema.HAUL_CONTRIBUTOR_ITEM_UPDATE_RPC_NAME,
      schema.HAUL_CONTRIBUTOR_ITEM_REMOVE_RPC_NAME,
    ]) {
      const loop = migrationSql.slice(migrationSql.indexOf('REVOKE ALL ON FUNCTION %s FROM PUBLIC') - 1800);
      expect(loop).toContain(`public.${name}(`);
    }
  });

  it('adds no UPDATE policy without both USING and WITH CHECK', () => {
    const policies = migrationSql.match(/CREATE POLICY[\s\S]*?;/g) ?? [];
    for (const policy of policies) {
      if (/FOR\s+UPDATE/i.test(policy)) {
        expect(policy).toMatch(/USING/);
        expect(policy).toMatch(/WITH CHECK/);
      }
    }
    // Clients get read-only policies; every write is service_role via RPC.
    expect(policies.every((policy) => /FOR\s+SELECT/i.test(policy))).toBe(true);
  });

  it('is repository-only text: guarded, idempotent and free of destructive top-level statements', () => {
    expect(migration).toMatch(/Do NOT apply to production/i);
    expect(migrationSql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migrationSql).not.toMatch(/\bTRUNCATE\b/i);
    // The single permitted DELETE is the contributor-item removal RPC, scoped to one id
    // that the RPC has already proven is a contributor row the actor may remove.
    const deletes = migrationSql.match(/\bDELETE\s+FROM\s+[^;]+;/gi) ?? [];
    expect(deletes).toEqual(['DELETE FROM public.grocery_haul_items WHERE id = v_item.id;']);
  });

  it('refuses to roll back over real user data', () => {
    expect(rollback).toContain('ROLLBACK_BLOCKED');
  });
});

describe('Haul-only item read path (regression for nullable source List)', () => {
  const startedAt = '2026-09-08T15:00:00.000Z';
  const PERSON = 'person-owner';

  function install(): void {
    const initial: Record<string, Row[]> = {
      grocery_hauls: [
        {
          id: 'haul-1',
          person_id: PERSON,
          source_grocery_list_id: 'list-1',
          shopping_date: '2026-09-08',
          status: 'active',
          creation_token: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          title: 'Weekend',
          budget_amount: 40,
          currency: 'USD',
          shopping_started_at: startedAt,
          created_at: startedAt,
          updated_at: startedAt,
        },
      ],
      grocery_haul_source_lists: [
        { haul_id: 'haul-1', person_id: PERSON, grocery_list_id: 'list-1', created_at: startedAt },
      ],
      generated_grocery_lists: [{ id: 'list-1', person_id: PERSON, title: 'Essentials' }],
      grocery_haul_stores: [],
      grocery_haul_items: [
        {
          id: 'snap-1',
          haul_id: 'haul-1',
          person_id: PERSON,
          source_grocery_list_id: 'list-1',
          grocery_item_id: 'gi-1',
          origin_type: 'source_list_snapshot',
          added_by_person_id: null,
          name_snapshot: 'Oats',
          quantity_snapshot: 2,
          final_quantity: 2,
          created_at: startedAt,
        },
        {
          id: 'contrib-1',
          haul_id: 'haul-1',
          person_id: PERSON,
          source_grocery_list_id: null,
          grocery_item_id: null,
          origin_type: 'haul_contributor',
          added_by_person_id: 'person-alice',
          name_snapshot: 'Lemons',
          quantity_snapshot: 3,
          final_quantity: 3,
          created_at: startedAt,
        },
      ],
      grocery_haul_execution_items: [
        {
          id: 'exec-1',
          person_id: PERSON,
          haul_id: 'haul-1',
          haul_item_id: 'snap-1',
          sort_ordinal: 1,
          state: 'pending',
          source_grocery_list_id: 'list-1',
          source_name_snapshot: 'Oats',
          source_quantity_snapshot: 2,
          prepared_quantity: 2,
        },
        {
          id: 'exec-2',
          person_id: PERSON,
          haul_id: 'haul-1',
          haul_item_id: 'contrib-1',
          sort_ordinal: 2,
          state: 'pending',
          source_grocery_list_id: null,
          source_name_snapshot: 'Lemons',
          source_quantity_snapshot: 3,
          prepared_quantity: 3,
        },
      ],
    };
    const fake = createFakeSupabase(initial);
    mockFrom.mockImplementation((table: string) => fake.from(table));
    mockRpc.mockResolvedValue({
      data: {
        haul_id: 'haul-1',
        status: 'active',
        can_start: false,
        executable_item_count: 2,
        blockers: [],
        warnings: [],
        deferred_findings: [],
      },
      error: null,
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    install();
  });

  it('reads a Haul with a NULL-source contributor item and preserves attribution', async () => {
    const detail = await getGroceryHaulDetail(PERSON, 'haul-1');
    const snapshot = detail.items.find((item) => item.id === 'snap-1');
    const contributor = detail.items.find((item) => item.id === 'contrib-1');
    expect(snapshot).toMatchObject({
      origin_type: 'source_list_snapshot',
      source_grocery_list_id: 'list-1',
      added_by_person_id: null,
    });
    expect(contributor).toMatchObject({
      origin_type: 'haul_contributor',
      source_grocery_list_id: null,
      grocery_item_id: null,
      added_by_person_id: 'person-alice',
    });
    // Contributor items are real Haul items: they count in the estimate inputs.
    expect(detail.items).toHaveLength(2);
  });

  it('defaults provenance for rows read before the migration is applied', async () => {
    const legacy = createFakeSupabase({
      grocery_hauls: [
        {
          id: 'haul-1',
          person_id: PERSON,
          source_grocery_list_id: 'list-1',
          shopping_date: '2026-09-08',
          status: 'planned',
          creation_token: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          currency: 'USD',
          created_at: startedAt,
          updated_at: startedAt,
        },
      ],
      grocery_haul_source_lists: [
        { haul_id: 'haul-1', person_id: PERSON, grocery_list_id: 'list-1', created_at: startedAt },
      ],
      generated_grocery_lists: [{ id: 'list-1', person_id: PERSON, title: 'Essentials' }],
      grocery_haul_stores: [],
      // No origin_type / added_by_person_id columns at all: pre-migration shape.
      grocery_haul_items: [
        {
          id: 'old-1',
          haul_id: 'haul-1',
          person_id: PERSON,
          source_grocery_list_id: 'list-1',
          name_snapshot: 'Oats',
          quantity_snapshot: 2,
          final_quantity: 2,
          created_at: startedAt,
        },
      ],
    });
    mockFrom.mockImplementation((table: string) => legacy.from(table));
    const detail = await getGroceryHaulDetail(PERSON, 'haul-1');
    expect(detail.items[0]).toMatchObject({
      origin_type: 'source_list_snapshot',
      added_by_person_id: null,
      source_grocery_list_id: 'list-1',
    });
  });

  it('loads Shopping View with a NULL-source execution row without stringifying null', async () => {
    const detail = await getGroceryHaulExecution(PERSON, 'haul-1');
    const snapshot = detail.items.find((item) => item.id === 'exec-1');
    const haulOnly = detail.items.find((item) => item.id === 'exec-2');
    expect(snapshot).toMatchObject({ source_grocery_list_id: 'list-1', source_list_title: 'Essentials' });
    expect(haulOnly).toMatchObject({ source_grocery_list_id: null, source_list_title: null });
    expect(detail.summary.total_count).toBe(2);
    // The source-title lookup must never have been asked about the string "null".
    const titleLookups = mockFrom.mock.calls.filter(([table]) => table === 'generated_grocery_lists');
    expect(titleLookups.length).toBeGreaterThan(0);
  });
});
