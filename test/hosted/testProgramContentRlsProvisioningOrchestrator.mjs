import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  classifyMigrationReplay,
  createHostedBranchOrchestrator,
  recoverExactBranch,
} from './orchestrateProgramContentRlsHosted.mjs';

const PARENT = 'tssvlflebugqhtogqdfs';
const REF = 'abcdeabcdeabcdeabcde';
const TOKEN = 'TEST_TOKEN_MUST_NOT_BE_LOGGED';

function response(status, body = null) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function fakeApi({
  createMode = 'success',
  invalidBranch = false,
  deleteStatus = 204,
  branchStatus = 'MIGRATIONS_PASSED',
  migrationStatus = 'EXITED',
  latestCheckRunId = 74,
} = {}) {
  const calls = [];
  const branches = [];
  let name = null;
  const fetchImpl = async (url, options = {}) => {
    const method = options.method || 'GET';
    const route = new URL(url).pathname.replace('/v1', '');
    const query = new URL(url).searchParams;
    calls.push({ method, route, headers: options.headers, body: options.body });
    if (options.headers?.Authorization !== `Bearer ${TOKEN}`) throw new Error('wrong bearer');
    if (method === 'GET' && route === `/projects/${PARENT}/branches`) return response(200, branches.slice());
    if (method === 'GET' && route === `/projects/${PARENT}/actions`) {
      assert.equal(query.get('limit'), '100');
      return response(200, branches.map((branch) => ({
        id: 'action-run-1',
        branch_id: branch.id,
        check_run_id: branch.latest_check_run_id,
        created_at: '2026-11-04T20:15:31.000Z',
        run_steps: [{ name: 'migrate', status: migrationStatus }],
      })));
    }
    if (method === 'POST' && route === `/projects/${PARENT}/branches`) {
      const body = JSON.parse(options.body);
      name = body.branch_name;
      assert.equal(body.persistent, false);
      assert.equal(body.with_data, false);
      const branch = {
        id: 'branch-record-1',
        name,
        project_ref: REF,
        parent_project_ref: PARENT,
        is_default: false,
        persistent: invalidBranch,
        with_data: false,
        status: branchStatus,
        ...(latestCheckRunId == null ? {} : { latest_check_run_id: latestCheckRunId }),
        preview_project_status: 'ACTIVE_HEALTHY',
      };
      branches.push(branch);
      if (createMode === 'ambiguous') throw new Error('simulated lost create response');
      return createMode === 'bad-status'
        ? response(500, { secret: 'must not be logged' })
        : response(201, branch);
    }
    if (method === 'DELETE' && route === `/branches/${REF}`) {
      if (deleteStatus >= 200 && deleteStatus < 300) branches.splice(0, branches.length);
      return response(deleteStatus);
    }
    throw new Error(`unexpected mock request ${method} ${route}`);
  };
  return { calls, branches, fetchImpl, get name() { return name; } };
}

function run(api, options = {}) {
  return createHostedBranchOrchestrator({
    token: TOKEN,
    fetchImpl: api.fetchImpl,
    now: () => new Date('2026-11-04T20:15:30.000Z'),
    wait: async () => {},
    timeoutMs: 100,
    ...options,
  });
}

test('hosted runner failure deletes only its verified zero-data branch and independently confirms absence', async () => {
  const api = fakeApi();
  let cleanupUnresolved = false;
  await assert.rejects(run(api, {
    runHosted: async () => { throw new Error('simulated migration replay failure'); },
    onCleanupUnresolved: () => { cleanupUnresolved = true; },
  }), /simulated migration replay failure/);
  assert.equal(api.branches.length, 0);
  assert.equal(api.calls.filter((call) => call.method === 'DELETE').length, 1);
  assert.equal(cleanupUnresolved, false);
  assert.equal(api.calls.some((call) => call.route.startsWith('/projects/') && call.method === 'GET'), true);
});

test('branch credential collection failure triggers cleanup before hosted database work', async () => {
  const api = fakeApi();
  await assert.rejects(run(api, {
    runHosted: async () => {
      throw new Error('All three branch credential inputs are required');
    },
  }), /All three branch credential inputs are required/);
  assert.equal(api.calls.filter((call) => call.method === 'DELETE').length, 1);
  assert.equal(api.branches.length, 0);
});

