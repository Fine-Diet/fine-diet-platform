import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostedBranchOrchestrator, recoverExactBranch } from './orchestrateProgramContentRlsHosted.mjs';

const PARENT = 'tssvlflebugqhtogqdfs';
const REF = 'abcdeabcdeabcdeabcde';
const TOKEN = 'TEST_TOKEN_MUST_NOT_BE_LOGGED';

function response(status, body = null) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function fakeApi({ createMode = 'success', invalidBranch = false, deleteStatus = 204 } = {}) {
  const calls = [];
  const branches = [];
  let name = null;
  const fetchImpl = async (url, options = {}) => {
    const method = options.method || 'GET';
    const route = new URL(url).pathname.replace('/v1', '');
    calls.push({ method, route, headers: options.headers, body: options.body });
    if (options.headers?.Authorization !== `Bearer ${TOKEN}`) throw new Error('wrong bearer');
    if (method === 'GET' && route === `/projects/${PARENT}/branches`) return response(200, branches.slice());
    if (method === 'POST' && route === `/projects/${PARENT}/branches`) {
      const body = JSON.parse(options.body);
      name = body.branch_name;
      assert.equal(body.persistent, false);
      assert.equal(body.with_data, false);
      const branch = {
        name,
        project_ref: REF,
        parent_project_ref: PARENT,
        is_default: false,
        persistent: invalidBranch,
        with_data: false,
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

test('read-only preflight needs only branch inventory and no project-settings endpoint', async () => {
  const api = fakeApi();
  await run(api, { runHosted: async () => 0 });
  assert.equal(api.calls.some((call) => call.route === `/projects/${PARENT}`), false);
  assert.equal(api.calls[0].method, 'GET');
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
