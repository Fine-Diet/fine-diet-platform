/**
 * Fail-closed guard proving a database connection targets THIS RUN's own
 * disposable local PostgreSQL and nothing else.
 *
 * NDS-01A permits database reads and writes only against run-owned disposable
 * local fixtures. `localhost` is not evidence of that: it can be an SSH tunnel,
 * a port forward, or another developer's database. Every check below must pass
 * before any migration, fixture write, test, or cleanup touches a connection.
 *
 * The guard is deliberately structured so that the ONLY way to reach a database
 * is through a run manifest this process wrote itself. There is no code path
 * that accepts a connection string from the environment or from a caller.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import type { Client } from 'pg';

/** Environment variables that must never influence a guarded local connection. */
export const FORBIDDEN_CONNECTION_ENV = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_URL_NON_POOLING',
  'POSTGRES_PRISMA_URL',
  'PGHOST',
  'PGPORT',
  'PGUSER',
  'PGPASSWORD',
  'PGDATABASE',
  'PGSERVICE',
  'PGSERVICEFILE',
  'SUPABASE_DB_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const;

/**
 * The identity of a run-owned local cluster.
 *
 * `host` is an absolute directory path, never a hostname. A unix socket
 * directory cannot be a tunnel to a remote host, which is what makes this the
 * strongest available isolation primitive.
 */
export interface LocalTargetDescriptor {
  runId: string;
  host: string;
  database: string;
  user: string;
  dataDirectory: string;
  markerPath: string;
  postmasterPid: number;
  /**
   * `bootstrap` is the single connection used to CREATE the run database, so it
   * necessarily targets the cluster's default database. Only the two checks that
   * are about the run database itself are relaxed; every ownership, socket,
   * process and environment check still applies.
   */
  phase?: 'bootstrap' | 'run';
}

export interface GuardCheck {
  id: string;
  passed: boolean;
  detail: string;
}

export interface GuardOutcome {
  ok: boolean;
  runId: string;
  checks: GuardCheck[];
}

export class LocalTargetGuardError extends Error {
  readonly outcome: GuardOutcome;

  constructor(outcome: GuardOutcome) {
    const failed = outcome.checks.filter((check) => !check.passed);
    super(
      `Local target guard REFUSED the connection (${failed.length} failed check(s)): ` +
        failed.map((check) => `${check.id}: ${check.detail}`).join('; '),
    );
    this.name = 'LocalTargetGuardError';
    this.outcome = outcome;
  }
}

/** Marker written into the data directory at initdb time. */
export interface RunMarker {
  runId: string;
  packetId: string;
  createdAtIso: string;
  createdByPid: number;
  dataDirectory: string;
  socketDirectory: string;
  database: string;
  disposable: true;
}

export const RUN_MARKER_FILENAME = 'NDS01A_RUN_MARKER.json';

/** A run id is generated, never supplied, so it cannot be steered at a real database. */
export function isWellFormedRunId(runId: string): boolean {
  return /^nds01a_[0-9a-f]{16}$/.test(runId);
}

function check(id: string, passed: boolean, detail: string): GuardCheck {
  return { id, passed, detail };
}

/**
 * Filesystem and process checks. Runs before a socket is opened, so a
 * misdirected descriptor never produces a connection at all.
 */
