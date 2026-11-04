#!/usr/bin/env node
import { chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PARENT_REF = 'tssvlflebugqhtogqdfs';
const BLOCKED_REFS = new Set([
  PARENT_REF,
  'ikvkqpbwlpevqlshdkdz',
  'ymdhsvuaixiwhlioiree',
  'slsmfdxxqktkgplliwhx',
]);
const API_ROOT = 'https://api.supabase.com/v1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RUNNER = path.join(ROOT, 'test/hosted/runProgramContentRlsHosted.mjs');
const RUN_NAME_PREFIX = 'fine-diet-pr225-rls-';
const DEFAULT_LOCK_PATH = path.join(os.tmpdir(), 'fine-diet-pr225-hosted-orchestrator.lock');
const DEFAULT_RECOVERY_DIR = path.join(os.tmpdir(), 'fine-diet-pr225-recovery');
let interruptedSignal = null;
let activeChild = null;
const interruptWaiters = new Set();

function handleInterrupt(signal) {
  interruptedSignal ||= signal;
  process.exitCode = signal === 'SIGINT' ? 130 : 143;
  if (activeChild && !activeChild.killed) activeChild.kill(signal);
  for (const reject of interruptWaiters) reject(new Error(`Interrupted (${signal})`));
}

function assertNotInterrupted() {
  if (interruptedSignal) throw new Error(`Interrupted (${interruptedSignal})`);
}

async function acquireExclusiveLock(lockPath) {
  const owner = {
    pid: process.pid,
    hostname: os.hostname(),
    startedAt: new Date().toISOString(),
    nonce: randomUUID(),
  };
  try {
    await mkdir(lockPath, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw new Error('Could not acquire the private PR #225 orchestration lock');
    let lockStats;
    let ownerStats;
    try {
      lockStats = await lstat(lockPath);
      ownerStats = await lstat(path.join(lockPath, 'owner.json'));
    } catch {
      throw new Error('PR #225 orchestration lock is stale or unverifiable; inspect it manually and do not remove it automatically');
    }
    const uid = typeof process.getuid === 'function' ? process.getuid() : null;
    if (
      !lockStats.isDirectory() || lockStats.isSymbolicLink() || !ownerStats.isFile() || ownerStats.isSymbolicLink() ||
      (lockStats.mode & 0o077) !== 0 || (ownerStats.mode & 0o077) !== 0 ||
      (uid !== null && (lockStats.uid !== uid || ownerStats.uid !== uid))
    ) throw new Error('PR #225 orchestration lock permissions or ownership are unsafe; refusing automatic recovery');
    let existing;
    try {
      existing = JSON.parse(await readFile(path.join(lockPath, 'owner.json'), 'utf8'));
    } catch {
      throw new Error('PR #225 orchestration lock is stale or unverifiable; inspect it manually and do not remove it automatically');
    }
    if (
      existing?.hostname !== os.hostname() || !Number.isInteger(existing?.pid) || existing.pid <= 0 ||
      typeof existing?.nonce !== 'string'
    ) throw new Error('PR #225 orchestration lock owner is unverifiable; refusing concurrent provisioning');
    try { process.kill(existing.pid, 0); }
    catch (probeError) {
      if (probeError?.code === 'ESRCH') {
        throw new Error('A stale PR #225 orchestration lock remains; verify its branch recovery record, then remove the lock manually');
      }
      throw new Error('PR #225 orchestration lock may still be active; refusing to remove it');
    }
    throw new Error('Another PR #225 hosted orchestration is already active');
  }

  try {
    const handle = await open(path.join(lockPath, 'owner.json'), 'wx', 0o600);
    try { await handle.writeFile(`${JSON.stringify(owner)}\n`); }
    finally { await handle.close(); }
    await chmod(path.join(lockPath, 'owner.json'), 0o600);
  } catch {
    await rm(lockPath, { recursive: true, force: true }).catch(() => {});
    throw new Error('Could not write the private PR #225 orchestration lock owner record');
  }

  return async () => {
    let current;
    try { current = JSON.parse(await readFile(path.join(lockPath, 'owner.json'), 'utf8')); }
    catch { throw new Error('PR #225 orchestration lock owner record disappeared before release'); }
    if (current?.nonce !== owner.nonce || current?.pid !== owner.pid || current?.hostname !== owner.hostname) {
      throw new Error('PR #225 orchestration lock ownership changed; refusing to remove another owner’s lock');
    }
    await rm(lockPath, { recursive: true });
  };
}

function branchesFrom(payload) {
  const branches = Array.isArray(payload) ? payload : payload?.branches;
  if (!Array.isArray(branches)) throw new Error('Unexpected branch inventory response');
  return branches;
}

function assertSafeRef(ref) {
  if (typeof ref !== 'string' || !/^[a-z0-9]{20}$/.test(ref) || BLOCKED_REFS.has(ref)) {
    throw new Error('Management API returned a protected or invalid branch reference');
  }
}

function assertRunName(name) {
  if (typeof name !== 'string' || !/^fine-diet-pr225-rls-[0-9]{8}t[0-9]{6}z$/.test(name)) {
    throw new Error('Invalid PR #225 temporary branch name');
  }
}

export function identifyUniqueBranch(branches, { name, ref = null, parentRef = PARENT_REF }) {
  const matches = branches.filter((branch) => branch?.name === name && branch?.parent_project_ref === parentRef);
  if (matches.length !== 1) throw new Error('Exact branch name and parent do not identify one branch');
  const branch = matches[0];
  assertSafeRef(branch.project_ref);
  if (ref && branch.project_ref !== ref) throw new Error('Branch reference differs from the recorded reference');
  return branch;
}

export function assertDisposableBranch(branch, { name, ref = null, parentRef = PARENT_REF }) {
  if (
    branch?.name !== name || branch?.project_ref !== ref || branch?.parent_project_ref !== parentRef ||
    branch?.is_default !== false || branch?.persistent !== false || branch?.with_data !== false
  ) throw new Error('Branch identity or disposable zero-data attributes did not match');
  assertSafeRef(branch.project_ref);
  return true;
}

function assertRecoverableBranch(branch, { name, ref = null, parentRef = PARENT_REF }) {
  if (
    branch?.name !== name || branch?.parent_project_ref !== parentRef ||
    (ref && branch?.project_ref !== ref) || branch?.is_default !== false
  ) throw new Error('Recovery target is not the exact nondefault child branch');
  assertSafeRef(branch.project_ref);
  return true;
}

export function classifyMigrationReplay(branch, actionRuns) {
  const branchStatus = branch?.status;
  if (branchStatus === 'MIGRATIONS_FAILED' || branchStatus === 'FUNCTIONS_FAILED') {
    throw new Error(`Branch migration workflow ended in ${branchStatus}`);
  }
  const waitingStatuses = new Set(['CREATING_PROJECT', 'RUNNING_MIGRATIONS']);
  const successfulTerminalStatuses = new Set(['MIGRATIONS_PASSED', 'FUNCTIONS_DEPLOYED', 'ACTIVE_HEALTHY']);
  if (!waitingStatuses.has(branchStatus) && !successfulTerminalStatuses.has(branchStatus)) {
    throw new Error(`Unrecognized terminal branch workflow status: ${String(branchStatus)}`);
  }
  if (typeof branch?.id !== 'string' || branch.id.length === 0) {
    if (waitingStatuses.has(branchStatus)) return { state: 'pending', reason: 'branch workflow identifiers are not ready yet' };
    throw new Error('Branch record lacks the identifiers required to verify its migration workflow');
  }
  if (!Array.isArray(actionRuns)) throw new Error('Action run inventory is not an array');
  const branchRuns = actionRuns.filter((run) => run?.branch_id === branch.id);
  let matchingRuns;
  if (branch.latest_check_run_id != null) {
    matchingRuns = branchRuns.filter((run) => String(run?.check_run_id) === String(branch.latest_check_run_id));
  } else {
    const orderedRuns = branchRuns.map((run) => ({
      run,
      createdAt: Date.parse(run?.created_at),
    }));
    if (orderedRuns.some(({ createdAt }) => !Number.isFinite(createdAt))) {
      if (orderedRuns.length === 0) return { state: 'pending', reason: 'latest action run is not visible yet' };
      throw new Error('Branch action runs lack timestamps needed to identify the latest run');
    }
    orderedRuns.sort((left, right) => right.createdAt - left.createdAt);
    if (orderedRuns.length > 1 && orderedRuns[0].createdAt === orderedRuns[1].createdAt) {
      throw new Error('Latest branch migration action run is ambiguous');
    }
    matchingRuns = orderedRuns.length ? [orderedRuns[0].run] : [];
  }
  if (matchingRuns.length > 1) throw new Error('Latest branch migration action run is ambiguous');
  if (matchingRuns.length === 0) return { state: 'pending', reason: 'latest action run is not visible yet' };
  const steps = matchingRuns[0]?.run_steps;
  if (!Array.isArray(steps)) throw new Error('Latest action run lacks workflow step statuses');
  const migrations = steps.filter((step) => step?.name === 'migrate');
  if (migrations.length > 1) throw new Error('Latest action run has duplicate migrate steps');
  if (migrations.length === 0) {
    if (waitingStatuses.has(branchStatus)) return { state: 'pending', reason: 'migrate step has not appeared yet' };
    throw new Error('Latest terminal action run does not contain a migrate step');
  }
  const migrationStatus = migrations[0].status;
  if (migrationStatus === 'DEAD' || migrationStatus === 'PAUSED') {
    throw new Error(`Migration replay step ended in ${migrationStatus}`);
  }
  if (migrationStatus === 'CREATED' || migrationStatus === 'RUNNING') {
    return { state: 'pending', reason: `migrate step is ${migrationStatus}` };
  }
  if (migrationStatus !== 'EXITED') {
    throw new Error(`Unrecognized migrate step status: ${String(migrationStatus)}`);
  }
  if (!successfulTerminalStatuses.has(branchStatus)) {
    return { state: 'pending', reason: `migration succeeded but branch status is ${String(branchStatus)}` };
  }
  if (typeof matchingRuns[0].id !== 'string' || matchingRuns[0].id.length === 0) {
    throw new Error('Latest migration action run lacks its identity');
  }
  return { state: 'passed', actionRunId: matchingRuns[0].id, checkRunId: matchingRuns[0].check_run_id };
}

function branchNameAt(date) {
  const iso = date.toISOString();
  return `${RUN_NAME_PREFIX}${iso.slice(0, 10).replaceAll('-', '')}t${iso.slice(11, 19).replaceAll(':', '')}z`;
}

async function runHostedBranchOrchestration({
  token,
  fetchImpl = fetch,
  runHosted,
  now = () => new Date(),
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onBranchRecorded = async () => {},
  onBranchIntent = async () => {},
  onCleanupUnresolved = () => {},
  timeoutMs = 10 * 60_000,
  reconcileTimeoutMs = 90_000,
}) {
  if (!token || !token.trim()) throw new Error('SUPABASE_ACCESS_TOKEN is required in the founder Terminal');
  if (typeof runHosted !== 'function') throw new Error('Hosted runner callback is required');

  async function api(method, route, body) {
    let response;
    try {
      response = await fetchImpl(`${API_ROOT}${route}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error(`Management API ${method} request failed (${route})`);
    }
    let payload = null;
    try { payload = await response.json(); } catch { /* response body is never logged */ }
    return { response, payload };
  }

  const inventory = async () => {
    const { response, payload } = await api('GET', `/projects/${PARENT_REF}/branches`);
    if (!response.ok) throw new Error(`Branch inventory preflight failed (HTTP ${response.status})`);
    return branchesFrom(payload);
  };

  const actionRuns = async () => {
    const runs = [];
    const limit = 100;
    for (let offset = 0; ; offset += limit) {
      const { response, payload } = await api('GET', `/projects/${PARENT_REF}/actions?limit=${limit}&offset=${offset}`);
      if (!response.ok) throw new Error(`Action Runs preflight failed (HTTP ${response.status})`);
      if (!Array.isArray(payload) || payload.some((run) =>
        !run || typeof run !== 'object' || Array.isArray(run) ||
        typeof run.id !== 'string' || typeof run.branch_id !== 'string' || !Array.isArray(run.run_steps) ||
        run.run_steps.some((step) => !step || typeof step !== 'object' || Array.isArray(step) ||
          typeof step.name !== 'string' || typeof step.status !== 'string')
      )) throw new Error('Unexpected Action Runs response structure');
      runs.push(...payload);
      if (payload.length < limit) return runs;
    }
  };

  // Read-only preflight. No Project Settings endpoint or Settings permission is used.
  const before = await inventory();
  if (before.some((branch) => typeof branch?.name === 'string' && branch.name.startsWith(RUN_NAME_PREFIX))) {
    throw new Error('A PR #225 temporary branch already exists; recover and verify its deletion before provisioning another');
  }
  let name;
  const base = now();
  for (let offset = 0; offset < 3600; offset += 1) {
    name = branchNameAt(new Date(base.getTime() + offset * 1000));
    if (!before.some((branch) => branch?.name === name)) break;
    name = null;
  }
  if (!name) throw new Error('Could not find an unused timestamped branch name');
  assertRunName(name);
  await actionRuns();
  await onBranchIntent({ name, projectRef: null, parentRef: PARENT_REF });
  assertNotInterrupted();

  let branch = null;
  let cleanupArmed = false;
  let cleanupIssue = null;
  let responseFailure = null;
  let ambiguousCreate = false;
  let creationAbsentVerified = false;
  try {
    let response;
    let payload;
    try {
      ({ response, payload } = await api('POST', `/projects/${PARENT_REF}/branches`, {
        branch_name: name,
        persistent: false,
        with_data: false,
        desired_instance_size: 'micro',
      }));
    } catch {
      // A transport failure is ambiguous: the server may have created the branch.
      responseFailure = 'Branch creation response was ambiguous';
      ambiguousCreate = true;
    }

    // Record the returned project ref immediately on a successful create response.
    if (response?.ok) {
      ambiguousCreate = true;
      const created = payload?.project_ref ? payload : payload?.branch ?? payload?.data?.attributes;
      if (created?.name === name && created?.parent_project_ref === PARENT_REF && created?.project_ref) {
        assertSafeRef(created.project_ref);
        branch = { name, project_ref: created.project_ref, parent_project_ref: PARENT_REF, createdFromResponse: true };
        cleanupArmed = true;
        await onBranchRecorded({ name, projectRef: branch.project_ref, parentRef: PARENT_REF });
      }
    } else if (response) {
      responseFailure = `Branch creation returned HTTP ${response.status}`;
      ambiguousCreate = response.status >= 500 || response.status === 408 || response.status === 429;
    }

    // Reconcile successful-but-incomplete and ambiguous responses by the unique name + parent.
    if (!branch) {
      let reconciled;
      const reconcileDeadline = Date.now() + (ambiguousCreate ? reconcileTimeoutMs : 0);
      do {
        const current = await inventory();
        const matches = current.filter((item) => item?.name === name && item?.parent_project_ref === PARENT_REF);
        if (matches.length === 1) {
          reconciled = identifyUniqueBranch(current, { name });
          break;
        }
        if (matches.length > 1) throw new Error('Ambiguous branch inventory contains duplicate exact names');
        if (Date.now() >= reconcileDeadline) break;
        await wait(3000);
      } while (Date.now() <= reconcileDeadline);
      if (!reconciled && !ambiguousCreate) creationAbsentVerified = true;
      if (reconciled) {
        branch = { name, project_ref: reconciled.project_ref, parent_project_ref: PARENT_REF, observedInInventory: true };
        cleanupArmed = true;
        await onBranchRecorded({ name, projectRef: branch.project_ref, parentRef: PARENT_REF });
      }
    }

    if (!branch) throw new Error(responseFailure || 'Branch creation did not produce the requested branch');

    // Require the full independent inventory record before any database access.
    const readyDeadline = Date.now() + timeoutMs;
    let verified;
    let migrationEvidence;
    while (Date.now() < readyDeadline) {
      assertNotInterrupted();
      const current = await inventory();
      verified = identifyUniqueBranch(current, { name, ref: branch.project_ref });
      branch.observedInInventory = true;
      if (verified.status === 'MIGRATIONS_FAILED' || verified.status === 'FUNCTIONS_FAILED') {
        throw new Error(`Temporary branch workflow failed (${verified.status})`);
      }
      const { response: actionsResponse, payload: actionRuns } = await api('GET', `/projects/${PARENT_REF}/actions?limit=100`);
      if (!actionsResponse.ok) throw new Error(`Migration workflow status request failed (HTTP ${actionsResponse.status})`);
      migrationEvidence = classifyMigrationReplay(verified, actionRuns);
      if (verified.is_default === false && verified.persistent === false && verified.with_data === false &&
          verified.preview_project_status === 'ACTIVE_HEALTHY' && migrationEvidence.state === 'passed') break;
      if (verified.persistent === true || verified.with_data === true || verified.is_default === true) {
        throw new Error('Created branch violates the approved zero-data temporary branch contract');
      }
      verified = null;
      await wait(3000);
    }
    if (!verified) throw new Error('Temporary branch did not become ACTIVE_HEALTHY before timeout');
    assertDisposableBranch(verified, { name, ref: branch.project_ref });
    process.stdout.write(`Migration replay verified: latest migrate step EXITED (${migrationEvidence.actionRunId}); branch workflow ${verified.status}.\n`);

    assertNotInterrupted();
    const runnerResult = await runHosted({ name, projectRef: branch.project_ref, parentRef: PARENT_REF });
    await cleanupCreatedBranch({ branch, inventory, api, wait });
    cleanupArmed = false;
    await onBranchRecorded(null);
    return runnerResult;
  } catch (error) {
    const safeMessage = error?.message || 'Hosted verification failed';
    if (!branch && !ambiguousCreate) {
      try { await onBranchRecorded(null); } catch { /* no branch was confirmed */ }
    }
    if (!branch && ambiguousCreate) {
      cleanupIssue = 'No unique child was reconciled after the ambiguous create response; provisioning remains unresolved';
      onCleanupUnresolved({ name, projectRef: null, parentRef: PARENT_REF, error: cleanupIssue });
    }
    if (cleanupArmed && branch) {
      try {
        await cleanupCreatedBranch({ branch, api, inventory, wait });
        await onBranchRecorded(null);
      } catch (cleanupError) {
        cleanupIssue = cleanupError?.message || 'Branch cleanup could not be verified';
        onCleanupUnresolved({ name, projectRef: branch.project_ref, parentRef: PARENT_REF, error: cleanupIssue });
      }
    }
    const result = new Error(cleanupIssue
      ? `${safeMessage}; CLEANUP UNRESOLVED for ${name} (${branch?.project_ref || 'ref unavailable'}): ${cleanupIssue}`
      : safeMessage);
    result.branchName = name;
    result.branchRef = branch?.project_ref ?? null;
    result.cleanupVerified = (cleanupArmed && !cleanupIssue) || creationAbsentVerified;
    throw result;
  }
}

export async function createHostedBranchOrchestrator(options) {
  const lockPath = options?.lockPath || DEFAULT_LOCK_PATH;
  const releaseLock = await acquireExclusiveLock(lockPath);
  try {
    const recoveryDir = options?.recoveryDir || DEFAULT_RECOVERY_DIR;
    let recoveryEntries = [];
    try {
      let recoveryStats;
      try { recoveryStats = await lstat(recoveryDir); }
      catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        await mkdir(recoveryDir, { mode: 0o700 });
        recoveryStats = await lstat(recoveryDir);
      }
      const uid = typeof process.getuid === 'function' ? process.getuid() : null;
      if (!recoveryStats.isDirectory() || recoveryStats.isSymbolicLink() ||
        (recoveryStats.mode & 0o077) !== 0 || (uid !== null && recoveryStats.uid !== uid)) {
        throw new Error('PR #225 recovery directory permissions or ownership are unsafe; refusing provisioning');
      }
      recoveryEntries = await readdir(recoveryDir);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    if (recoveryEntries.length > 0) {
      throw new Error('Unresolved PR #225 provisioning or cleanup intent exists in the private recovery directory; complete manual recovery before provisioning');
    }
    return await runHostedBranchOrchestration(options);
  }
  finally { await releaseLock(); }
}

async function cleanupCreatedBranch({ branch, api, inventory, wait }) {
  let current;
  let inventoryError = null;
  try { current = await inventory(); }
  catch (error) { inventoryError = error; }
  if (current) {
    const refMatches = current.filter((item) => item?.project_ref === branch.project_ref);
    if (refMatches.length > 1) throw new Error('Recorded branch reference is not unique in parent inventory');
    if (refMatches.length === 0) {
      if (branch.observedInInventory) return true;
      if (!branch.createdFromResponse) throw new Error('Branch was never independently reconciled; absence is not cleanup verification');
    } else {
      const target = refMatches[0];
      if (target.name !== branch.name || target.parent_project_ref !== PARENT_REF || target.is_default !== false) {
        throw new Error('Recorded branch reference no longer matches the exact nondefault child identity');
      }
      branch.observedInInventory = true;
    }
  } else if (!branch.createdFromResponse && !branch.observedInInventory) {
    throw new Error(`Branch identity is not sufficient to delete after inventory failure: ${inventoryError?.message || 'unknown inventory error'}`);
  }

  const targetWasObservedBeforeDelete = Boolean(branch.observedInInventory);
  const { response } = await api('DELETE', `/branches/${encodeURIComponent(branch.project_ref)}`);
  if (!response.ok && response.status !== 404) throw new Error(`Branch delete request failed (HTTP ${response.status})`);
  let deleteAcknowledged = response.ok;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const remaining = await inventory();
    const refMatches = remaining.filter((item) => item?.project_ref === branch.project_ref);
    if (refMatches.length > 1) throw new Error('Recorded branch reference became ambiguous during deletion verification');
    if (refMatches.length === 0 && (deleteAcknowledged || targetWasObservedBeforeDelete || branch.observedInInventory)) return true;
    if (refMatches.length === 1 && !branch.observedInInventory) {
      const target = refMatches[0];
      if (target.name !== branch.name || target.parent_project_ref !== PARENT_REF || target.is_default !== false) {
        throw new Error('Late-visible branch does not match the exact nondefault child identity');
      }
      branch.observedInInventory = true;
      if (!deleteAcknowledged) {
        const retryDelete = await api('DELETE', `/branches/${encodeURIComponent(branch.project_ref)}`);
        if (!retryDelete.response.ok && retryDelete.response.status !== 404) {
          throw new Error(`Reconciled branch delete request failed (HTTP ${retryDelete.response.status})`);
        }
        deleteAcknowledged = retryDelete.response.ok;
      }
    }
    await wait(Math.min(3000, Math.max(0, deadline - Date.now())));
  }
  throw new Error('Branch remains in parent inventory after the 90-second cleanup window');
}

export async function recoverExactBranch({ token, name, expectedRef = null, fetchImpl = fetch, wait }) {
  assertRunName(name);
  const run = (options) => createHostedBranchOrchestrator.managementApi({ token, fetchImpl, ...options });
  const branches = await recoverExactBranch.inventory({ token, fetchImpl });
  const branch = expectedRef
    ? (() => {
        const matches = branches.filter((item) => item?.project_ref === expectedRef);
        if (matches.length !== 1) throw new Error('Recorded recovery reference is not unique in parent inventory');
        const item = matches[0];
        if (item.name !== name || item.parent_project_ref !== PARENT_REF) throw new Error('Recovery reference does not match exact name and parent');
        assertSafeRef(item.project_ref);
        return item;
      })()
    : identifyUniqueBranch(branches, { name });
  assertRecoverableBranch(branch, { name, ref: branch.project_ref });
  const { response } = await run({ method: 'DELETE', route: `/branches/${encodeURIComponent(branch.project_ref)}` });
  if (!response.ok && response.status !== 404) throw new Error(`Manual recovery delete failed (HTTP ${response.status})`);
  const pause = wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const remaining = await recoverExactBranch.inventory({ token, fetchImpl });
    if (!remaining.some((item) => item?.project_ref === branch.project_ref)) return branch.project_ref;
    await pause(Math.min(3000, Math.max(0, deadline - Date.now())));
  }
  throw new Error(`Manual recovery could not verify deletion of ${name} (${branch.project_ref})`);
}

// Exposed internals keep fault-injection tests isolated from Supabase.
createHostedBranchOrchestrator.managementApi = async ({ token, fetchImpl, method, route, body }) => {
  let response;
  try {
    response = await fetchImpl(`${API_ROOT}${route}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000),
    });
  } catch { throw new Error(`Management API ${method} request failed (${route})`); }
  let payload = null;
  try { payload = await response.json(); } catch { /* never log response bodies */ }
  return { response, payload };
};
recoverExactBranch.inventory = async ({ token, fetchImpl }) => {
  const { response, payload } = await createHostedBranchOrchestrator.managementApi({
    token, fetchImpl, method: 'GET', route: `/projects/${PARENT_REF}/branches`,
  });
  if (!response.ok) throw new Error(`Manual recovery inventory failed (HTTP ${response.status})`);
  return branchesFrom(payload);
};

function escapePassfile(value) { return value.replaceAll('\\', '\\\\').replaceAll(':', '\\:').replaceAll('\n', ''); }

async function readHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error('Run this command in the founder Terminal so credentials can be entered without echo');
  process.stdout.write(prompt);
  process.stdin.setEncoding('utf8');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return await new Promise((resolve, reject) => {
    let value = '';
    const onInterrupt = (error) => finish(error);
    const finish = (error, result) => {
      process.stdin.off('data', onData);
      interruptWaiters.delete(onInterrupt);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      error ? reject(error) : resolve(result);
    };
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\u0003') return finish(new Error('Interrupted while collecting branch credentials'));
        if (char === '\r' || char === '\n') return finish(null, value);
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    process.stdin.on('data', onData);
    interruptWaiters.add(onInterrupt);
  });
}

