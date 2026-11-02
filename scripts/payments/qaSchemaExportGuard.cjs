#!/usr/bin/env node
'use strict';
/**
 * Fine Diet production SCHEMA-ONLY export guard.
 * Never connects to the QA database or writes to any database.
 * Requires libpq service + pass files outside Git; no credentials in arguments.
 * The output is a private, unreviewed DDL artifact. It is NOT a restore approval.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const REF = 'tssvlflebugqhtogqdfs';
const SERVICE = 'fine_diet_prod_schema_readonly';
const TABLES_EXPECTED = 117; // Update only after independent read-only catalog review.
const MAX_SECONDS = 180;

function fail(message) { throw new Error(message); }
function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}
function privateFile(envKey) {
  const file = process.env[envKey];
  if (!file || !path.isAbsolute(file)) fail(`${envKey} must be an absolute private file path`);
  const lstat = fs.lstatSync(file);
  if (!lstat.isFile() || lstat.isSymbolicLink() || (lstat.mode & 0o077))
    fail(`${envKey} must be a regular file accessible only to its owner (mode 0600)`);
  return file;
}
function privateDirectory() {
  const candidate = process.env.FD_SCHEMA_EXPORT_DIR;
  if (!candidate || !path.isAbsolute(candidate))
    fail('FD_SCHEMA_EXPORT_DIR must be an absolute existing directory outside the repository');
  const stat = fs.lstatSync(candidate);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077))
    fail('FD_SCHEMA_EXPORT_DIR must be a non-symlink private directory (mode 0700)');
  const dir = fs.realpathSync(candidate);
  const repo = fs.realpathSync(process.cwd());
  if (isInside(repo, dir) || isInside(dir, repo))
    fail('Export directory must be outside and separate from the repository');
  return dir;
}
function readService(file) {
  const sections = new Map();
  let section = null;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const heading = /^\[([A-Za-z0-9_.-]+)\]$/.exec(line);
    if (heading) {
      section = heading[1];
      if (sections.has(section)) fail('Duplicate libpq service section');
      sections.set(section, {});
      continue;
    }
    const field = /^([A-Za-z_]+)\s*=\s*(.*)$/.exec(line);
    if (!field || !section) fail('Invalid libpq service file syntax');
    const cfg = sections.get(section);
    const key = field[1].toLowerCase();
    if (Object.hasOwn(cfg, key)) fail('Duplicate libpq service setting');
    cfg[key] = field[2].trim();
  }
  const cfg = sections.get(SERVICE);
  if (!cfg) fail(`Missing required libpq service section: ${SERVICE}`);
  const allowed = new Set(['host','user','dbname','port','sslmode','sslrootcert','connect_timeout','application_name']);
  if (Object.keys(cfg).some(k => !allowed.has(k)))
    fail('Service contains an unapproved setting; do not store passwords or overrides in the service file');
  const direct = cfg.host === `db.${REF}.supabase.co` && cfg.user === 'postgres';
  const pooler = /^[-A-Za-z0-9.]+\.pooler\.supabase\.com$/.test(cfg.host || '') &&
    cfg.user === `postgres.${REF}`;
  if (!direct && !pooler) fail('Service host and user do not identify the approved Fine Diet production project');
  if (cfg.dbname !== 'postgres' || cfg.port !== '5432') fail('Service must use the postgres database and port 5432');
  if (!['require','verify-ca','verify-full'].includes(cfg.sslmode)) fail('Service must enable TLS');
  return cfg;
}
function safeChildEnv(serviceFile, passFile) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('PG')) delete env[k];
  env.PGSERVICEFILE = serviceFile;
  env.PGPASSFILE = passFile;
  env.PGSERVICE = SERVICE;
  env.PGCONNECT_TIMEOUT = '8';
  return env;
}
function command(name, args, env, timeoutMs = 12000) {
  const r = spawnSync(name, args, {
    env, cwd: os.tmpdir(), encoding:'utf8', timeout:timeoutMs, maxBuffer:1024*1024,
    stdio:['ignore','pipe','pipe'], windowsHide:true,
  });
  // Never print command stderr, which can contain connection details.
  if (r.error || r.status !== 0) fail(`${name} did not complete successfully; inspect privately on the trusted machine`);
  return r.stdout.trim();
}
function checkVersions(env) {
  for (const name of ['psql','pg_dump']) {
    const version = command(name, ['--version'], env, 5000);
    const m = /\b(\d+)\.(\d+)\b/.exec(version);
    if (!m || Number(m[1]) !== 17) fail(`${name} must be PostgreSQL major version 17`);
  }
}
const SOURCE_QUERY = `SELECT
  current_setting('server_version_num')::integer || '|' ||
  (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
    WHERE n.nspname='public' AND c.relkind IN ('r','p'))::text || '|' ||
  (to_regclass('public.people') IS NOT NULL)::text || '|' ||
  (to_regnamespace('programs_private') IS NOT NULL)::text;`;
function verifySource(env) {
  const r = command('psql', ['-X','--no-password','--no-psqlrc','--dbname',`service=${SERVICE}`,
    '--tuples-only','--no-align','--command',SOURCE_QUERY], env, 20000);
  const m = /^(\d+)\|(\d+)\|(true|false|t|f)\|(true|false|t|f)$/.exec(r);
  if (!m || Number(m[1]) < 170000 || Number(m[1]) >= 180000 || Number(m[2]) !== TABLES_EXPECTED ||
      !['true','t'].includes(m[3]) || !['true','t'].includes(m[4]))
    fail('Read-only source identity/schema inventory does not match the approved production baseline');
}
function validateDump(sql) {
  if (Buffer.byteLength(sql, 'utf8') < 25000) fail('Schema export unexpectedly small');
  const count = (sql.match(/^CREATE TABLE (?:IF NOT EXISTS )?public\./gm) || []).length;
  if (count < 100) fail('Schema export missing too many public table definitions');
  if (!/^CREATE TABLE (?:IF NOT EXISTS )?public\.people\b/m.test(sql) ||
      !/^CREATE TABLE (?:IF NOT EXISTS )?public\.offers\b/m.test(sql))
    fail('Schema export missing required application tables');
  if (!/^(CREATE SCHEMA programs_private|CREATE (?:OR REPLACE )?FUNCTION programs_private\.)\b/m.test(sql))
    fail('Schema export missing required private program schema');
  if (/^\s*COPY\s+(?:public|programs_private)\./mi.test(sql) ||
      /^\s*\\copy\b/mi.test(sql)) fail('Schema artifact contains unexpected COPY statement');
  if (/^CREATE (?:ROLE|USER)\b/mi.test(sql) ||
      /^ALTER (?:ROLE|USER)\s+\S+\s+(?:WITH\s+)?PASSWORD\b/mi.test(sql))
    fail('Schema artifact contains unexpected role or password statements');
  if (/^CREATE TABLE (?:auth|storage)\./mi.test(sql))
    fail('Schema artifact unexpectedly includes a Supabase-managed table');
  return count;
}
function main() {
  const mode = process.argv[2] || '--preflight';
  if (!['--preflight','--export'].includes(mode) || process.argv.length > 3)
    fail('Usage: node qaSchemaExportGuard.cjs [--preflight|--export]');
  if (process.env.PGPASSWORD) fail('PGPASSWORD is forbidden; use a private PGPASSFILE');
  const serviceFile = privateFile('PGSERVICEFILE');
  const passFile = privateFile('PGPASSFILE');
  const dir = privateDirectory();
  readService(serviceFile);
  const env = safeChildEnv(serviceFile, passFile);
  checkVersions(env);
  if (mode === '--preflight') {
    console.log('PASS local config, identity pin and CLI preflight; NO DATABASE CONNECTION OR EXPORT');
    return;
  }
  verifySource(env);
  const work = fs.mkdtempSync(path.join(dir, 'fine-diet-schema-only-'));
  fs.chmodSync(work, 0o700);
  try {
    const dumpFile = path.join(work,'schema.sql');
    command('pg_dump', [
      '--dbname',`service=${SERVICE}`, '--no-password', '--schema-only',
      '--schema=public','--schema=programs_private','--no-owner',
      '--file',dumpFile,
    ], env, MAX_SECONDS*1000);
    if (!fs.existsSync(dumpFile)) fail('pg_dump produced no schema file');
    fs.chmodSync(dumpFile,0o600);
    const sql = fs.readFileSync(dumpFile,'utf8');
    const count=validateDump(sql);
    const sha256=crypto.createHash('sha256').update(sql,'utf8').digest('hex');
    const manifest={kind:'Fine Diet schema-only candidate, NOT approved for restore',
      source_project_ref:REF,schemas:['public','programs_private'],
      exported_at:new Date().toISOString(),sha256,
      bytes:Buffer.byteLength(sql,'utf8'),public_table_create_count:count,
      requires_manual_review:true};
    const mf=path.join(work,'manifest.json');
    fs.writeFileSync(mf, JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
    console.log(`PASS schema-only export into private local directory; SHA-256 ${sha256}; NOT RESTORED`);
    console.log('Manual DDL, dependency, extension, grants and secrets review is required before QA restore.');
  } catch(error) {
    fs.rmSync(work,{recursive:true,force:true});
    throw error;
  }
}
try { main(); } catch(e) { console.error(`STOP ${e.message}`); process.exitCode=1; }