export function inspectLocalTarget(descriptor: LocalTargetDescriptor): GuardOutcome {
  const checks: GuardCheck[] = [];
  const isBootstrap = descriptor.phase === 'bootstrap';

  checks.push(
    check(
      'run_id_generated_shape',
      isWellFormedRunId(descriptor.runId),
      `runId=${descriptor.runId}`,
    ),
  );

  // A hostname here would permit DNS resolution to anywhere. Only an absolute
  // path to a socket directory is accepted.
  const hostIsAbsolutePath = path.isAbsolute(descriptor.host);
  checks.push(
    check(
      'host_is_unix_socket_directory_not_hostname',
      hostIsAbsolutePath && !descriptor.host.includes(':'),
      `host=${descriptor.host}`,
    ),
  );

  const socketPath = path.join(descriptor.host, '.s.PGSQL.5432');
  let socketIsSocket = false;
  try {
    socketIsSocket = fs.lstatSync(socketPath).isSocket();
  } catch {
    socketIsSocket = false;
  }
  checks.push(check('socket_file_present', socketIsSocket, `socket=${socketPath}`));

  // A symlink anywhere in either path would let the proven identity differ from
  // the connected one.
  let hostRealpathMatches = false;
  let dataRealpathMatches = false;
  try {
    hostRealpathMatches = fs.realpathSync(descriptor.host) === descriptor.host;
  } catch {
    hostRealpathMatches = false;
  }
  try {
    dataRealpathMatches = fs.realpathSync(descriptor.dataDirectory) === descriptor.dataDirectory;
  } catch {
    dataRealpathMatches = false;
  }
  checks.push(
    check(
      'no_symlink_indirection',
      hostRealpathMatches && dataRealpathMatches,
      `hostReal=${hostRealpathMatches} dataReal=${dataRealpathMatches}`,
    ),
  );

  checks.push(
    check(
      'paths_carry_run_id',
      descriptor.dataDirectory.includes(descriptor.runId) &&
        descriptor.host.includes(descriptor.runId),
      `dataDirectory=${descriptor.dataDirectory}`,
    ),
  );

  checks.push(
    check(
      'database_name_carries_run_id',
      isBootstrap || descriptor.database.includes(descriptor.runId),
      isBootstrap
        ? `bootstrap phase: cluster default database=${descriptor.database}`
        : `database=${descriptor.database}`,
    ),
  );

  let ownedByThisUser = false;
  let modeIsPrivate = false;
  try {
    const stat = fs.statSync(descriptor.dataDirectory);
    ownedByThisUser = stat.uid === os.userInfo().uid;
    modeIsPrivate = (stat.mode & 0o077) === 0;
  } catch {
    ownedByThisUser = false;
  }
  checks.push(
    check(
      'data_directory_owned_by_this_user',
      ownedByThisUser,
      `uid=${os.userInfo().uid} owned=${ownedByThisUser}`,
    ),
  );
  checks.push(
    check('data_directory_not_group_or_world_accessible', modeIsPrivate, `private=${modeIsPrivate}`),
  );

  let marker: RunMarker | null = null;
  try {
    marker = JSON.parse(fs.readFileSync(descriptor.markerPath, 'utf8')) as RunMarker;
  } catch {
    marker = null;
  }
  const markerAgrees =
    marker !== null &&
    marker.runId === descriptor.runId &&
    marker.disposable === true &&
    marker.dataDirectory === descriptor.dataDirectory &&
    marker.socketDirectory === descriptor.host &&
    (isBootstrap || marker.database === descriptor.database);
  checks.push(
    check(
      'run_marker_agrees_with_descriptor',
      markerAgrees,
      marker === null ? 'marker unreadable' : `marker runId=${marker.runId}`,
    ),
  );

  // An unknown pre-existing cluster in the same directory would have a
  // postmaster we did not start.
  let pidFileMatches = false;
  let pidFileDataDir = '';
  try {
    const lines = fs.readFileSync(path.join(descriptor.dataDirectory, 'postmaster.pid'), 'utf8')
      .split('\n');
    pidFileDataDir = (lines[1] ?? '').trim();
    pidFileMatches =
      Number(lines[0]) === descriptor.postmasterPid && pidFileDataDir === descriptor.dataDirectory;
  } catch {
    pidFileMatches = false;
  }
  checks.push(
    check(
      'postmaster_pid_file_is_ours',
      pidFileMatches,
      `expectedPid=${descriptor.postmasterPid} pidFileDataDir=${pidFileDataDir}`,
    ),
  );

  let processIsOurPostgres = false;
  let processCommand = '';
  try {
    processCommand = execFileSync('ps', ['-o', 'command=', '-p', String(descriptor.postmasterPid)], {
      encoding: 'utf8',
    }).trim();
    processIsOurPostgres =
      processCommand.includes('postgres') && processCommand.includes(descriptor.dataDirectory);
  } catch {
    processIsOurPostgres = false;
  }
  checks.push(
    check('live_process_is_our_postgres', processIsOurPostgres, `command=${processCommand}`),
  );

  const leakedEnv = FORBIDDEN_CONNECTION_ENV.filter((name) => {
    const value = process.env[name];
    return typeof value === 'string' && value.length > 0;
  });
  checks.push(
    check(
      'no_inherited_database_credentials_in_env',
      leakedEnv.length === 0,
      leakedEnv.length === 0 ? 'clean' : `present=${leakedEnv.join(',')}`,
    ),
  );

  return {
    ok: checks.every((entry) => entry.passed),
    runId: descriptor.runId,
    checks,
  };
}

/**
 * Server-side identity checks, asked of the connection itself.
 *
 * The filesystem checks prove what we intended to start; these prove what we
 * actually reached. Both are required: a correct data directory on disk says
 * nothing about which server answered.
 */
export async function inspectConnectedServer(
  client: Client,
  descriptor: LocalTargetDescriptor,
): Promise<GuardOutcome> {
  const checks: GuardCheck[] = [];

  const result = await client.query<{
    datadir: string;
    db: string;
    listen_addresses: string;
    server_addr: string | null;
    port: number;
    is_super: boolean;
  }>(
    `select current_setting('data_directory') as datadir,
            current_database() as db,
            current_setting('listen_addresses') as listen_addresses,
            inet_server_addr()::text as server_addr,
            inet_server_port() as port,
            usesuper as is_super
       from pg_user where usename = current_user`,
  );
  const row = result.rows[0];

  checks.push(
    check(
      'connected_server_data_directory_matches',
      row.datadir === descriptor.dataDirectory,
      `reported=${row.datadir}`,
    ),
  );
  checks.push(
    check('connected_database_matches', row.db === descriptor.database, `reported=${row.db}`),
  );

  // Empty listen_addresses means the cluster has no TCP listener at all, so it
  // cannot be reached from off-host by any route.
  checks.push(
    check(
      'server_has_no_tcp_listener',
      row.listen_addresses.trim() === '',
      `listen_addresses='${row.listen_addresses}'`,
    ),
  );
  checks.push(
    check(
      'connection_is_unix_socket',
      row.server_addr === null,
      `server_addr=${String(row.server_addr)}`,
    ),
  );

  return { ok: checks.every((entry) => entry.passed), runId: descriptor.runId, checks };
}

/** Throws unless every filesystem/process and server-side check passes. */
export async function assertGuardedLocalTarget(
  client: Client,
  descriptor: LocalTargetDescriptor,
): Promise<GuardOutcome> {
  const local = inspectLocalTarget(descriptor);
  if (!local.ok) throw new LocalTargetGuardError(local);

  const server = await inspectConnectedServer(client, descriptor);
  const combined: GuardOutcome = {
    ok: local.ok && server.ok,
    runId: descriptor.runId,
    checks: [...local.checks, ...server.checks],
  };
  if (!combined.ok) throw new LocalTargetGuardError(combined);
  return combined;
}
