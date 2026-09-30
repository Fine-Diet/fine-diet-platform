/**
 * Real-PostgreSQL fixture for the Haul schema and the Invite to Haul spine.
 *
 * Boots the same guarded, run-owned, socket-only disposable cluster the NDS
 * suite uses, applies a purpose-built upstream baseline, then applies the
 * repository's REAL Haul SQL files in operator order. Rehearsing the real
 * artifacts is the point: a test that applies a hand-written stand-in schema
 * proves nothing about the migration an operator would run.
 */

import path from 'path';
import type { Client } from 'pg';

import { applySqlFile } from './harness';
import { startLocalCluster, type LocalCluster } from './localPostgres';

const REPO_ROOT = process.cwd();

export const HAUL_BASELINE_SCHEMA = path.join(
  REPO_ROOT,
  'test',
  'localdb',
  'haulBaselineSchema.sql',
);

const sqlPath = (file: string) => path.join(REPO_ROOT, 'scripts', 'sql', file);

/** Existing Haul SQL, in operator order. Everything Phase A already shipped. */
export const HAUL_PRIOR_MIGRATIONS = [
  'createGroceryHaulFoundation.sql',
  'addFoodPersistenceFoundation.sql',
  'addHaulBuilderPersistence.sql',
  'addShoppingViewExecution.sql',
  'allowActiveHaulPendingPreparationEdits.sql',
  'addGroceryHaulStoreRoster.sql',
  'markGroceryHaulExecutionInBasket.sql',
  'optimizeShoppingExecutionOwnerPolicy.sql',
].map(sqlPath);

export const INVITE_MIGRATION = sqlPath('addHaulInviteCollaboration.sql');
export const INVITE_ROLLBACK = sqlPath('rollbackHaulInviteCollaboration.sql');

export interface HaulPerson {
  personId: string;
  authUserId: string | null;
  email: string;
}

export interface HaulFixture extends LocalCluster {
  sql<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<T[]>;
  /** Person with a linked auth user (a signed-in Fine Diet account). */
  linkedPerson(email?: string): Promise<HaulPerson>;
  /** people row that exists but is not yet linked to any auth user. */
  unlinkedPerson(email?: string): Promise<HaulPerson>;
  /** Attaches a fresh auth user to an unlinked person (account linking). */
  linkPerson(personId: string): Promise<string>;
  /** Active list + one pending item for the owner. */
  listWithItems(personId: string, itemNames?: string[]): Promise<{ listId: string; itemIds: string[] }>;
  /** Draft Haul with source-List membership and frozen snapshot items. */
  haulFromList(personId: string, listId: string, itemIds: string[]): Promise<string>;
  applyInvite(): Promise<void>;
  /** Runs fn on a fresh session as a Supabase role, optionally as an auth user. */
  asRole<T>(
    role: 'anon' | 'authenticated' | 'service_role',
    authUserId: string | null,
    fn: (client: Client) => Promise<T>,
  ): Promise<T>;
}

let sequence = 0;

