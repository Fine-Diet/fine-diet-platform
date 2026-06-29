/**
 * Apply the "Nutrition Foundations page (preview parity)" template to the SAVED
 * Supabase composition for `composition:programs:nutrition`.
 *
 * This mirrors the admin editor flow (apply template -> save draft -> publish)
 * using the exact service-role adapter functions the
 * /api/admin/programs-marketing/* endpoints wrap — NOT raw SQL row writes.
 *
 * Scope: targets ONLY `composition:programs:nutrition` (draft + published).
 * It never touches composition:programs:nutrition--baseline, the product rows,
 * or any other key.
 *
 * Modes:
 *   snapshot         read-only: print draft + published module ids and gate
 *   apply --confirm  write draft, then published, from the preview-parity template
 *
 * Run:
 *   node --env-file=.env.local --import tsx \
 *     scripts/programsMarketingNutritionApplyPreviewTemplate.mts <mode> [--confirm]
 */

import type { PageComposition } from '@/lib/modules/types';

const SLUG = 'nutrition';
const TEMPLATE_ID = 'programs-nutrition-foundations-preview';

type LooseModule = { id?: string; type?: string; content?: Record<string, unknown> };

function moduleLines(modules: LooseModule[] | undefined): string[] {
  if (!Array.isArray(modules)) return ['    (no modules / not an array)'];
  if (modules.length === 0) return ['    (empty)'];
  return modules.map(
    (m, i) => `    ${String(i + 1).padStart(2)}. id=${m.id ?? '?'}  type=${m.type ?? '?'}`,
  );
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
    ? { data: data.data as { key?: string; version?: number; modules?: LooseModule[] }, updated_at: data.updated_at }
    : { missing: true as const };
}

async function snapshot(label: string) {
  const draft = await rawComposition('draft');
  const published = await rawComposition('published');
  console.log(`\n== ${label}: composition:programs:nutrition ==`);
  console.log(`  DRAFT      (updated_at=${'updated_at' in draft ? draft.updated_at : '—'}):`);
  moduleLines('data' in draft ? draft.data?.modules : undefined).forEach((l) => console.log(l));
  console.log(`  PUBLISHED  (updated_at=${'updated_at' in published ? published.updated_at : '—'}):`);
  moduleLines('data' in published ? published.data?.modules : undefined).forEach((l) => console.log(l));
  return { draft, published };
}

async function buildCompositionFromTemplate(): Promise<PageComposition> {
  const { getProgramsCompositionTemplate } = await import('@/lib/modules/compositionTemplates');
  const { compositionKey } = await import('@/lib/programs/programsMarketingApi');
  const template = getProgramsCompositionTemplate(TEMPLATE_ID);
  if (!template) throw new Error(`template ${TEMPLATE_ID} not found`);

  // Preserve the existing version if present (else default to 1), keep the stable
  // storage key. Use the template's own module ids (clean, no timestamp suffix)
  // so the saved order reads exactly as the documented preview-parity order.
  const existingPublished = await rawComposition('published');
  const version =
    ('data' in existingPublished && typeof existingPublished.data?.version === 'number'
      ? existingPublished.data.version
      : 1) ?? 1;

  return {
    key: compositionKey(SLUG),
    version,
    modules: template.modules.map((m) => ({
      id: m.id,
      type: m.type,
      // Deep clone so we never share references with the registry object.
      content: JSON.parse(JSON.stringify(m.content)),
    })),
  } as PageComposition;
}

