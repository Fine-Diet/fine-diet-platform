/**
 * READ-ONLY audit of the nutrition Programs Marketing records.
 * No writes. Dumps product + draft/published composition module lists, compares
 * against the in-repo seed, and flags registry/schema support + color-ish fields.
 *
 * Run: node --env-file=.env.local --import tsx scripts/inspectProgramsNutritionComposition.mts
 */

const SLUG = 'nutrition';
const COLOR_FIELDS = ['surface', 'theme', 'color', 'background', 'bg', 'tone', 'variant', 'mode'];

type LooseModule = { id?: string; type?: string; content?: Record<string, unknown> };

function moduleLines(modules: LooseModule[] | undefined): string[] {
  if (!Array.isArray(modules)) return ['  (modules is not an array!)'];
  return modules.map((m, i) => {
    const colour = COLOR_FIELDS.filter((f) => m.content && f in (m.content as object))
      .map((f) => `${f}=${JSON.stringify((m.content as Record<string, unknown>)[f])}`)
      .join(' ');
    return `  ${String(i + 1).padStart(2)}. id=${m.id ?? '?'}  type=${m.type ?? '?'}` + (colour ? `   [${colour}]` : '');
  });
}

async function rawRow(supabaseAdmin: any, key: string, status: string) {
  const { data, error } = await supabaseAdmin
    .from('site_content')
    .select('data,updated_at')
    .eq('key', key)
    .eq('status', status)
    .maybeSingle();
  if (error) return { error: error.message };
  return data ? { data: data.data, updated_at: data.updated_at } : { missing: true };
}

async function main() {
  const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
  const { MODULE_CONTENT_SCHEMAS } = await import('@/lib/modules/schema');
  const schemaed = new Set(Object.keys(MODULE_CONTENT_SCHEMAS));
  // registry import pulls in TSX components (+ CSS) which the standalone runtime
  // can't parse; registry keys are audited separately via static grep.
  const registered = schemaed;

  console.log('SCHEMA-SUPPORTED MODULE TYPES:', [...schemaed].sort().join(', '));

  // Product
  const prodPub = await rawRow(supabaseAdmin, `product:programs:${SLUG}`, 'published');
  const prodDraft = await rawRow(supabaseAdmin, `product:programs:${SLUG}`, 'draft');
  console.log('\n=== product:programs:nutrition ===');
  console.log('  published:', JSON.stringify(prodPub.data ?? prodPub));
  console.log('  draft    :', JSON.stringify(prodDraft.data ?? prodDraft));

  // Compositions
  const compDraft = await rawRow(supabaseAdmin, `composition:programs:${SLUG}`, 'draft');
  const compPub = await rawRow(supabaseAdmin, `composition:programs:${SLUG}`, 'published');

  const seed = (await import('@/data/compositions/programs--nutrition.json')).default as {
    modules: LooseModule[];
  };

  console.log('\n=== SEED (data/compositions/programs--nutrition.json) ===  updated_at=n/a');
  moduleLines(seed.modules).forEach((l) => console.log(l));

  console.log(`\n=== composition DRAFT ===  updated_at=${compDraft.updated_at ?? '—'}`);
  moduleLines((compDraft.data as { modules?: LooseModule[] })?.modules).forEach((l) => console.log(l));

  console.log(`\n=== composition PUBLISHED ===  updated_at=${compPub.updated_at ?? '—'}`);
  moduleLines((compPub.data as { modules?: LooseModule[] })?.modules).forEach((l) => console.log(l));

  // Registry / schema support audit across all module types seen
  const seen = new Map<string, number>();
  for (const src of [seed.modules, (compDraft.data as any)?.modules, (compPub.data as any)?.modules]) {
    if (Array.isArray(src)) for (const m of src) if (m?.type) seen.set(m.type, (seen.get(m.type) ?? 0) + 1);
  }
  console.log('\n=== MODULE TYPE SUPPORT (across seed/draft/published) ===');
  for (const t of [...seen.keys()].sort()) {
    console.log(`  ${t.padEnd(28)} registry=${registered.has(t) ? 'yes' : 'NO'}  schema=${schemaed.has(t) ? 'yes' : 'NO'}`);
  }

  // Validate each composition through the public read-path validator (drops invalid modules)
  const { validateComposition } = await import('@/lib/programs/programsMarketingApi');
  const rows = [{ label: 'DRAFT', row: compDraft }, { label: 'PUBLISHED', row: compPub }];
  for (const entry of rows) {
    const raw = entry.row.data;
    if (!raw) { console.log('\n[validateComposition ' + entry.label + '] (missing row)'); continue; }
    const rawModules = Array.isArray(raw.modules) ? raw.modules : [];
    const rawCount = rawModules.length;
    const validated = validateComposition(raw);
    const vCount = validated ? validated.modules.length : 0;
    console.log('\n[validateComposition ' + entry.label + '] raw_modules=' + rawCount + ' -> validated_modules=' + vCount + (rawCount !== vCount ? '  (DROPPED ' + (rawCount - vCount) + '!)' : ''));
    if (rawCount !== vCount) {
      const keptIds = new Set((validated ? validated.modules : []).map((m) => m.id));
      for (const m of rawModules) {
        if (!keptIds.has(m.id)) {
          console.log('   DROPPED id=' + m.id + ' type=' + m.type + ' (registry=' + registered.has(m.type) + ' schema=' + schemaed.has(m.type) + ')');
        }
      }
    }
  }
}

main().then(() => process.exit(0), (e) => { console.error('ERROR:', e?.message ?? e); process.exit(1); });