test('lost create response reconciles exact name and parent, records ref, then cleans up', async () => {
  const api = fakeApi({ createMode: 'ambiguous' });
  const recorded = [];
  await assert.rejects(run(api, {
    runHosted: async () => { throw new Error('fixture preflight stopped safely'); },
    onBranchRecorded: async (row) => { if (row) recorded.push(row); },
  }), /fixture preflight stopped safely/);
  assert.deepEqual(recorded, [{
    name: 'fine-diet-pr225-rls-20261104t201530z', projectRef: REF, parentRef: PARENT,
  }]);
  assert.equal(api.branches.length, 0);
});

test('ambiguous creation with temporary inventory absence stays unresolved and preserves recovery intent', async () => {
  const api = fakeApi({ createMode: 'ambiguous' });
  const intents = [];
  const recorded = [];
  const unresolved = [];
  let createAttempted = false;
  const fetchImpl = async (url, options = {}) => {
    const route = new URL(url).pathname.replace('/v1', '');
    if (options.method === 'POST') createAttempted = true;
    const result = await api.fetchImpl(url, options);
    if (createAttempted && options.method === 'GET' && route === `/projects/${PARENT}/branches`) return response(200, []);
    return result;
  };
  await assert.rejects(run(api, {
    reconcileTimeoutMs: 0,
    fetchImpl,
    onBranchIntent: async (record) => intents.push(record),
    onBranchRecorded: async (record) => recorded.push(record),
    onCleanupUnresolved: (record) => unresolved.push(record),
    runHosted: async () => assert.fail('no branch was reconciled'),
  }), (error) => {
    assert.equal(error.cleanupVerified, false);
    assert.equal(error.branchName, 'fine-diet-pr225-rls-20261104t201530z');
    return /CLEANUP UNRESOLVED/.test(error.message);
  });
  assert.equal(intents.length, 1);
  assert.equal(recorded.length, 0);
  assert.equal(unresolved.length, 1);
  assert.equal(api.calls.filter((call) => call.method === 'DELETE').length, 0);
});

test('ambiguous create reconciliation discovers a child after an initial inventory miss', async () => {
  const api = fakeApi({ createMode: 'ambiguous' });
  let createAttempted = false;
  let hiddenInventories = 1;
  const fetchImpl = async (url, options = {}) => {
    const route = new URL(url).pathname.replace('/v1', '');
    if (options.method === 'POST') createAttempted = true;
    const result = await api.fetchImpl(url, options);
    if (createAttempted && options.method === 'GET' && route === `/projects/${PARENT}/branches` && hiddenInventories > 0) {
      hiddenInventories -= 1;
      return response(200, []);
    }
    return result;
  };
  await assert.rejects(run(api, {
    fetchImpl,
    runHosted: async () => { throw new Error('stop after reconciliation'); },
  }), /stop after reconciliation/);
  assert.equal(hiddenInventories, 0);
  assert.equal(api.branches.length, 0);
  assert.equal(api.calls.filter((call) => call.method === 'DELETE').length, 1);
});

test('ACTIVE_HEALTHY child with MIGRATIONS_FAILED workflow is deleted before credentials or DB work', async () => {
  const api = fakeApi({ branchStatus: 'MIGRATIONS_FAILED' });
  let runnerStarted = false;
  await assert.rejects(run(api, {
    runHosted: async () => { runnerStarted = true; },
  }), /MIGRATIONS_FAILED/);
  assert.equal(runnerStarted, false);
  assert.equal(api.branches.length, 0);
  assert.equal(api.calls.filter((call) => call.method === 'DELETE').length, 1);
});

test('missing branch workflow identity fails closed for a terminal branch', async () => {
  assert.throws(() => classifyMigrationReplay({
    status: 'ACTIVE_HEALTHY',
    latest_check_run_id: 74,
  }, []), /Branch record lacks the identifiers required to verify its migration workflow/);
});

