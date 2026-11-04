#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyHostedSchemaAndMigration,
  assertBranchHealthy,
  armVerifiedBranchCleanup,
  deleteAndVerifyBranch,
  identifyCleanupEligibleBranch,
  parseExplainJsonOutput,
  serviceRoleAuthoringCrud,
  validateProtectedPassfile,
} from './hostedRunnerCore.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const runner = path.join(here, 'runProgramContentRlsHosted.mjs');
const blockedRefs = [
  'tssvlflebugqhtogqdfs',
  'ikvkqpbwlpevqlshdkdz',
  'ymdhsvuaixiwhlioiree',
  'slsmfdxxqktkgplliwhx',
];

for (const targetRef of blockedRefs) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pr225-hosted-safety-'));
  const evidencePath = path.join(dir, 'evidence.json');
  const result = spawnSync(process.execPath, [runner], {
    encoding: 'utf8',
    timeout: 15_000,
    env: {
      PATH: process.env.PATH,
      FINE_DIET_RLS_TARGET_REF: targetRef,
      FINE_DIET_RLS_EXPECTED_REF: targetRef,
      FINE_DIET_RLS_BRANCH_NAME: 'fine-diet-pr225-rls-20261104t120000z',
      FINE_DIET_RLS_COST_APPROVED: 'YES',
      FINE_DIET_RLS_EVIDENCE_PATH: evidencePath,
      // A sentinel confirms this rejected path never calls the Management API.
      SUPABASE_ACCESS_TOKEN: 'NEVER-USE-SENTINEL',
    },
  });
  assert.equal(result.status, 1, `blocked ref ${targetRef} must fail closed`);
  assert.match(result.stderr, /protected or retired project reference/);
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  assert.equal(evidence.hostedDatabaseWrites, false);
  assert.equal(evidence.cleanup.attempted, false);
  assert.equal(JSON.stringify(evidence).includes('NEVER-USE-SENTINEL'), false);
  rmSync(dir, { recursive: true, force: true });
  process.stdout.write(`PASS rejects protected project ref ${targetRef} before API/database access\n`);
}

const missingTokenDir = mkdtempSync(path.join(tmpdir(), 'pr225-hosted-missing-credential-'));
const missingTokenEvidence = path.join(missingTokenDir, 'evidence.json');
const missingTokenRun = spawnSync(process.execPath, [runner], {
  encoding: 'utf8', timeout: 15_000,
  env: {
    PATH: process.env.PATH,
    FINE_DIET_RLS_TARGET_REF: 'abcdefghijklmnopqrst',
    FINE_DIET_RLS_EXPECTED_REF: 'abcdefghijklmnopqrst',
    FINE_DIET_RLS_BRANCH_NAME: 'fine-diet-pr225-rls-20261104t120000z',
    FINE_DIET_RLS_COST_APPROVED: 'YES',
    FINE_DIET_RLS_EVIDENCE_PATH: missingTokenEvidence,
  },
});
assert.equal(missingTokenRun.status, 1);
assert.match(missingTokenRun.stderr, /Missing required environment variable SUPABASE_ACCESS_TOKEN/);
const missingTokenResult = JSON.parse(readFileSync(missingTokenEvidence, 'utf8'));
assert.equal(missingTokenResult.hostedDatabaseWrites, false);
assert.equal(missingTokenResult.cleanup.armed, false);
rmSync(missingTokenDir, { recursive: true, force: true });
process.stdout.write('PASS missing Management API credential stops before network or database access\n');

const branch = {
  id: 'branch-id', project_ref: 'abcdefghijklmnopqrst', name: 'fine-diet-pr225-rls-20261104t120000z',
  parent_project_ref: 'tssvlflebugqhtogqdfs', persistent: false, with_data: false,
  is_default: false, preview_project_status: 'INACTIVE',
};
const evidence = { cleanup: { armed: false }, targetProjectRef: null };
const identified = identifyCleanupEligibleBranch({
  branches: [branch], targetRef: branch.project_ref, branchName: branch.name, parentRef: branch.parent_project_ref,
});
armVerifiedBranchCleanup(evidence, identified);
assert.equal(evidence.targetProjectRef, branch.project_ref, 'unhealthy but identity-verified branches retain their ref');
assert.equal(evidence.cleanup.armed, true);
assert.throws(() => assertBranchHealthy(identified), /not ACTIVE_HEALTHY/);
process.stdout.write('PASS cleanup arms unhealthy branch only after independent ref identity verification\n');
const healthyBranch = { ...branch, preview_project_status: 'ACTIVE_HEALTHY' };
assert.equal(identifyCleanupEligibleBranch({
  branches: [healthyBranch], targetRef: healthyBranch.project_ref,
  branchName: healthyBranch.name, parentRef: healthyBranch.parent_project_ref,
}), healthyBranch);
assert.equal(assertBranchHealthy(healthyBranch), true);
process.stdout.write('PASS healthy branch identity passes isolated-branch preflight\n');