function runRequiredConfirmations(modules: LooseModule[] | undefined) {
  const mods = Array.isArray(modules) ? modules : [];
  const ids = mods.map((m) => m.id);
  const byId = (id: string) => mods.find((m) => m.id === id);
  const expectedOrder = [
    'hero',
    'how-it-works',
    'intro',
    'program-sequence',
    'marquee',
    'differentiators',
    'app-integration',
    'comparison',
    'faq',
    'final-cta',
  ];

  const checks: Array<{ name: string; pass: boolean; detail: string }> = [];

  checks.push({
    name: 'order matches expected',
    pass: JSON.stringify(ids) === JSON.stringify(expectedOrder),
    detail: ids.join(' -> '),
  });

  const howItWorks = byId('how-it-works');
  checks.push({
    name: 'how-it-works is process.timed-steps.v1',
    pass: howItWorks?.type === 'process.timed-steps.v1',
    detail: `type=${howItWorks?.type ?? 'MISSING'}`,
  });

  const heroIdx = ids.indexOf('hero');
  const howIdx = ids.indexOf('how-it-works');
  const between = ids.slice(heroIdx + 1, howIdx);
  const noCollectionCta = !mods.some((m) => m.type === 'cta.collection' || m.id === 'collection-cta');
  checks.push({
    name: 'no collection-cta between hero and how-it-works',
    pass: heroIdx >= 0 && howIdx > heroIdx && between.length === 0 && noCollectionCta,
    detail: `between=[${between.join(', ')}]`,
  });

  checks.push({
    name: 'intro exists after how-it-works',
    pass: ids.indexOf('intro') > howIdx && howIdx >= 0,
    detail: `introIdx=${ids.indexOf('intro')} howIdx=${howIdx}`,
  });

  const seq = byId('program-sequence');
  const seqKeys = seq?.content ? Object.keys(seq.content) : [];
  checks.push({
    name: 'program-sequence has only collectionSlug: nutrition',
    pass:
      seqKeys.length === 1 &&
      seqKeys[0] === 'collectionSlug' &&
      (seq?.content as Record<string, unknown>)?.collectionSlug === 'nutrition',
    detail: `content keys=[${seqKeys.join(', ')}] collectionSlug=${(seq?.content as Record<string, unknown>)?.collectionSlug}`,
  });

  const app = byId('app-integration');
  checks.push({
    name: 'app-integration heading is "Built into the Fine Diet App"',
    pass: (app?.content as Record<string, unknown>)?.heading === 'Built into the Fine Diet App',
    detail: `heading=${JSON.stringify((app?.content as Record<string, unknown>)?.heading)}`,
  });

  const faq = byId('faq');
  checks.push({
    name: 'FAQ title is "FAQs"',
    pass: (faq?.content as Record<string, unknown>)?.title === 'FAQs',
    detail: `title=${JSON.stringify((faq?.content as Record<string, unknown>)?.title)}`,
  });

  console.log('\n== REQUIRED CONFIRMATIONS (published composition) ==');
  let allPass = true;
  for (const c of checks) {
    if (!c.pass) allPass = false;
    console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name}  (${c.detail})`);
  }
  return allPass;
}

async function resolveGate() {
  const a = await import('@/lib/programs/programsMarketingApi');
  const [product, composition] = await Promise.all([
    a.getProgramsMarketingProductRecord(SLUG, 'published'),
    a.getProgramsMarketingComposition(SLUG, 'published'),
  ]);
  const useComposition = Boolean(product && composition);
  console.log('\n== PUBLISH-GATE RESOLUTION (published-only, as /programs/nutrition reads) ==');
  console.log(
    `  product=${product ? 'PUBLISHED' : 'none'}  composition=${composition ? `present (${composition.modules.length} modules)` : 'none'}  ` +
      `=> render: ${useComposition ? 'COMPOSITION (ModuleRenderer)' : 'CATALOGUE (ProgramCategoryView)'}`,
  );
  if (composition) {
    console.log('  validated published module order:');
    moduleLines(composition.modules as LooseModule[]).forEach((l) => console.log(l));
  }
}

async function main() {
  const mode = process.argv[2];
  const confirmed = process.argv.includes('--confirm');
  const { compositionKey } = await import('@/lib/programs/programsMarketingApi');
  console.log('Apply preview-parity template to saved nutrition composition');
  console.log(`key: ${compositionKey(SLUG)}   template: ${TEMPLATE_ID}`);

  if (mode === 'snapshot') {
    await snapshot('SNAPSHOT');
    await resolveGate();
    return;
  }

  if (mode === 'apply') {
    await snapshot('BEFORE');

    const composition = await buildCompositionFromTemplate();

    // Safety: confirm the template validates with zero dropped modules.
    const a = await import('@/lib/programs/programsMarketingApi');
    const validated = a.validateComposition(composition);
    const rawCount = composition.modules.length;
    const vCount = validated ? validated.modules.length : 0;
    console.log(
      `\n[validate] template modules=${rawCount} -> validated=${vCount}` +
        (rawCount !== vCount ? `  (DROPPED ${rawCount - vCount}!)` : '  (0 dropped)'),
    );
    if (rawCount !== vCount) throw new Error('template produced invalid modules; aborting');

    if (!confirmed) {
      console.log('\n[dry-run] pass --confirm to write draft + published. No writes performed.');
      console.log('[dry-run] composition that WOULD be written:');
      moduleLines(composition.modules as LooseModule[]).forEach((l) => console.log(l));
      return;
    }

    console.log('\n[apply] 1/2 save DRAFT composition…');
    let r = await a.upsertProgramsMarketingComposition(SLUG, composition, 'draft');
    if (!r.success) throw new Error(`draft upsert failed: ${r.error}`);

    console.log('[apply] 2/2 publish (write PUBLISHED composition)…');
    r = await a.upsertProgramsMarketingComposition(SLUG, composition, 'published');
    if (!r.success) throw new Error(`published upsert failed: ${r.error}`);

    const after = await snapshot('AFTER');
    const allPass = runRequiredConfirmations(
      'data' in after.published ? after.published.data?.modules : undefined,
    );
    await resolveGate();
    console.log(`\n[apply] done. required confirmations: ${allPass ? 'ALL PASS' : 'SOME FAILED'}`);
    if (!allPass) process.exit(2);
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