async function collectBranchCredentials(projectRef) {
  const publishable = (await readHidden('Branch publishable key (Dashboard → Settings → API Keys): ')).trim();
  const secret = (await readHidden('Branch secret key (Dashboard → Settings → API Keys): ')).trim();
  const databasePassword = await readHidden('Branch database password (Dashboard → Connect): ');
  if (!publishable || !secret || !databasePassword || /[\r\n]/.test(databasePassword)) {
    throw new Error('All three branch credential inputs are required; database password must be one line');
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fd-pr225-'));
  try {
    await chmod(dir, 0o700);
    const passfile = path.join(dir, 'pgpass');
    const entry = [
      `db.${projectRef}.supabase.co`, '5432', 'postgres', 'postgres', escapePassfile(databasePassword),
    ].join(':');
    await writeFile(passfile, `${entry}\n`, { mode: 0o600, flag: 'wx' });
    await chmod(passfile, 0o600);
    const passStat = await stat(passfile);
    if ((passStat.mode & 0o077) !== 0) throw new Error('Temporary database passfile permissions are not private');
    return { publishable, secret, passfile, tempDir: dir };
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

function runHostedRunner({ name, projectRef, credentials }) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    Object.assign(env, {
      FINE_DIET_RLS_TARGET_REF: projectRef,
      FINE_DIET_RLS_EXPECTED_REF: projectRef,
      FINE_DIET_RLS_BRANCH_NAME: name,
      FINE_DIET_RLS_COST_APPROVED: 'YES',
      SUPABASE_PUBLISHABLE_KEY: credentials.publishable,
      SUPABASE_SECRET_KEY: credentials.secret,
      PGPASSFILE: credentials.passfile,
    });
    const child = spawn(process.execPath, [RUNNER], { cwd: ROOT, env, stdio: 'inherit' });
    activeChild = child;
    child.once('error', () => reject(new Error('Could not start the existing hosted runner')));
    child.once('exit', (code, signal) => {
      activeChild = null;
      if (code === 0) resolve(0);
      else reject(new Error(`Existing hosted runner failed${signal ? ` (${signal})` : ` (exit ${code})`}`));
    });
  });
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token?.trim()) throw new Error('SUPABASE_ACCESS_TOKEN must already be exported in this Terminal');
  const stateDir = DEFAULT_RECOVERY_DIR;
  let statePath = null;
  let credentials = null;
  try {
    const result = await createHostedBranchOrchestrator({
      token,
      onBranchIntent: async (record) => {
        statePath = path.join(stateDir, `${record.name}.json`);
        await writeFile(statePath, `${JSON.stringify({ ...record, status: 'provisioning' })}\n`, { mode: 0o600, flag: 'wx' });
        await chmod(statePath, 0o600);
      },
      onBranchRecorded: async (record) => {
        if (!record) {
          if (statePath) await rm(statePath, { force: true });
          return;
        }
        statePath = path.join(stateDir, `${record.name}.json`);
        await writeFile(statePath, `${JSON.stringify({ ...record, status: 'cleanup_armed' })}\n`, { mode: 0o600 });
        await chmod(statePath, 0o600);
        process.stdout.write(`Temporary branch recorded: ${record.name} (${record.projectRef})\n`);
      },
      onCleanupUnresolved: (record) => {
        process.stderr.write(`CLEANUP UNRESOLVED: exact branch ${record.name} (${record.projectRef}); run the printed recovery command.\n`);
      },
      runHosted: async (branch) => {
        process.stdout.write(`Temporary branch is ACTIVE_HEALTHY; use ref ${branch.projectRef} in Dashboard to enter its branch-only credentials.\n`);
        credentials = await collectBranchCredentials(branch.projectRef);
        try { return await runHostedRunner({ ...branch, credentials }); }
        finally {
          await rm(credentials.tempDir, { recursive: true, force: true }).catch(() => {});
          credentials = null;
        }
      },
    });
    if (result !== 0) process.exitCode = 1;
    process.stdout.write('Hosted verification finished; branch absence was independently verified.\n');
  } catch (error) {
    process.stderr.write(`STOP: ${error.message}\n`);
    if (error.branchName) {
      const refArg = error.branchRef ? ` --ref ${error.branchRef}` : '';
      if (error.cleanupVerified) {
        process.stderr.write(`Cleanup verified: temporary branch ${error.branchName} is absent.\n`);
      } else {
        process.stderr.write(`CLEANUP STATUS UNKNOWN: reconcile exact branch name ${error.branchName} under parent ${PARENT_REF}.\n`);
        process.stderr.write(`Manual recovery (founder Terminal): SUPABASE_ACCESS_TOKEN must remain exported; node test/hosted/orchestrateProgramContentRlsHosted.mjs --recover ${error.branchName}${refArg}\n`);
      }
    }
    process.exitCode = 1;
  } finally {
    if (credentials?.tempDir) await rm(credentials.tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function recoverMain(args) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token?.trim()) throw new Error('SUPABASE_ACCESS_TOKEN must already be exported in this Terminal');
  const name = args[0];
  const refIndex = args.indexOf('--ref');
  const expectedRef = refIndex >= 0 ? args[refIndex + 1] : null;
  const projectRef = await recoverExactBranch({ token, name, expectedRef });
  process.stdout.write(`Recovery verified branch absence: ${name} (${projectRef})\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.on('SIGINT', () => handleInterrupt('SIGINT'));
  process.on('SIGTERM', () => handleInterrupt('SIGTERM'));
  const args = process.argv.slice(2);
  const operation = args[0] === '--recover'
    ? recoverMain(args.slice(1))
    : main();
  operation.catch((error) => {
    process.stderr.write(`STOP: ${error.message}\n`);
    process.exitCode = 1;
  });
}
