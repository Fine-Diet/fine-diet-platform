#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
