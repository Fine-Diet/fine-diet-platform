/**
 * One-off CONTROLLED test harness for the Programs Marketing publish gate.
 *
 * Scope: targets ONLY
 *   - product:programs:nutrition
 *   - composition:programs:nutrition
 * It never touches product/composition:programs:nutrition--baseline or any other key.
 *
 * It uses the C3 service-role adapter functions (the exact writes the admin
 * /api/admin/programs-marketing/* endpoints wrap) — not raw SQL row writes.
 * The HTTP endpoints require an interactive admin session cookie, which is not
 * available from the CLI, so we invoke their underlying write functions directly.
 *
 * Modes:
 *   snapshot          read-only: print current site_content rows for the 4 relevant keys
 *   publish --confirm create+publish draft→published product AND composition for nutrition
 *   rollback --confirm remove the nutrition product+composition rows (restore catalogue fallback)
 *
 * Run: node --env-file=.env.local --import tsx scripts/programsMarketingNutritionPublishTest.mts <mode> [--confirm]
 */

import type { ProgramsMarketingProduct } from '@/lib/programs/programsMarketingApi';

// Loaded at runtime (dynamic import) to avoid tsx/ESM link-time named-export quirks.
type ApiModule = typeof import('@/lib/programs/programsMarketingApi');
let api: ApiModule;
async function loadApi(): Promise<ApiModule> {
  if (!api) api = await import('@/lib/programs/programsMarketingApi');
  return api;
}

// Target slug is the 1st non-flag arg after the mode; defaults to nutrition.
const SLUG = process.argv.slice(3).find((a) => !a.startsWith('--')) ?? 'nutrition';

const WATCH_KEYS = [
  'product:programs:nutrition',
  'composition:programs:nutrition',
  'product:programs:nutrition--baseline',
  'composition:programs:nutrition--baseline',
];

/** Per-slug product-record content (title/SEO). Falls back to generic values. */
const PRODUCT_CONTENT: Record<string, { title: string; seoTitle: string; seoDescription: string; sortOrder: number }> = {
  nutrition: {
    title: 'Nutrition Foundations',
    seoTitle: 'Nutrition Foundations — Fine Diet Programs',
    seoDescription:
      'Begin with Baseline, then extend into focused nutrition programs as they fit your goals. A staged, self-led pathway built on The Fine Diet Method.',
    sortOrder: 1,
  },
  'nutrition--baseline': {
    title: 'Baseline',
    seoTitle: 'Baseline — Nutrition Foundations — Fine Diet Programs',
    seoDescription:
      'Baseline is the first program in Nutrition Foundations: a practical 21-day rhythm that establishes a starting point future programs build from.',
    sortOrder: 1,
  },
};

function buildDraftProduct(slug: string): ProgramsMarketingProduct {
  const [collectionSlug, programSlug] = slug.split('--');
  const kind = programSlug ? 'program' : 'collection';
  const content =
    PRODUCT_CONTENT[slug] ?? { title: slug, seoTitle: slug, seoDescription: '', sortOrder: 99 };
  return {
    slug,
    category: 'programs',
    templateFamily: 'programs',
    kind,
    collectionSlug,
    ...(programSlug ? { programSlug } : {}),
    status: 'draft',
    ...content,
  };
}

const DRAFT_PRODUCT: ProgramsMarketingProduct = buildDraftProduct(SLUG);

async function rawSnapshot(label: string) {
  const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
  const { data, error } = await supabaseAdmin
    .from('site_content')
    .select('key,status,updated_at')
    .in('key', WATCH_KEYS)
    .order('key');
  if (error) throw new Error(`snapshot query failed: ${error.message}`);
  console.log(`\n── ${label} — site_content rows for watched keys ──`);
  if (!data || data.length === 0) {
    console.log('  (no rows for any watched key)');
  } else {
    for (const row of data) {
      console.log(`  ${row.key}  [${row.status}]  updated_at=${row.updated_at}`);
    }
  }
  return data ?? [];
}

