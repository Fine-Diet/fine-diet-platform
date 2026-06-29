/**
 * Surgically add the composition-driven app-integration CTA to the SAVED Supabase
 * composition for `composition:programs:nutrition` (draft + published).
 *
 * Patches ONLY the `app-integration` module's CTA fields (ctaLabel/ctaHref/ctaTone).
 * Preserves module order, every other module, version, and storage key.
 *
 * Modes:
 *   snapshot         read-only: print current app-integration CTA (draft + published)
 *   apply --confirm  write the CTA into draft, then published
 *
 * Run:
 *   node --env-file=.env.local --import tsx \
 *     scripts/programsMarketingNutritionApplyAppIntegrationCta.mts <mode> [--confirm]
 */

import type { PageComposition } from '@/lib/modules/types';

const SLUG = 'nutrition';
const MODULE_ID = 'app-integration';
const MODULE_TYPE = 'feature.reasons-split.v1';

type LooseModule = { id?: string; type?: string; content?: Record<string, unknown> };
type LooseComposition = { key?: string; version?: number; modules?: LooseModule[] };

interface AppIntegrationCta {
  ctaLabel: string;
  ctaHref: string;
  ctaTone: 'denim' | 'brand';
}

const TARGET_CTA: AppIntegrationCta = {
  ctaLabel: 'Start with Baseline',
  ctaHref: '/programs/nutrition/baseline',
  ctaTone: 'denim',
};

async function rawComposition(status: 'draft' | 'published') {
  const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
  const { compositionKey } = await import('@/lib/programs/programsMarketingApi');
  const { data, error } = await supabaseAdmin
    .from('site_content')
    .select('data,updated_at')
    .eq('key', compositionKey(SLUG))
    .eq('status', status)
    .maybeSingle();
  if (error) throw new Error(`read ${status} composition failed: ${error.message}`);
  return data
    ? { data: data.data as LooseComposition, updated_at: data.updated_at }
    : { missing: true as const };
}

function appIntegrationOf(modules: LooseModule[] | undefined): LooseModule | undefined {
  if (!Array.isArray(modules)) return undefined;
  return modules.find((m) => m.id === MODULE_ID || m.type === MODULE_TYPE);
}

function ctaLine(modules: LooseModule[] | undefined): string {
  const mod = appIntegrationOf(modules);
  if (!mod) return '    (no app-integration module found)';
  const c = (mod.content ?? {}) as Record<string, unknown>;
  return [
    `    app-integration id=${mod.id} type=${mod.type}`,
    `      ctaLabel=${JSON.stringify(c.ctaLabel)}`,
    `      ctaHref=${JSON.stringify(c.ctaHref)}`,
    `      ctaTone=${JSON.stringify(c.ctaTone)}`,
  ].join('\n');
}

async function snapshot(label: string) {
  const draft = await rawComposition('draft');
  const published = await rawComposition('published');
  console.log(`\n== ${label}: composition:programs:nutrition ==`);
  console.log(`  DRAFT      (updated_at=${'updated_at' in draft ? draft.updated_at : '—'}):`);
  console.log(ctaLine('data' in draft ? draft.data?.modules : undefined));
  console.log(`  PUBLISHED  (updated_at=${'updated_at' in published ? published.updated_at : '—'}):`);
  console.log(ctaLine('data' in published ? published.data?.modules : undefined));
  return { draft, published };
}

function patchAppIntegrationCta(raw: LooseComposition, cta: AppIntegrationCta): PageComposition {
  const clone = JSON.parse(JSON.stringify(raw)) as LooseComposition;
  const modules = clone.modules ?? [];
  const matches = modules.filter((m) => m.id === MODULE_ID || m.type === MODULE_TYPE);
  if (matches.length !== 1) {
    throw new Error(`expected exactly 1 app-integration module, found ${matches.length}`);
  }
  const mod = matches[0];
  mod.content = { ...(mod.content ?? {}), ...cta };
  return clone as unknown as PageComposition;
}