test('missing latest_check_run_id uses the uniquely newest action run for the exact child branch', async () => {
  const api = fakeApi({ branchStatus: 'ACTIVE_HEALTHY', latestCheckRunId: null });
  const result = await run(api, { runHosted: async () => 'migration-pass' });
  assert.equal(result, 'migration-pass');
  const newestRunning = classifyMigrationReplay({ id: 'branch-record-1', status: 'ACTIVE_HEALTHY' }, [
    { id: 'older-run', branch_id: 'branch-record-1', created_at: '2026-11-04T20:15:30Z', run_steps: [{ name: 'migrate', status: 'EXITED' }] },
    { id: 'newer-run', branch_id: 'branch-record-1', created_at: '2026-11-04T20:15:31Z', run_steps: [{ name: 'migrate', status: 'RUNNING' }] },
  ]);
  assert.equal(newestRunning.state, 'pending');
  assert.match(newestRunning.reason, /RUNNING/);
});

test('tied newest action runs are ambiguous and fail closed', async () => {
  assert.throws(() => classifyMigrationReplay({
    id: 'branch-record-1',
    status: 'ACTIVE_HEALTHY',
  }, [
    { id: 'run-a', branch_id: 'branch-record-1', created_at: '2026-11-04T20:15:31Z', run_steps: [{ name: 'migrate', status: 'EXITED' }] },
    { id: 'run-b', branch_id: 'branch-record-1', created_at: '2026-11-04T20:15:31Z', run_steps: [{ name: 'migrate', status: 'EXITED' }] },
  ]), /Latest branch migration action run is ambiguous/);
});

test('DEAD migrate step is rejected even when branch preview is ACTIVE_HEALTHY', async () => {
  const api = fakeApi({ branchStatus: 'ACTIVE_HEALTHY', migrationStatus: 'DEAD' });
  let runnerStarted = false;
  await assert.rejects(run(api, {
    runHosted: async () => { runnerStarted = true; },
  }), /Migration replay step ended in DEAD/);
  assert.equal(runnerStarted, false);
  assert.equal(api.branches.length, 0);
  assert.equal(api.calls.filter((call) => call.method === 'DELETE').length, 1);
});

test('unrecognized terminal workflow status fails closed and deletes the child', async () => {
  const api = fakeApi({ branchStatus: 'SOMETHING_NEW' });
  await assert.rejects(run(api, { runHosted: async () => assert.fail('must not run') }), /Unrecognized terminal/);
  assert.equal(api.branches.length, 0);
  assert.equal(api.calls.filter((call) => call.method === 'DELETE').length, 1);
});

test('only a matching latest migrate EXITED action run permits hosted work', async () => {
  const api = fakeApi({ branchStatus: 'ACTIVE_HEALTHY', migrationStatus: 'EXITED' });
  const result = await run(api, { runHosted: async () => 'migration-pass' });
  assert.equal(result, 'migration-pass');
  assert.equal(api.calls.some((call) => call.method === 'GET' && call.route === `/projects/${PARENT}/actions`), true);
  assert.equal(api.branches.length, 0);
});

test('an unexpectedly persistent created branch is deleted before hosted database access', async () => {
  const api = fakeApi({ invalidBranch: true });
  let runnerStarted = false;
  await assert.rejects(run(api, {
    runHosted: async () => { runnerStarted = true; },
  }), /violates the approved zero-data temporary branch contract/);
  assert.equal(runnerStarted, false);
  assert.equal(api.branches.length, 0);
});

test('successful hosted runner still gets an independent parent-inventory absence check', async () => {
  const api = fakeApi();
  const result = await run(api, { runHosted: async () => 'runner-pass' });
  assert.equal(result, 'runner-pass');
  assert.equal(api.branches.length, 0);
  assert.equal(api.calls.filter((call) => call.method === 'DELETE').length, 1);
});

test('duplicate exact name/parent is not deleted when identity is ambiguous', async () => {
  const api = fakeApi();
  const baseFetch = api.fetchImpl;
  const fetchImpl = async (url, options = {}) => {
    const result = await baseFetch(url, options);
    if (options.method === 'POST') {
      const branch = api.branches[0];
      api.branches.push({ ...branch, project_ref: 'bcdefbcdefbcdefbcdef' });
      return response(500, null);
    }
    return result;
  };
  await assert.rejects(run(api, {
    fetchImpl,
    runHosted: async () => assert.fail('must not start runner'),
  }), /duplicate exact names/);
  assert.equal(api.calls.filter((call) => call.method === 'DELETE').length, 0);
});

