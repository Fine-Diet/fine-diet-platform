/**
 * Lifecycle for a disposable, run-owned local PostgreSQL cluster.
 *
 * Every cluster this module creates is: started from binaries pinned in
 * devDependencies, given a freshly generated run id, placed in a private
 * directory owned by this user, and reachable ONLY through a unix socket in that
 * directory. `listen_addresses` is empty, so the cluster has no TCP listener and
 * cannot be reached from off-host by any route.
 *
 * The server is spawned with a constructed environment rather than an inherited
 * one. `.env.local`, shell PG* variables, Supabase configuration and proxy
 * settings are all absent by construction, not by convention.
 */

import { execFile, spawn, type ChildProcess } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

import { Client, Pool } from 'pg';

import {
  assertGuardedLocalTarget,
  RUN_MARKER_FILENAME,
  type GuardOutcome,
  type LocalTargetDescriptor,
  type RunMarker,
} from './localTargetGuard';

const execFileAsync = promisify(execFile);

/** Pinned binaries from @embedded-postgres/darwin-arm64 (a devDependency). */
const BIN_DIR = path.join(
  process.cwd(),
  'node_modules',
  '@embedded-postgres',
  'darwin-arm64',
  'native',
  'bin',
);

/**
 * `/tmp` is a symlink on macOS, so the realpath is used directly. The guard
 * rejects symlink indirection, and resolving here keeps that check meaningful
 * instead of merely satisfiable.
 */
function runRoot(runId: string): string {
  return path.join(fs.realpathSync('/tmp'), runId);
}

export interface LocalCluster {
  descriptor: LocalTargetDescriptor;
  guard: GuardOutcome;
  pool: Pool;
  serverLogPath: string;
  postgresVersion: string;
  /** Opens an additional independent session; required for real concurrency tests. */
  connect(user?: string): Promise<Client>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
}

export const OWNER_ROLE = 'nds01a_owner';

/**
 * Environment for the server and for client tooling.
 *
 * Built from nothing: only the variables PostgreSQL genuinely needs. Anything
 * that could redirect a connection or leak a credential is simply not present.
 */
function cleanEnvironment(): Record<string, string> {
  return {
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    HOME: process.env.HOME ?? '',
    LANG: 'C',
    LC_ALL: 'C',
    TZ: 'UTC',
  };
}

async function waitForSocket(socketPath: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (fs.lstatSync(socketPath).isSocket()) return;
    } catch {
      // not yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local PostgreSQL socket did not appear within ${timeoutMs}ms: ${socketPath}`);
}

function readPostmasterPid(dataDirectory: string): number {
  const raw = fs.readFileSync(path.join(dataDirectory, 'postmaster.pid'), 'utf8');
  return Number(raw.split('\n')[0]);
}

export interface StartLocalClusterOptions {
  /** Applied after the guard passes. Receives an owner-role client. */
  onReady?: (client: Client) => Promise<void>;
}