export async function startHaulFixture(
  options: { applyInvite?: boolean } = {},
): Promise<HaulFixture> {
  const applyInvite = options.applyInvite ?? true;

  const cluster = await startLocalCluster({
    onReady: async (client) => {
      await applySqlFile(client, HAUL_BASELINE_SCHEMA);
      for (const file of HAUL_PRIOR_MIGRATIONS) await applySqlFile(client, file);
      if (applyInvite) await applySqlFile(client, INVITE_MIGRATION);
    },
  });

  const sql = async <T = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ): Promise<T[]> => {
    const result = await cluster.pool.query(text, values);
    return result.rows as T[];
  };

  const uniqueEmail = (prefix: string) =>
    `${prefix}-${Date.now().toString(36)}-${(sequence += 1)}@local.invalid`;

  const linkedPerson: HaulFixture['linkedPerson'] = async (email) => {
    const address = email ?? uniqueEmail('linked');
    const rows = await sql<{ person_id: string; auth_user_id: string }>(
      `WITH u AS (
         INSERT INTO auth.users (email) VALUES ($1) RETURNING id
       )
       INSERT INTO public.people (email, status, auth_user_id)
       SELECT $1, 'active_user', u.id FROM u
       RETURNING id AS person_id, auth_user_id`,
      [address],
    );
    return {
      personId: rows[0].person_id,
      authUserId: rows[0].auth_user_id,
      email: address,
    };
  };

  const unlinkedPerson: HaulFixture['unlinkedPerson'] = async (email) => {
    const address = email ?? uniqueEmail('unlinked');
    const rows = await sql<{ id: string }>(
      `INSERT INTO public.people (email) VALUES ($1) RETURNING id`,
      [address],
    );
    return { personId: rows[0].id, authUserId: null, email: address };
  };

  const linkPerson: HaulFixture['linkPerson'] = async (personId) => {
    const rows = await sql<{ id: string }>(
      `INSERT INTO auth.users (email)
       SELECT email FROM public.people WHERE id = $1
       RETURNING id`,
      [personId],
    );
    await sql(`UPDATE public.people SET auth_user_id = $2 WHERE id = $1`, [
      personId,
      rows[0].id,
    ]);
    return rows[0].id;
  };

  const listWithItems: HaulFixture['listWithItems'] = async (
    personId,
    itemNames = ['Oats'],
  ) => {
    const [list] = await sql<{ id: string }>(
      `INSERT INTO public.generated_grocery_lists (person_id, title)
       VALUES ($1, 'Weekly') RETURNING id`,
      [personId],
    );
    const itemIds: string[] = [];
    for (const name of itemNames) {
      const [item] = await sql<{ id: string }>(
        `INSERT INTO public.grocery_items (person_id, grocery_list_id, name, quantity, unit)
         VALUES ($1, $2, $3, 2, 'ct') RETURNING id`,
        [personId, list.id, name],
      );
      itemIds.push(item.id);
    }
    return { listId: list.id, itemIds };
  };

  const haulFromList: HaulFixture['haulFromList'] = async (personId, listId, itemIds) => {
    const [haul] = await sql<{ id: string }>(
      `INSERT INTO public.grocery_hauls (person_id, source_grocery_list_id, shopping_date, status)
       VALUES ($1, $2, CURRENT_DATE + 3, 'planned') RETURNING id`,
      [personId, listId],
    );
    await sql(
      `INSERT INTO public.grocery_haul_source_lists (haul_id, grocery_list_id, person_id)
       VALUES ($1, $2, $3)`,
      [haul.id, listId, personId],
    );
    for (const itemId of itemIds) {
      await sql(
        `INSERT INTO public.grocery_haul_items (
           haul_id, person_id, source_grocery_list_id, grocery_item_id,
           name_snapshot, quantity_snapshot, unit_snapshot,
           source_status_snapshot, final_quantity
         )
         SELECT $1, gi.person_id, gi.grocery_list_id, gi.id,
                gi.name, gi.quantity, gi.unit, gi.status, COALESCE(gi.quantity, 1)
         FROM public.grocery_items gi WHERE gi.id = $2`,
        [haul.id, itemId],
      );
    }
    return haul.id;
  };

  const asRole: HaulFixture['asRole'] = async (role, authUserId, fn) => {
    const client = await cluster.connect();
    try {
      await client.query(`SET ROLE ${role}`);
      if (authUserId) {
        await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [
          authUserId,
        ]);
      }
      return await fn(client);
    } finally {
      await client.end();
    }
  };

  return {
    ...cluster,
    sql,
    linkedPerson,
    unlinkedPerson,
    linkPerson,
    listWithItems,
    haulFromList,
    applyInvite: async () => {
      const client = await cluster.connect();
      try {
        await applySqlFile(client, INVITE_MIGRATION);
      } finally {
        await client.end();
      }
    },
    asRole,
  };
}