async function writeStatus(
  status: 'draft' | 'published',
  cta: AppIntegrationCta,
): Promise<{ before: LooseModule[] | undefined; after: PageComposition }> {
  const existing = await rawComposition(status);
  if (!('data' in existing) || !existing.data) {
    throw new Error(`no ${status} composition row to patch`);
  }
  const beforeOrder = existing.data.modules;
  const patched = patchAppIntegrationCta(existing.data, cta);

  const beforeIds = (beforeOrder ?? []).map((m) => m.id);
  const afterIds = patched.modules.map((m) => m.id);
  if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) {
    throw new Error(`patch changed module order/count: ${beforeIds} -> ${afterIds}`);
  }

  const { featureReasonsSplitV1Schema } = await import('@/lib/modules/schema');
  const appMod = appIntegrationOf(patched.modules);
  const contentResult = featureReasonsSplitV1Schema.safeParse(appMod?.content);
  if (!contentResult.success) {
    throw new Error(`${status} app-integration content failed schema: ${contentResult.error.message}`);
  }

  const a = await import('@/lib/programs/programsMarketingApi');
  if (status === 'published') {
    const validated = a.validateComposition(patched);
    if (!validated) throw new Error(`${status} patched composition failed validation`);
    if (validated.modules.length !== patched.modules.length) {
      throw new Error(
        `${status} validation dropped modules: ${patched.modules.length} -> ${validated.modules.length}`,
      );
    }
    const r = await a.upsertProgramsMarketingComposition(SLUG, validated, status);
    if (!r.success) throw new Error(`${status} upsert failed: ${r.error}`);
    return { before: beforeOrder, after: validated };
  }

  // Draft may carry extra editor modules that fail full read-path validation;
  // this patch only touches app-integration CTA fields and preserves the raw row.
  const r = await a.upsertProgramsMarketingComposition(SLUG, patched, status);
  if (!r.success) throw new Error(`${status} upsert failed: ${r.error}`);
  return { before: beforeOrder, after: patched };
}

function confirm(modules: LooseModule[] | undefined, cta: AppIntegrationCta): boolean {
  const mod = appIntegrationOf(modules);
  const c = (mod?.content ?? {}) as Record<string, unknown>;
  const checks: Array<[string, boolean]> = [
    ['app-integration present', Boolean(mod)],
    ['ctaLabel', c.ctaLabel === cta.ctaLabel],
    ['ctaHref', c.ctaHref === cta.ctaHref],
    ['ctaTone', c.ctaTone === cta.ctaTone],
  ];
  let ok = true;
  console.log('\n== CONFIRMATIONS (published app-integration) ==');
  for (const [name, pass] of checks) {
    if (!pass) ok = false;
    console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}`);
  }
  return ok;
}

async function main() {
  const mode = process.argv[2];
  const confirmed = process.argv.includes('--confirm');
  const { compositionKey } = await import('@/lib/programs/programsMarketingApi');

  console.log('Patch app-integration CTA on saved nutrition composition (draft + published)');
  console.log(`key: ${compositionKey(SLUG)}`);
  console.log(`target CTA: ${JSON.stringify(TARGET_CTA)}`);

  if (mode === 'snapshot') {
    await snapshot('SNAPSHOT');
    return;
  }

  if (mode === 'apply') {
    await snapshot('BEFORE');

    if (!confirmed) {
      console.log('\n[dry-run] pass --confirm to write draft + published. No writes performed.');
      return;
    }

    console.log('\n[apply] 1/2 patch DRAFT app-integration CTA…');
    await writeStatus('draft', TARGET_CTA);
    console.log('[apply] 2/2 patch PUBLISHED app-integration CTA…');
    await writeStatus('published', TARGET_CTA);

    const after = await snapshot('AFTER');
    const ok = confirm(
      'data' in after.published ? after.published.data?.modules : undefined,
      TARGET_CTA,
    );
    console.log(`\n[apply] done. confirmations: ${ok ? 'ALL PASS' : 'SOME FAILED'}`);
    if (!ok) process.exit(2);
    return;
  }

  console.error(`Unknown mode "${mode ?? ''}". Use: snapshot | apply [--confirm]`);
  process.exit(1);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('\nERROR:', err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