test('failed deletion is surfaced as unresolved with exact recovery identity', async () => {
  const api = fakeApi({ deleteStatus: 500 });
  const unresolved = [];
  await assert.rejects(run(api, {
    runHosted: async () => { throw new Error('simulated runner interruption'); },
    onCleanupUnresolved: (item) => unresolved.push(item),
  }), (error) => {
    assert.equal(error.cleanupVerified, false);
    assert.equal(error.branchName, 'fine-diet-pr225-rls-20261104t201530z');
    assert.equal(error.branchRef, REF);
    return /CLEANUP UNRESOLVED/.test(error.message);
  });
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0].projectRef, REF);
  assert.equal(api.branches.length, 1);
});

test('read-only preflight checks branch inventory and Action Runs before creation', async () => {
  const api = fakeApi();
  await run(api, { runHosted: async () => 0 });
  assert.equal(api.calls.some((call) => call.route === `/projects/${PARENT}`), false);
  assert.equal(api.calls[0].method, 'GET');
  const createIndex = api.calls.findIndex((call) => call.method === 'POST');
  const preflightActionIndex = api.calls.findIndex((call) => call.method === 'GET' && call.route === `/projects/${PARENT}/actions`);
  assert.ok(preflightActionIndex > 0 && preflightActionIndex < createIndex);
  assert.equal(new URL(`https://api.supabase.com${api.calls[preflightActionIndex].route}?limit=100`).searchParams.get('limit'), '100');
});

test('Action Runs preflight HTTP failure stops before branch creation', async () => {
  const api = fakeApi();
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/actions')) {
      assert.equal(parsed.searchParams.get('limit'), '100');
      return response(400, { message: 'unsupported smaller limit' });
    }
    return api.fetchImpl(url, options);
  };
  await assert.rejects(run(api, { fetchImpl, runHosted: async () => assert.fail('must not run') }), /Action Runs preflight failed \(HTTP 400\)/);
  assert.equal(api.calls.filter((call) => call.method === 'POST').length, 0);
  assert.equal(api.calls.some((call) => call.method === 'DELETE'), false);
});

test('malformed Action Runs preflight structure stops before branch creation', async () => {
  const api = fakeApi();
  const fetchImpl = async (url, options = {}) => new URL(url).pathname.endsWith('/actions')
    ? response(200, { action_runs: [] })
    : api.fetchImpl(url, options);
  await assert.rejects(run(api, { fetchImpl, runHosted: async () => assert.fail('must not run') }), /Unexpected Action Runs response structure/);
  assert.equal(api.calls.filter((call) => call.method === 'POST').length, 0);
  assert.equal(api.calls.some((call) => call.method === 'DELETE'), false);
});

