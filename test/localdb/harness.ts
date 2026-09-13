/**
 * Boots a guarded disposable local cluster with the NDS schema applied, for use
 * by the real-database integration tests.
 *
 * The migration files applied here are the same files an operator would run.
 * Rehearsing the real artifacts is the point: a test that applies a
 * purpose-built test schema proves nothing about the migration.
 */

import fs from 'fs';
import path from 'path';

import type { Client } from 'pg';

import { startLocalCluster, type LocalCluster } from './localPostgres';

const REPO_ROOT = process.cwd();

export const BASELINE_SCHEMA = path.join(REPO_ROOT, 'test', 'localdb', 'baselineSchema.sql');

/** Expand-phase migrations, in operator order. */
export const EXPAND_MIGRATIONS = [
  path.join(REPO_ROOT, 'scripts', 'sql', 'ndsIntegrityV1_01_dayRevisions.sql'),
  path.join(REPO_ROOT, 'scripts', 'sql', 'ndsIntegrityV1_02_resolverAndWorker.sql'),
  path.join(REPO_ROOT, 'scripts', 'sql', 'ndsIntegrityV1_05_identityAndGrants.sql'),
];

/** Expand-safe legacy transfer tooling. Runs before the destructive contract. */
export const CUTOVER_MIGRATION = path.join(
  REPO_ROOT,
  'scripts',
  'sql',
  'ndsIntegrityV1_03_legacyCutover.sql',
);

export const CONTRACT_MIGRATION = path.join(
  REPO_ROOT,
  'scripts',
  'sql',
  'ndsIntegrityV1_04_contract.sql',
);

export const ROLLBACK_MIGRATION = path.join(
  REPO_ROOT,
  'scripts',
  'sql',
  'ndsIntegrityV1_99_rollback.sql',
);

/**
 * Applies a .sql file as one script.
 *
 * node-pg sends a multi-statement string as a simple query, which PostgreSQL
 * runs in a single implicit transaction. That is what an operator pasting the
 * file gets, so a mid-file failure leaves nothing half-applied.
 */
export async function applySqlFile(client: Client, filePath: string): Promise<void> {
  const sql = fs.readFileSync(filePath, 'utf8');
  try {
    await client.query(sql);
  } catch (error) {
    throw new Error(
      `Applying ${path.basename(filePath)} failed: ${(error as Error).message}`,
    );
  }
}

export interface NdsFixtureOptions {
  /** Defaults to baseline + both expand steps. */
  migrations?: string[];
  applyBaseline?: boolean;
}

export interface NdsFixture extends LocalCluster {
  /** Inserts an auth user and a person, returning the person id. */
  createPerson(options?: { timeZone?: string | null }): Promise<{
    personId: string;
    authUserId: string;
  }>;
  sql<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<T[]>;
}

export async function startNdsFixture(options: NdsFixtureOptions = {}): Promise<NdsFixture> {
  const migrations = options.migrations ?? EXPAND_MIGRATIONS;
  const applyBaseline = options.applyBaseline ?? true;

  const cluster = await startLocalCluster({
    onReady: async (client) => {
      if (applyBaseline) await applySqlFile(client, BASELINE_SCHEMA);
      for (const file of migrations) await applySqlFile(client, file);
    },
  });

  const sql = async <T = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ): Promise<T[]> => {
    const result = await cluster.pool.query(text, values);
    return result.rows as T[];
  };

  const createPerson: NdsFixture['createPerson'] = async (personOptions = {}) => {
    const rows = await sql<{ person_id: string; auth_user_id: string }>(
      `WITH u AS (
         INSERT INTO auth.users (email) VALUES ('fixture-' || gen_random_uuid() || '@local.invalid')
         RETURNING id
       )
       INSERT INTO public.people (auth_user_id, full_name)
       SELECT u.id, 'Local Fixture Subject' FROM u
       RETURNING id AS person_id, auth_user_id`,
    );
    const created = rows[0];
    if (personOptions.timeZone !== undefined) {
      await sql('UPDATE public.people SET consumed_time_zone = $2 WHERE id = $1', [
        created.person_id,
        personOptions.timeZone,
      ]);
    }
    return { personId: created.person_id, authUserId: created.auth_user_id };
  };

  return { ...cluster, sql, createPerson };
}