export async function startLocalCluster(
  options: StartLocalClusterOptions = {},
): Promise<LocalCluster> {
  if (!fs.existsSync(path.join(BIN_DIR, 'postgres'))) {
    throw new Error(
      `Pinned PostgreSQL binaries are missing at ${BIN_DIR}. ` +
        'Install devDependencies before running local database verification.',
    );
  }

  const runId = `nds01a_${crypto.randomBytes(8).toString('hex')}`;
  const root = runRoot(runId);
  const dataDirectory = path.join(root, 'data');
  const socketDirectory = path.join(root, 'sock');
  const database = `${runId}_db`;
  const markerPath = path.join(dataDirectory, RUN_MARKER_FILENAME);
  const serverLogPath = path.join(root, 'server.log');
  const passwordPath = path.join(root, 'ownerpw');
  const password = crypto.randomBytes(24).toString('hex');

  fs.mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  fs.mkdirSync(socketDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(root, 0o700);
  fs.chmodSync(dataDirectory, 0o700);
  fs.chmodSync(socketDirectory, 0o700);
  fs.writeFileSync(passwordPath, password, { mode: 0o600 });

  const versionResult = await execFileAsync(path.join(BIN_DIR, 'postgres'), ['--version'], {
    env: cleanEnvironment(),
  });
  const postgresVersion = versionResult.stdout.trim();

  // --auth-host=reject is belt-and-braces: there is no TCP listener to reach.
  await execFileAsync(
    path.join(BIN_DIR, 'initdb'),
    [
      '-D',
      dataDirectory,
      '-U',
      OWNER_ROLE,
      '--auth-local=scram-sha-256',
      '--auth-host=reject',
      `--pwfile=${passwordPath}`,
      '-E',
      'UTF8',
    ],
    { env: cleanEnvironment() },
  );

  const marker: RunMarker = {
    runId,
    packetId: 'FD-PLATFORM-NDS-01A',
    createdAtIso: new Date().toISOString(),
    createdByPid: process.pid,
    dataDirectory,
    socketDirectory,
    database,
    disposable: true,
  };
  fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2), { mode: 0o600 });

  const logStream = fs.openSync(serverLogPath, 'a');
  const child: ChildProcess = spawn(
    path.join(BIN_DIR, 'postgres'),
    [
      '-D',
      dataDirectory,
      '-k',
      socketDirectory,
      // No TCP listener at all.
      '-c',
      'listen_addresses=',
      '-c',
      'logging_collector=off',
      // Deterministic barriers in concurrency tests must not be defeated by a
      // lock wait that gives up.
      '-c',
      'deadlock_timeout=200ms',
      '-c',
      'fsync=off',
      '-c',
      'full_page_writes=off',
      '-c',
      'max_connections=60',
      // Removes the recompute coalescing delay for this disposable cluster only.
      // Set on the server so EVERY session inherits it, including pool clients
      // that connected before any migration ran; a per-database or per-session
      // setting would apply unevenly and make claim timing look flaky.
      '-c',
      'nds.request_debounce_ms=0',
    ],
    { env: cleanEnvironment(), stdio: ['ignore', logStream, logStream], detached: false },
  );
  child.unref();

  await waitForSocket(path.join(socketDirectory, '.s.PGSQL.5432'), 30_000);
  const postmasterPid = readPostmasterPid(dataDirectory);

  const descriptor: LocalTargetDescriptor = {
    runId,
    host: socketDirectory,
    database,
    user: OWNER_ROLE,
    dataDirectory,
    markerPath,
    postmasterPid,
  };

  /**
   * A cluster must never outlive a failed startup. Without this, a rejected
   * guard leaves an orphaned server holding its data directory, and the next run
   * inherits an unknown local database — precisely what the guard exists to
   * prevent.
   */
  const abandon = async (): Promise<void> => {
    await execFileAsync(
      path.join(BIN_DIR, 'pg_ctl'),
      ['-D', dataDirectory, '-m', 'immediate', 'stop'],
      { env: cleanEnvironment() },
    ).catch(() => undefined);
    if (root.includes(runId)) fs.rmSync(root, { recursive: true, force: true });
  };

  let pool: Pool;
  let guard: GuardOutcome;
  try {
    // The run database does not exist yet, so this one connection targets the
    // cluster default and is guarded in the bootstrap phase.
    const bootstrap = new Client({
      host: socketDirectory,
      user: OWNER_ROLE,
      password,
      database: 'postgres',
    });
    await bootstrap.connect();
    try {
      await assertGuardedLocalTarget(bootstrap, {
        ...descriptor,
        database: 'postgres',
        phase: 'bootstrap',
      });
      await bootstrap.query(`CREATE DATABASE "${database}"`);
    } finally {
      await bootstrap.end();
    }

    pool = new Pool({ host: socketDirectory, user: OWNER_ROLE, password, database, max: 20 });
    const guardClient = await pool.connect();
    try {
      guard = await assertGuardedLocalTarget(guardClient as unknown as Client, descriptor);
    } finally {
      guardClient.release();
    }
  } catch (error) {
    await abandon();
    throw error;
  }

  const connect = async (user: string = OWNER_ROLE): Promise<Client> => {
    const client = new Client({ host: socketDirectory, user, password, database });
    await client.connect();
    return client;
  };

  if (options.onReady) {
    try {
      const ready = await connect();
      try {
        await options.onReady(ready);
      } finally {
        await ready.end();
      }
    } catch (error) {
      await pool.end().catch(() => undefined);
      await abandon();
      throw error;
    }
  }

  const stop = async (): Promise<void> => {
    await pool.end().catch(() => undefined);
    // Re-verify identity before signalling: cleanup must never target a process
    // that is no longer the one this run started.
    let stillOurs = false;
    try {
      const pidNow = readPostmasterPid(dataDirectory);
      stillOurs = pidNow === postmasterPid;
    } catch {
      stillOurs = false;
    }
    if (!stillOurs) return;
    await execFileAsync(path.join(BIN_DIR, 'pg_ctl'), ['-D', dataDirectory, '-m', 'immediate', 'stop'], {
      env: cleanEnvironment(),
    }).catch(() => undefined);
  };

  const destroy = async (): Promise<void> => {
    await stop();
    // Only a directory carrying this run's generated id is ever removed.
    if (!root.includes(runId) || !fs.existsSync(markerPath)) return;
    const onDisk = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as RunMarker;
    if (onDisk.runId !== runId || onDisk.disposable !== true) return;
    fs.rmSync(root, { recursive: true, force: true });
  };

  return { descriptor, guard, pool, serverLogPath, postgresVersion, connect, stop, destroy };
}