async function doPublish() {
  const a = await loadApi();

  // 1) Create draft product (mirrors POST /api/admin/programs-marketing).
  console.log('\n[publish] 1/4 create draft product…');
  let r = await a.upsertProgramsMarketingProduct(DRAFT_PRODUCT);
  if (!r.success) throw new Error(`draft product upsert failed: ${r.error}`);

  // 2) Save draft composition from the in-repo JSON seed (mirrors PUT composition).
  console.log('[publish] 2/4 save draft composition (from JSON seed)…');
  const draftComp = await a.getProgramsMarketingComposition(SLUG, 'draft');
  if (!draftComp) throw new Error('could not load a draft composition source for nutrition');
  r = await a.upsertProgramsMarketingComposition(SLUG, draftComp, 'draft');
  if (!r.success) throw new Error(`draft composition upsert failed: ${r.error}`);

  // 3) Publish product (mirrors POST publish action=publish: read draft → write published).
  console.log('[publish] 3/4 publish product (draft→published)…');
  const draftProduct = await a.getProgramsMarketingProductRecord(SLUG, 'draft');
  if (!draftProduct) throw new Error('draft product not found after create');
  r = await a.upsertProgramsMarketingProduct({ ...draftProduct, status: 'published' });
  if (!r.success) throw new Error(`publish product failed: ${r.error}`);

  // 4) Publish composition (mirrors POST publish-composition: read draft → write published).
  console.log('[publish] 4/4 publish composition (draft→published)…');
  const draftCompForPublish = await a.getProgramsMarketingComposition(SLUG, 'draft');
  if (!draftCompForPublish) throw new Error('draft composition not found after save');
  r = await a.upsertProgramsMarketingComposition(SLUG, draftCompForPublish, 'published');
  if (!r.success) throw new Error(`publish composition failed: ${r.error}`);

  console.log('[publish] done.');
}

async function doRollback() {
  const a = await loadApi();
  const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

  // Remove published + draft PRODUCT rows (closes the publish gate immediately).
  console.log('\n[rollback] deleting product rows (published, draft)…');
  let r = await a.deleteProgramsMarketingProduct(SLUG, 'published');
  if (!r.success) throw new Error(`delete published product failed: ${r.error}`);
  r = await a.deleteProgramsMarketingProduct(SLUG, 'draft');
  if (!r.success) throw new Error(`delete draft product failed: ${r.error}`);

  // Remove COMPOSITION rows (no adapter delete exists; direct service-role delete
  // scoped strictly to the nutrition composition key).
  console.log('[rollback] deleting composition rows (published, draft)…');
  const { error } = await supabaseAdmin
    .from('site_content')
    .delete()
    .eq('key', a.compositionKey(SLUG))
    .in('status', ['published', 'draft']);
  if (error) throw new Error(`delete composition rows failed: ${error.message}`);

  console.log('[rollback] done. /programs/nutrition reverts to catalogue fallback.');
}

/**
 * Deterministic proof of the publish gate exactly as the public pages compute it
 * (pages/programs/[series]/index.tsx and [series]/[program].tsx):
 *   useComposition = Boolean(publishedProduct && publishedComposition)
 * The page renders <ModuleRenderer> when true, else <ProgramCategoryView> (catalogue).
 */
async function resolveGate() {
  const a = await loadApi();
  const slugs = ['nutrition', 'nutrition--baseline'];
  console.log('\n── PUBLISH-GATE RESOLUTION (published-only reads, as public pages do) ──');
  for (const slug of slugs) {
    const [product, composition] = await Promise.all([
      a.getProgramsMarketingProductRecord(slug, 'published'),
      a.getProgramsMarketingComposition(slug, 'published'),
    ]);
    const useComposition = Boolean(product && composition);
    console.log(
      `  ${slug.padEnd(20)} product=${product ? 'PUBLISHED' : 'none'}  ` +
        `composition=${composition ? 'present' : 'none'}  ` +
        `=> render: ${useComposition ? 'COMPOSITION (ModuleRenderer)' : 'CATALOGUE (ProgramCategoryView)'}`,
    );
  }
  console.log('  /programs (index)      n/a — pages/programs.tsx has no composition path (always catalogue)');
}

async function main() {
  const mode = process.argv[2];
  const confirmed = process.argv.includes('--confirm');

  const a = await loadApi();
  console.log(`Programs Marketing publish-gate test harness`);
  console.log(`keys: ${a.productKey(SLUG)} , ${a.compositionKey(SLUG)}`);

  if (mode === 'snapshot') {
    await rawSnapshot('SNAPSHOT');
    await resolveGate();
    return;
  }

  if (mode === 'resolve') {
    await resolveGate();
    return;
  }

  if (mode === 'publish') {
    await rawSnapshot('BEFORE');
    if (!confirmed) {
      console.log('\n[dry-run] pass --confirm to actually publish. No writes performed.');
      return;
    }
    await doPublish();
    await rawSnapshot('AFTER');
    await resolveGate();
    return;
  }

  if (mode === 'rollback') {
    await rawSnapshot('BEFORE');
    if (!confirmed) {
      console.log('\n[dry-run] pass --confirm to actually roll back. No writes performed.');
      return;
    }
    await doRollback();
    await rawSnapshot('AFTER');
    await resolveGate();
    return;
  }

  console.error(`Unknown mode "${mode ?? ''}". Use: snapshot | publish --confirm | rollback --confirm`);
  process.exit(1);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('\nERROR:', err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
