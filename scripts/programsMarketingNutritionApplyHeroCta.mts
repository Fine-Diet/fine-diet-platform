/**
 * Surgically add the composition-driven hero CTA to the SAVED Supabase
 * composition for `composition:programs:nutrition` (draft + published).
 *
 * This patches ONLY the hero module's CTA fields (ctaPrimaryLabel/Href +
 * ctaSecondaryLabel/Href). It preserves the existing module order, every other
 * module, the version, and the storage key. No template re-apply, no order
 * changes, no other data writes.
 *
 * The CTA values are sourced from the catalogue's CategoryHero resolution for
 * the nutrition collection so the saved-composition CTA matches the prototype.
 * Once written they live in the composition input space and stay editable from
 * the admin editor (catalogue resolution is the source for THIS seed only).
 *
 * Modes:
 *   snapshot         read-only: print current hero CTA (draft + published)
 *   apply --confirm  write the hero CTA into draft, then published
 *
 * Run:
 *   node --env-file=.env.local --import tsx \
 *     scripts/programsMarketingNutritionApplyHeroCta.mts <mode> [--confirm]
 */

import type { PageComposition } from '@/lib/modules/types';

const SLUG = 'nutrition';
const HERO_TYPE = 'hero.standard.v1';

type LooseModule = { id?: string; type?: string; content?: Record<string, unknown> };
type LooseComposition = { key?: string; version?: number; modules?: LooseModule[] };

interface HeroCta {
  ctaPrimaryLabel: string;
  ctaPrimaryHref: string;
  ctaSecondaryLabel: string;
  ctaSecondaryHref: string;
}

async function resolveHeroCta(): Promise<HeroCta> {
  const { getProgramSeriesBySlug, resolveProgramMarketingCta } = await import(
    '@/lib/programs/programSeriesCatalogue'
  );
  const series = getProgramSeriesBySlug(SLUG);
  if (!series) throw new Error(`nutrition collection not found in catalogue`);
  const cta = resolveProgramMarketingCta({ series });
  if (!cta.label || !cta.href) {
    throw new Error(`resolved nutrition hero CTA is missing label/href: ${JSON.stringify(cta)}`);
  }
  return {
    ctaPrimaryLabel: cta.label,
    ctaPrimaryHref: cta.href,
    ctaSecondaryLabel: cta.secondaryLabel,
    ctaSecondaryHref: cta.secondaryHref,
  };
}

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

function heroOf(modules: LooseModule[] | undefined): LooseModule | undefined {
  if (!Array.isArray(modules)) return undefined;
  return modules.find((m) => m.type === HERO_TYPE || m.id === 'hero');
}

function heroCtaLine(modules: LooseModule[] | undefined): string {
  const hero = heroOf(modules);
  if (!hero) return '    (no hero module found)';
  const c = (hero.content ?? {}) as Record<string, unknown>;
  return [
    `    hero id=${hero.id} type=${hero.type}`,
    `      ctaPrimaryLabel=${JSON.stringify(c.ctaPrimaryLabel)}`,
    `      ctaPrimaryHref=${JSON.stringify(c.ctaPrimaryHref)}`,
    `      ctaSecondaryLabel=${JSON.stringify(c.ctaSecondaryLabel)}`,
    `      ctaSecondaryHref=${JSON.stringify(c.ctaSecondaryHref)}`,
  ].join('\n');
}

async function snapshot(label: string) {
  const draft = await rawComposition('draft');
  const published = await rawComposition('published');
  console.log(`\n== ${label}: composition:programs:nutrition ==`);
  console.log(`  DRAFT      (updated_at=${'updated_at' in draft ? draft.updated_at : '—'}):`);
  console.log(heroCtaLine('data' in draft ? draft.data?.modules : undefined));
  console.log(`  PUBLISHED  (updated_at=${'updated_at' in published ? published.updated_at : '—'}):`);
  console.log(heroCtaLine('data' in published ? published.data?.modules : undefined));
  return { draft, published };
}

/** Read the raw saved composition for a status and return a deep clone with the
 * hero module's CTA fields set. Throws if the row or hero module is missing, or
 * if there is more than one hero (we must patch exactly one). */
function patchHeroCta(raw: LooseComposition, cta: HeroCta): PageComposition {
  const clone = JSON.parse(JSON.stringify(raw)) as LooseComposition;
  const modules = clone.modules ?? [];
  const heroes = modules.filter((m) => m.type === HERO_TYPE || m.id === 'hero');
  if (heroes.length !== 1) {
    throw new Error(`expected exactly 1 hero module, found ${heroes.length}`);
  }
  const hero = heroes[0];
  hero.content = { ...(hero.content ?? {}), ...cta };
  return clone as unknown as PageComposition;
}

async function writeStatus(
  status: 'draft' | 'published',
  cta: HeroCta,
): Promise<{ before: LooseModule[] | undefined; after: PageComposition }> {
  const existing = await rawComposition(status);
  if (!('data' in existing) || !existing.data) {
    throw new Error(`no ${status} composition row to patch`);
  }
  const beforeOrder = existing.data.modules;
  const patched = patchHeroCta(existing.data, cta);

  // Safety: order + count must be unchanged by the patch.
  const beforeIds = (beforeOrder ?? []).map((m) => m.id);
  const afterIds = patched.modules.map((m) => m.id);
  if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) {
    throw new Error(`patch changed module order/count: ${beforeIds} -> ${afterIds}`);
  }

  const a = await import('@/lib/programs/programsMarketingApi');
  const validated = a.validateComposition(patched);
  if (!validated) throw new Error(`${status} patched composition failed validation`);
  if (validated.modules.length !== patched.modules.length) {
    throw new Error(
      `${status} validation dropped modules: ${patched.modules.length} -> ${validated.modules.length}`,
    );
  }
  const r = await a.upsertProgramsMarketingComposition(SLUG, patched, status);
  if (!r.success) throw new Error(`${status} upsert failed: ${r.error}`);
  return { before: beforeOrder, after: patched };
}

function confirm(modules: LooseModule[] | undefined, cta: HeroCta): boolean {
  const hero = heroOf(modules);
  const c = (hero?.content ?? {}) as Record<string, unknown>;
  const checks: Array<[string, boolean]> = [
    ['hero present', Boolean(hero)],
    ['ctaPrimaryLabel', c.ctaPrimaryLabel === cta.ctaPrimaryLabel],
    ['ctaPrimaryHref', c.ctaPrimaryHref === cta.ctaPrimaryHref],
    ['ctaSecondaryLabel', c.ctaSecondaryLabel === cta.ctaSecondaryLabel],
    ['ctaSecondaryHref', c.ctaSecondaryHref === cta.ctaSecondaryHref],
  ];
  let ok = true;
  console.log('\n== CONFIRMATIONS (published hero) ==');
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
  const cta = await resolveHeroCta();

  console.log('Patch hero CTA on saved nutrition composition (draft + published)');
  console.log(`key: ${compositionKey(SLUG)}`);
  console.log(`resolved hero CTA: ${JSON.stringify(cta)}`);

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

    console.log('\n[apply] 1/2 patch DRAFT hero CTA…');
    await writeStatus('draft', cta);
    console.log('[apply] 2/2 patch PUBLISHED hero CTA…');
    await writeStatus('published', cta);

    const after = await snapshot('AFTER');
    const ok = confirm('data' in after.published ? after.published.data?.modules : undefined, cta);
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