test('unresolved private recovery intent blocks provisioning even when remote inventory is empty', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'pr225-recovery-guard-'));
  const recoveryDir = path.join(tempRoot, 'fine-diet-pr225-recovery');
  const lockPath = path.join(tempRoot, 'orchestrator.lock');
  const api = fakeApi();
  try {
    await mkdir(recoveryDir, { mode: 0o700 });
    await writeFile(path.join(recoveryDir, 'fine-diet-pr225-rls-20261104t201530z.json'), JSON.stringify({ status: 'provisioning' }), { mode: 0o600 });
    await assert.rejects(run(api, { lockPath, recoveryDir, runHosted: async () => assert.fail('must not run') }), /Unresolved PR #225 provisioning or cleanup intent/);
    assert.equal(api.calls.length, 0);
    assert.equal(api.calls.filter((call) => call.method === 'POST').length, 0);
    assert.equal(await access(path.join(recoveryDir, 'fine-diet-pr225-rls-20261104t201530z.json')).then(() => true, () => false), true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('one-branch authorization refuses provisioning while another PR #225 branch exists', async () => {
  const api = fakeApi();
  api.branches.push({
    name: 'fine-diet-pr225-rls-20261104t201529z',
    project_ref: 'bcdefbcdefbcdefbcdef',
    parent_project_ref: PARENT,
    is_default: false,
    persistent: false,
    with_data: false,
  });
  await assert.rejects(run(api, { runHosted: async () => 0 }), /already exists/);
  assert.equal(api.calls.filter((call) => call.method === 'POST').length, 0);
  assert.equal(api.calls.filter((call) => call.method === 'DELETE').length, 0);
});

test('manual recovery deletes only an exact named, nondefault child and verifies absence', async () => {
  const api = fakeApi();
  api.branches.push({
    name: 'fine-diet-pr225-rls-20261104t201530z',
    project_ref: REF,
    parent_project_ref: PARENT,
    is_default: false,
    persistent: true,
    with_data: false,
  });
  const removedRef = await recoverExactBranch({
    token: TOKEN,
    name: api.branches[0].name,
    expectedRef: REF,
    fetchImpl: api.fetchImpl,
    wait: async () => {},
  });
  assert.equal(removedRef, REF);
  assert.equal(api.branches.length, 0);
  assert.equal(api.calls.filter((call) => call.method === 'DELETE').length, 1);
});

test('manual recovery refuses a default or mismatched target without deleting it', async () => {
  const api = fakeApi();
  api.branches.push({
    name: 'fine-diet-pr225-rls-20261104t201530z',
    project_ref: REF,
    parent_project_ref: PARENT,
    is_default: true,
    persistent: false,
    with_data: false,
  });
  await assert.rejects(recoverExactBranch({
    token: TOKEN,
    name: api.branches[0].name,
    expectedRef: REF,
    fetchImpl: api.fetchImpl,
    wait: async () => {},
  }), /exact nondefault child/);
  assert.equal(api.calls.filter((call) => call.method === 'DELETE').length, 0);
  assert.equal(api.branches.length, 1);
});

test('exclusive local lock permits only one simultaneous provisioning attempt', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'pr225-lock-test-'));
  const lockPath = path.join(tempRoot, 'orchestrator.lock');
  const firstApi = fakeApi();
  const secondApi = fakeApi();
  let markRunnerStarted;
  const runnerStarted = new Promise((resolve) => { markRunnerStarted = resolve; });
  let finishRunner;
  const holdRunner = new Promise((resolve) => { finishRunner = resolve; });
  try {
    const first = run(firstApi, {
      lockPath,
      runHosted: async () => { markRunnerStarted(); await holdRunner; return 'first'; },
    });
    await runnerStarted;
    await assert.rejects(run(secondApi, {
      lockPath,
      runHosted: async () => 'second',
    }), /already active/);
    finishRunner('done');
    assert.equal(await first, 'first');
    assert.equal(firstApi.calls.filter((call) => call.method === 'POST').length, 1);
    assert.equal(secondApi.calls.filter((call) => call.method === 'POST').length, 0);
    assert.equal(firstApi.branches.length, 0);
    assert.equal(secondApi.branches.length, 0);
  } finally {
    finishRunner?.('cleanup');
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('stale lock is preserved and blocks provisioning until its recovery record is checked manually', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'pr225-stale-lock-test-'));
  const lockPath = path.join(tempRoot, 'orchestrator.lock');
  const api = fakeApi();
  try {
    await mkdir(lockPath, { mode: 0o700 });
    await writeFile(path.join(lockPath, 'owner.json'), JSON.stringify({
      pid: 2_147_483_647,
      hostname: os.hostname(),
      startedAt: '2026-01-01T00:00:00Z',
      nonce: 'stale-owner-nonce',
    }), { mode: 0o600 });
    await assert.rejects(run(api, { lockPath, runHosted: async () => 'must not run' }), /verify its branch recovery record/);
    assert.equal(api.branches.length, 0);
    assert.equal(api.calls.length, 0);
    assert.equal(await access(lockPath).then(() => true, () => false), true);
    assert.equal(JSON.parse(await readFile(path.join(lockPath, 'owner.json'), 'utf8')).nonce, 'stale-owner-nonce');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('malformed lock is preserved and blocks provisioning conservatively', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'pr225-unknown-lock-test-'));
  const lockPath = path.join(tempRoot, 'orchestrator.lock');
  const api = fakeApi();
  try {
    await mkdir(lockPath, { mode: 0o700 });
    await writeFile(path.join(lockPath, 'owner.json'), 'not-json', { mode: 0o600 });
    await assert.rejects(run(api, { lockPath, runHosted: async () => 0 }), /stale or unverifiable/);
    assert.equal(api.calls.filter((call) => call.method === 'POST').length, 0);
    assert.equal(await readFile(path.join(lockPath, 'owner.json'), 'utf8'), 'not-json');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
