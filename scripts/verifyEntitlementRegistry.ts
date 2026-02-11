#!/usr/bin/env tsx
/**
 * scripts/verifyEntitlementRegistry.ts
 *
 * Verifies that entitlement keys in lib/access/constants.ts stay aligned
 * with docs/access/ENTITLEMENT-KEY-REGISTRY.md.
 *
 * Usage:  npx tsx scripts/verifyEntitlementRegistry.ts
 *    or:  npm run verify:entitlements
 *
 * Exit 0 = in sync, Exit 1 = drift detected.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

/* ------------------------------------------------------------------ */
/*  1. Extract keys from lib/access/constants.ts                       */
/* ------------------------------------------------------------------ */

function getConstantsKeys(): string[] {
  const filePath = path.join(ROOT, 'lib', 'access', 'constants.ts');
  const src = fs.readFileSync(filePath, 'utf-8');

  // Match lines like:  { key: 'journal', ...
  const keyRegex = /\{\s*key:\s*['"]([^'"]+)['"]/g;
  const keys: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = keyRegex.exec(src)) !== null) {
    keys.push(match[1].trim().toLowerCase());
  }
  return Array.from(new Set(keys)).sort();
}

/* ------------------------------------------------------------------ */
/*  2. Extract keys from docs/access/ENTITLEMENT-KEY-REGISTRY.md       */
/* ------------------------------------------------------------------ */

function getRegistryDocKeys(): string[] {
  const filePath = path.join(ROOT, 'docs', 'access', 'ENTITLEMENT-KEY-REGISTRY.md');
  const src = fs.readFileSync(filePath, 'utf-8');

  // Find the "## Registry Keys (machine-checked)" section
  const sectionStart = src.indexOf('## Registry Keys (machine-checked)');
  if (sectionStart === -1) {
    console.error('ERROR: Could not find "## Registry Keys (machine-checked)" section in registry doc.');
    process.exit(1);
  }

  // Extract lines between this heading and the next heading (## ...)
  const afterSection = src.slice(sectionStart);
  const lines = afterSection.split('\n').slice(1); // skip the heading line

  const keys: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Stop at next heading
    if (trimmed.startsWith('## ')) break;
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('<!--')) continue;
    // Match bullet: "- key"
    const bulletMatch = trimmed.match(/^-\s+(.+)$/);
    if (bulletMatch) {
      const key = bulletMatch[1].trim().toLowerCase();
      if (key) keys.push(key);
    }
  }

  return Array.from(new Set(keys)).sort();
}

/* ------------------------------------------------------------------ */
/*  3. Compare                                                         */
/* ------------------------------------------------------------------ */

function main() {
  console.log('Verifying entitlement key registry alignment...\n');

  const constantsKeys = getConstantsKeys();
  const docKeys = getRegistryDocKeys();

  console.log(`  constants.ts keys: [${constantsKeys.join(', ')}]`);
  console.log(`  registry doc keys: [${docKeys.join(', ')}]\n`);

  const inConstantsOnly = constantsKeys.filter((k) => !docKeys.includes(k));
  const inDocOnly = docKeys.filter((k) => !constantsKeys.includes(k));

  let failed = false;

  if (inConstantsOnly.length > 0) {
    console.error(`  DRIFT: Keys in constants.ts but MISSING from registry doc:`);
    inConstantsOnly.forEach((k) => console.error(`    + ${k}`));
    failed = true;
  }

  if (inDocOnly.length > 0) {
    console.error(`  DRIFT: Keys in registry doc but MISSING from constants.ts:`);
    inDocOnly.forEach((k) => console.error(`    + ${k}`));
    failed = true;
  }

  if (failed) {
    console.error('\nFAILED — update both files to match, then re-run.');
    process.exit(1);
  }

  console.log('OK — constants.ts and registry doc are in sync.');
  process.exit(0);
}

main();
