#!/usr/bin/env tsx
/**
 * Baseline Readiness X6.1 — mechanical copyVersion republish (v1-test-candidate → v1)
 *
 * Creates and publishes new CMS revisions for all three result packs. Only
 * copyVersion changes; all other approved fields are copied from the current
 * published revision.
 *
 * Usage:
 *   npm run assessments:baseline-readiness:x6-1-republish
 *   npm run assessments:baseline-readiness:x6-1-republish -- --dry-run
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local).
 * Does not change registry, SEO, sitemap, artifacts, or question set.
 */

import * as fs from 'fs';
import * as path from 'path';

import { loadEnvConfig } from '@next/env';

import { BASELINE_READINESS_RESULT_LEVELS } from '@/lib/assessments/baselineReadiness/constants';
import { hashPackJson, validateResultsPack } from '@/lib/resultsPack/validateResultsPack';

const PACKS: Record<
  (typeof BASELINE_READINESS_RESULT_LEVELS)[number],
  { packId: string }
> = {
  'readiness-low': { packId: '1e4ab583-218b-496a-9669-24d8cbdd81f9' },
  'readiness-building': { packId: 'c9fe2037-1bad-4425-85b2-03878633d0a5' },
  'readiness-ready': { packId: 'e84a7e1f-cc93-465c-8463-7bba7fa5e3fe' },
};

const TARGET_COPY_VERSION = 'v1';
const CHANGE_SUMMARY =
  'X6.1 mechanical copyVersion bump v1-test-candidate → v1 (founder-approved launch content)';
const ACTOR_ID = 'ad4805d2-b9ec-4bb8-a9a1-f50e5bed9d9b';

interface RepublishResult {
  levelId: string;
  packId: string;
  beforeRevisionId: string | null;
  beforeRevisionNumber: number | null;
  beforeCopyVersion: string | null;
  afterRevisionId?: string;
  afterRevisionNumber?: number;
  afterCopyVersion?: string;
  status: 'pass' | 'fail' | 'skipped';
  detail: string;
}

function parseDryRun(argv: string[]): boolean {
  return argv.includes('--dry-run');
}