let deleteCalls = 0;
await assert.rejects(deleteAndVerifyBranch({
  targetProjectRef: '', branchRecord: branch,
  parentRef: branch.parent_project_ref,
  deleteBranch: async () => { deleteCalls += 1; }, listBranches: async () => [],
}), /nonempty verified project reference/);
await assert.rejects(deleteAndVerifyBranch({
  targetProjectRef: 'wrongprojectref00000', branchRecord: branch,
  parentRef: branch.parent_project_ref,
  deleteBranch: async () => { deleteCalls += 1; }, listBranches: async () => [],
}), /not bound to verified branch identity/);
assert.equal(deleteCalls, 0, 'unverified cleanup refs never reach deletion');
process.stdout.write('PASS cleanup refuses empty and mismatched project references before delete\n');

await assert.rejects(deleteAndVerifyBranch({
  targetProjectRef: branch.project_ref, branchRecord: branch,
  parentRef: branch.parent_project_ref,
  deleteBranch: async () => { throw new Error('mock delete API failure'); },
  listBranches: async () => [],
}), /mock delete API failure/);
await assert.rejects(deleteAndVerifyBranch({
  targetProjectRef: branch.project_ref, branchRecord: branch,
  parentRef: branch.parent_project_ref,
  deleteBranch: async () => {}, listBranches: async () => { throw new Error('mock inventory API failure'); },
}), /mock inventory API failure/);
process.stdout.write('PASS cleanup surfaces Management API delete and inventory failures\n');

let inventoryCalls = 0;
const cleaned = await deleteAndVerifyBranch({
  targetProjectRef: branch.project_ref, branchRecord: branch,
  parentRef: branch.parent_project_ref,
  deleteBranch: async (ref) => assert.equal(ref, branch.project_ref),
  listBranches: async () => ++inventoryCalls === 1 ? [branch] : [],
  wait: async () => {}, timeoutMs: 1000,
});
assert.equal(cleaned, true);
assert.equal(inventoryCalls, 2, 'cleanup polls inventory after delete until absence is observed');
await assert.rejects(deleteAndVerifyBranch({
  targetProjectRef: branch.project_ref, branchRecord: branch,
  parentRef: branch.parent_project_ref,
  deleteBranch: async () => {}, listBranches: async () => [branch],
  wait: async () => {}, timeoutMs: 1,
}), /absence was not verified/);
process.stdout.write('PASS cleanup verifies absence and fails closed when branch remains\n');

const explain = parseExplainJsonOutput(`set_config\nabcdefghijklmnopqrst\n[\n  {\n    "Plan": { "Node Type": "Seq Scan", "Plans": [] },\n    "Planning Time": 0.12,\n    "Execution Time": 0.34\n  }\n]\n`);
assert.equal(explain[0].Plan['Node Type'], 'Seq Scan');
assert.equal(explain[0]['Execution Time'], 0.34);
assert.throws(() => parseExplainJsonOutput('not json'), /EXPLAIN JSON array/);
process.stdout.write('PASS multiline EXPLAIN JSON parses after psql status output\n');

const writeEvidence = { hostedDatabaseWrites: false };
let migrationRan = false;
assert.throws(() => applyHostedSchemaAndMigration(
  writeEvidence, () => { throw new Error('fixture setup failed'); }, () => { migrationRan = true; },
), /fixture setup failed/);
assert.equal(writeEvidence.hostedDatabaseWrites, true);
assert.equal(writeEvidence.hostedSetupCompleted, false);
assert.equal(writeEvidence.candidateMigrationCompleted, false);
assert.equal(migrationRan, false);
process.stdout.write('PASS failed hosted setup is recorded as an attempted database write\n');

const operations = [];
const mockPrivilegedClient = {
  from(table) {
    return {
      update(payload) {
        operations.push({ table, operation: 'update', payload });
        return { eq: () => ({ select: async () => ({ data: [{ id: 'synthetic-row' }], error: null }) }) };
      },
      delete() {
        operations.push({ table, operation: 'delete' });
        return { eq: () => ({ select: async () => ({ data: [{ id: 'synthetic-row' }], error: null }) }) };
      },
    };
  },
};
const crud = await serviceRoleAuthoringCrud(mockPrivilegedClient, 'program_modules', 'synthetic-row');
assert.deepEqual(operations.map((item) => item.operation), ['update', 'delete']);
assert.equal(crud.updateResult.data.length, 1);
assert.equal(crud.deleteResult.data.length, 1);
process.stdout.write('PASS service-role authoring uses injected privileged client operations\n');

assert.equal(validateProtectedPassfile({ isFile: () => true, mode: 0o100600 }), true);
assert.throws(() => validateProtectedPassfile(null), /regular file/);
assert.throws(() => validateProtectedPassfile({ isFile: () => true, mode: 0o100644 }), /permissions allow/);
process.stdout.write('PASS protected passfile validation rejects absent and overbroad files\n');
