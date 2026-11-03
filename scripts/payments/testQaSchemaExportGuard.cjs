#!/usr/bin/env node
'use strict';
// Offline contract tests only: never connect to a hosted database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const target = path.join(__dirname, 'qaSchemaExportGuard.cjs');
const fakePsql = [
  '#!/usr/bin/env node',
  'if (process.argv.includes("--version")) { console.log("psql (PostgreSQL) 17.6"); process.exit(0); }',
  'require("node:fs").writeFileSync(process.env.FD_TEST_TRACE + ".psql", JSON.stringify(process.argv.slice(2)));',
  'console.log(process.env.FD_TEST_INVENTORY || "170006|117|t|t");',
].join('\n') + '\n';
const fakeDump = [
  '#!/usr/bin/env node',
  'const fs = require("node:fs");',
  'if (process.argv.includes("--version")) { console.log("pg_dump (PostgreSQL) 17.6"); process.exit(0); }',
  'const args = process.argv.slice(2);',
  'fs.writeFileSync(process.env.FD_TEST_TRACE + ".pg_dump", JSON.stringify(args));',
  'const out = args[args.indexOf("--file") + 1];',
  'let ddl = "-- Database schema only\\nCREATE SCHEMA programs_private;\\n";',
  'for (const name of ["people", "offers", ...Array.from({length: 115}, (_, i) => "fixture_" + i)]) {',
  ' ddl += "CREATE TABLE public." + name + " (\\n";',
  ' for (let i=0; i<15; i++) ddl += "col_" + i + " text NOT NULL DEFAULT \'fixture\',\\n";',
  ' ddl += "id uuid NOT NULL\\n);\\n";',
  '}',
  'if (process.env.FD_TEST_BAD_DUMP === "1") ddl += "COPY public.people FROM stdin;\\nSENSITIVE_ROW\\n\\\\.\\n";',
  'fs.writeFileSync(out, ddl);',
].join('\n') + '\n';
function setup(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-export-contract-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const home = path.join(root, 'config');
  const bin = path.join(root, 'bin');
  const out = path.join(root, 'output');
  fs.mkdirSync(home, {mode:0o700}); fs.mkdirSync(bin); fs.mkdirSync(out, {mode:0o700});
  const service = path.join(home, 'service.conf');
  const pass = path.join(home, 'pgpass');
  const user = options.wrong ? 'postgres.some-other-ref' : 'postgres.tssvlflebugqhtogqdfs';
  fs.writeFileSync(service, '[fine_diet_prod_schema_readonly]\nhost=aws-0-us-west-2.pooler.supabase.com\nport=5432\ndbname=postgres\nuser=' + user + '\nsslmode=require\n', {mode:0o600});
  fs.writeFileSync(pass, 'FAKE_TEST_ONLY', {mode:0o600});
  for (const [name, source] of [['psql', fakePsql], ['pg_dump', fakeDump]])
    fs.writeFileSync(path.join(bin, name), source, {mode:0o700});
  const env = {...process.env, PATH:bin + path.delimiter + process.env.PATH,
    PGSERVICEFILE:service, PGPASSFILE:pass, FD_SCHEMA_EXPORT_DIR:out,
    FD_TEST_TRACE:path.join(root, 'trace')};
  delete env.PGPASSWORD;
  return {root, home, out, pass, service, env};
}
function execute(o, mode='--preflight') {
  return spawnSync(process.execPath, [target, mode], {cwd:__dirname, env:o.env, encoding:'utf8', timeout:15000});
}
test('preflight is offline and creates no dump', t => {
  const o=setup(t), r=execute(o);
  assert.equal(r.status,0,r.stderr);
  assert.match(r.stdout,/NO DATABASE CONNECTION OR EXPORT/);
  assert.equal(fs.existsSync(o.env.FD_TEST_TRACE+'.psql'),false);
  assert.deepEqual(fs.readdirSync(o.out),[]);
});
test('rejects wrong project before remote read', t => {
  const o=setup(t,{wrong:true}), r=execute(o,'--export');
  assert.notEqual(r.status,0); assert.match(r.stderr,/approved Fine Diet production/);
  assert.equal(fs.existsSync(o.env.FD_TEST_TRACE+'.psql'),false);
});
test('rejects exposed password files', t => {
  const o=setup(t); fs.chmodSync(o.pass,0o644);
  const r=execute(o,'--export'); assert.notEqual(r.status,0);
  assert.match(r.stderr,/mode 0600/);
});
test('rejects unapproved PG password environment variable', t => {
  const o=setup(t); o.env.PGPASSWORD='DO_NOT_PRINT_SECRET';
  const r=execute(o,'--export'); assert.notEqual(r.status,0);
  assert.doesNotMatch(r.stderr,/DO_NOT_PRINT_SECRET/);
});
test('rejects changed production inventory before any export', t => {
  const o=setup(t); o.env.FD_TEST_INVENTORY='170006|116|t|t';
  const r=execute(o,'--export'); assert.notEqual(r.status,0);
  assert.equal(fs.existsSync(o.env.FD_TEST_TRACE+'.pg_dump'),false);
});
test('export uses schema-only parameters and private destination', t => {
  const o=setup(t), r=execute(o,'--export'); assert.equal(r.status,0,r.stderr);
  const subdirs=fs.readdirSync(o.out); assert.equal(subdirs.length,1);
  const dir=path.join(o.out,subdirs[0]);
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  assert.equal(manifest.public_table_create_count,117);
  assert.equal(manifest.source_project_ref,'tssvlflebugqhtogqdfs');
  assert.equal(manifest.sha256.length,64);
  assert.equal(fs.statSync(path.join(dir,'schema.sql')).mode & 0o077,0);
  const args=JSON.parse(fs.readFileSync(o.env.FD_TEST_TRACE+'.pg_dump','utf8'));
  for (const flag of ['--schema-only','--schema=public','--schema=programs_private','service=fine_diet_prod_schema_readonly']) assert(args.includes(flag));
  assert(!args.includes('--data-only'));
  assert(!args.some(x=>x.includes('FAKE_TEST_ONLY')));
});
test('rejects and removes export containing COPY data', t => {
  const o=setup(t); o.env.FD_TEST_BAD_DUMP='1';
  const r=execute(o,'--export'); assert.notEqual(r.status,0);
  assert.match(r.stderr,/COPY/); assert.deepEqual(fs.readdirSync(o.out),[]);
});
test('rejects writing under repository checkout', t => {
  const o=setup(t); const nested=fs.mkdtempSync(path.join(__dirname,'private-test-'));
  fs.chmodSync(nested,0o700);
  t.after(()=>fs.rmSync(nested,{recursive:true,force:true}));
  o.env.FD_SCHEMA_EXPORT_DIR=nested;
  const r=execute(o,'--export'); assert.notEqual(r.status,0);
  assert.match(r.stderr,/outside and separate/);
});
test('unknown operation is rejected', t => {
  const o=setup(t),r=execute(o,'--restore'); assert.notEqual(r.status,0);
  assert.match(r.stderr,/Usage/);
});