async function republishLevel(
  levelId: (typeof BASELINE_READINESS_RESULT_LEVELS)[number],
  dryRun: boolean,
  supabaseAdmin: Awaited<ReturnType<typeof loadSupabaseAdmin>>
): Promise<RepublishResult> {
  const { packId } = PACKS[levelId];

  const { data: pointer, error: pointerErr } = await supabaseAdmin
    .from('results_pack_pointers')
    .select('published_revision_id')
    .eq('pack_id', packId)
    .maybeSingle();

  if (pointerErr || !pointer?.published_revision_id) {
    return {
      levelId,
      packId,
      beforeRevisionId: null,
      beforeRevisionNumber: null,
      beforeCopyVersion: null,
      status: 'fail',
      detail: pointerErr?.message ?? 'No published revision pointer',
    };
  }

  const { data: publishedRev, error: revErr } = await supabaseAdmin
    .from('results_pack_revisions')
    .select('id, revision_number, content_json')
    .eq('id', pointer.published_revision_id)
    .single();

  if (revErr || !publishedRev) {
    return {
      levelId,
      packId,
      beforeRevisionId: pointer.published_revision_id,
      beforeRevisionNumber: null,
      beforeCopyVersion: null,
      status: 'fail',
      detail: revErr?.message ?? 'Published revision not found',
    };
  }

  const beforeCopyVersion =
    typeof publishedRev.content_json?.copyVersion === 'string'
      ? publishedRev.content_json.copyVersion
      : null;

  if (beforeCopyVersion === TARGET_COPY_VERSION) {
    return {
      levelId,
      packId,
      beforeRevisionId: publishedRev.id,
      beforeRevisionNumber: publishedRev.revision_number,
      beforeCopyVersion,
      afterRevisionId: publishedRev.id,
      afterRevisionNumber: publishedRev.revision_number,
      afterCopyVersion: beforeCopyVersion,
      status: 'skipped',
      detail: 'Already at copyVersion v1',
    };
  }

  const nextContent = {
    ...publishedRev.content_json,
    copyVersion: TARGET_COPY_VERSION,
  };

  const validation = validateResultsPack(nextContent);
  if (!validation.ok || !validation.normalized) {
    return {
      levelId,
      packId,
      beforeRevisionId: publishedRev.id,
      beforeRevisionNumber: publishedRev.revision_number,
      beforeCopyVersion,
      status: 'fail',
      detail: `Validation failed: ${validation.errors.join('; ')}`,
    };
  }

  const content_hash = hashPackJson(validation.normalized);
  const nextRevNumber = publishedRev.revision_number + 1;

  if (dryRun) {
    return {
      levelId,
      packId,
      beforeRevisionId: publishedRev.id,
      beforeRevisionNumber: publishedRev.revision_number,
      beforeCopyVersion,
      afterRevisionNumber: nextRevNumber,
      afterCopyVersion: TARGET_COPY_VERSION,
      status: 'pass',
      detail: 'Dry-run OK — would create and publish revision',
    };
  }

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('results_pack_revisions')
    .insert({
      pack_id: packId,
      revision_number: nextRevNumber,
      status: 'draft',
      schema_version: 'v2_pack_schema_1',
      content_json: validation.normalized,
      content_hash,
      change_summary: CHANGE_SUMMARY,
      validation_errors: null,
      created_by: ACTOR_ID,
    })
    .select('id, revision_number')
    .single();

  if (insertErr || !inserted) {
    return {
      levelId,
      packId,
      beforeRevisionId: publishedRev.id,
      beforeRevisionNumber: publishedRev.revision_number,
      beforeCopyVersion,
      status: 'fail',
      detail: insertErr?.message ?? 'Insert failed',
    };
  }

  const { error: ptrErr } = await supabaseAdmin.from('results_pack_pointers').upsert({
    pack_id: packId,
    published_revision_id: inserted.id,
    preview_revision_id: null,
    updated_by: ACTOR_ID,
  });

  if (ptrErr) {
    return {
      levelId,
      packId,
      beforeRevisionId: publishedRev.id,
      beforeRevisionNumber: publishedRev.revision_number,
      beforeCopyVersion,
      afterRevisionId: inserted.id,
      afterRevisionNumber: inserted.revision_number,
      status: 'fail',
      detail: `Revision created but publish pointer failed: ${ptrErr.message}`,
    };
  }

  return {
    levelId,
    packId,
    beforeRevisionId: publishedRev.id,
    beforeRevisionNumber: publishedRev.revision_number,
    beforeCopyVersion,
    afterRevisionId: inserted.id,
    afterRevisionNumber: inserted.revision_number,
    afterCopyVersion: TARGET_COPY_VERSION,
    status: 'pass',
    detail: 'Revision created and published',
  };
}

async function loadSupabaseAdmin() {
  const mod = await import('@/lib/supabaseServerClient');
  return mod.supabaseAdmin;
}

async function main() {
  loadEnvConfig(process.cwd());
  const dryRun = parseDryRun(process.argv.slice(2));
  const supabaseAdmin = await loadSupabaseAdmin();
  const results: RepublishResult[] = [];

  for (const levelId of BASELINE_READINESS_RESULT_LEVELS) {
    results.push(await republishLevel(levelId, dryRun, supabaseAdmin));
  }

  const report = {
    packet: 'ec45dc1f-5c44-4695-953c-2b9c08b43586',
    dryRun,
    timestamp: new Date().toISOString(),
    results,
  };

  const outDir = path.join(process.cwd(), '.reports/assessments');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(outDir, `baseline-readiness-x6-1-republish-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nReport: ${reportPath}`);

  const failed = results.some((r) => r.status === 'fail');
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
