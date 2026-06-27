#!/usr/bin/env tsx
/**
 * Seed Digestive Foundations (display name "Digestive Reset") — VALIDATION-ONLY
 * runtime data for live end-to-end validation of the second delivered program.
 *
 * ⚠️  VALIDATION-ONLY CONTENT
 * Every row is placeholder content tagged:
 *   metadata.seeded_by      = "seedDigestiveFoundationsValidation"
 *   metadata.content_status = "validation_only"
 * It is structurally faithful (correct tables, 14-day duration, day 7/14
 * check-in cadence, presentation-rich questions_json, published DB delivery
 * modules) but the copy is NOT real clinical content and must be replaced
 * before any real launch.
 *
 * This script DOES NOT:
 *   - grant the `program:digestive-foundations` entitlement to any person
 *   - create a program assignment
 *   - create an enrollment
 * Those are separate, founder-gated steps.
 *
 * Modeled after scripts/seedBaselineProgramRuntime.ts.
 *
 * Modes (writes ALWAYS require --confirm):
 *   npx tsx scripts/seedDigestiveFoundationsValidation.ts
 *       → dry-run seed: prints the exact plan, performs NO writes, needs NO creds.
 *   npx tsx scripts/seedDigestiveFoundationsValidation.ts --confirm
 *       → applies the idempotent seed (needs Supabase service-role creds).
 *   npx tsx scripts/seedDigestiveFoundationsValidation.ts --rollback
 *       → dry-run rollback: prints what WOULD be deleted, performs NO writes.
 *   npx tsx scripts/seedDigestiveFoundationsValidation.ts --rollback --confirm
 *       → applies the rollback (needs creds).
 *
 * Idempotency / re-run safety:
 *   - programs / program_versions / program_checkin_templates use UNIQUE-key
 *     upserts.
 *   - program_delivery_modules has NO unique constraint on module_key, so the
 *     apply path deletes this program's seeded delivery rows (by program_id +
 *     known module_key list) before inserting, making reruns safe.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and
 * SUPABASE_SERVICE_ROLE_KEY in .env.local or the environment — ONLY when a
 * write/read mode (--confirm, or --rollback) actually needs the DB.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config();

const SLUG = 'digestive-foundations';
const TITLE = 'Digestive Reset';
const VERSION_KEY = 'digestive-foundations-v1';
const SEEDED_BY = 'seedDigestiveFoundationsValidation';
const VALIDATION_META = {
  seeded_by: SEEDED_BY,
  content_status: 'validation_only',
} as const;

const args = new Set(process.argv.slice(2));
const CONFIRM = args.has('--confirm');
const ROLLBACK = args.has('--rollback');

/* ------------------------------------------------------------------ */
/*  Validation-only content definitions                               */
/* ------------------------------------------------------------------ */

const SCORE_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({
  value: String(n),
  label: String(n),
}));

const DELTA_OPTIONS = [
  { value: '-2', label: 'Much lower capacity' },
  { value: '-1', label: 'A little lower' },
  { value: '0', label: 'About the same' },
  { value: '1', label: 'A little higher' },
  { value: '2', label: 'Much higher capacity' },
];

// Presentation-rich questions_json so the generic ProgramCheckinPanel renders
// real labels/selects WITHOUT a code question-set registry entry. Exercises all
// three payload coercions: number, string, string_array (+ none sentinel).
const BASE_QUESTIONS = [
  {
    key: 'digestion_score',
    label: 'Digestion score',
    value_type: 'number',
    input: 'score',
    required: false,
    options: SCORE_OPTIONS,
    help: 'Overall digestive comfort this week.',
  },
  {
    key: 'bloating_frequency',
    label: 'Bloating frequency',
    value_type: 'string',
    input: 'select',
    required: false,
    options: [
      { value: 'rare', label: 'Rare' },
      { value: 'some_days', label: 'Some days' },
      { value: 'most_days', label: 'Most days' },
      { value: 'daily', label: 'Daily' },
    ],
  },
  {
    key: 'gi_red_flags',
    label: 'GI red flags',
    value_type: 'string_array',
    input: 'select',
    required: false,
    none_value: 'none',
    options: [
      { value: 'none', label: 'None this week' },
      { value: 'pain', label: 'Pain' },
      { value: 'blood', label: 'Blood' },
      { value: 'other', label: 'Other concern' },
    ],
  },
];

const FINAL_EXTRA_QUESTION = {
  key: 'capacity_delta',
  label: 'Capacity change',
  value_type: 'number',
  input: 'delta',
  required: false,
  options: DELTA_OPTIONS,
  help: 'Compared with the start of Digestive Reset.',
};

const CHECKIN_TEMPLATES = [
  {
    checkin_day: 7,
    title: 'Digestive Reset Day 7 Check-In',
    description:
      'Validation-only mid-program signal check (digestion, bloating, red flags).',
    prompt_md:
      'Validation-only placeholder. Reflect on the first week of Digestive Reset.',
    questions_json: BASE_QUESTIONS,
  },
  {
    checkin_day: 14,
    title: 'Digestive Reset Day 14 Check-In',
    description:
      'Validation-only final signal check, including capacity_delta for end comparison.',
    prompt_md:
      'Validation-only placeholder. Reflect on the full Digestive Reset period.',
    questions_json: [...BASE_QUESTIONS, FINAL_EXTRA_QUESTION],
  },
];

// Published DB delivery modules (recommended path). `id` in the renderer comes
// from module_key. showWhen/blocks live in metadata; anchor_json carries
// anchorId/groupId/groupTitle; cta_json carries the CTA.
const DELIVERY_MODULES = [
  {
    module_key: 'df-prep-overview',
    module_type: 'prep',
    title: 'Set up your Digestive Reset',
    eyebrow: 'Digestive Reset preparation',
    body: 'Validation-only prep overview. Use this space to arrive before day 1.',
    day_start: null as number | null,
    day_end: null as number | null,
    status_visibility: ['pre_start', 'active'],
    anchor_json: { groupId: 'df-prep', groupTitle: 'Digestive Reset preparation' },
    cta_json: {},
    metadata: {
      groupId: 'df-prep',
      groupTitle: 'Digestive Reset preparation',
      blocks: [
        {
          type: 'metrics',
          metrics: ['selected_start', 'current_day', 'capacity', 'content_progress'],
        },
      ],
    },
  },
  {
    module_key: 'df-roadmap',
    module_type: 'roadmap',
    title: 'Digestive Reset sequence',
    eyebrow: 'Program roadmap',
    body: 'Validation-only 14-day roadmap with check-ins on day 7 and day 14.',
    day_start: null,
    day_end: null,
    status_visibility: ['pre_start', 'active'],
    anchor_json: { groupId: 'df-prep' },
    cta_json: {},
    metadata: {
      groupId: 'df-prep',
      blocks: [
        {
          type: 'roadmap',
          items: [
            { key: 'week-1', label: 'Week 1', range: 'Days 1-7', description: 'Settle into the reset rhythm.', dayStart: 1, dayEnd: 6 },
            { key: 'day-7', label: 'Day 7 check-in', range: 'Day 7', description: 'First signal capture.', dayStart: 7, dayEnd: 7 },
            { key: 'week-2', label: 'Week 2', range: 'Days 8-14', description: 'Continue and observe.', dayStart: 8, dayEnd: 13 },
            { key: 'day-14', label: 'Day 14 check-in', range: 'Day 14', description: 'Final signal capture.', dayStart: 14, dayEnd: 14 },
          ],
        },
      ],
    },
  },
  {
    module_key: 'df-week-focus',
    module_type: 'week',
    title: 'This week in Digestive Reset',
    eyebrow: 'Weekly focus',
    body: 'Validation-only weekly focus content for the active reset window.',
    day_start: 1,
    day_end: 14,
    status_visibility: ['active'],
    anchor_json: { groupId: 'df-week' },
    cta_json: {},
    metadata: {
      groupId: 'df-week',
      groupTitle: 'Digestive Reset weeks',
      blocks: [
        {
          type: 'notice',
          title: 'Day {{current_day}}: steady over strict',
          body: 'Validation-only notice block.',
          tone: 'emerald',
        },
      ],
    },
  },
  {
    module_key: 'df-day-7-checkin',
    module_type: 'checkin_prompt',
    title: 'Your Day 7 check-in is ready',
    eyebrow: 'Day 7 check-in',
    body: 'Validation-only. Use the check-in below to capture this week.',
    day_start: 7,
    day_end: 7,
    status_visibility: ['active'],
    anchor_json: { groupId: 'df-week' },
    cta_json: { label: 'Go to Day 7 check-in', anchorKey: 'checkin', tone: 'emerald' },
    metadata: { groupId: 'df-week', showWhen: 'checkin_due' },
  },
  {
    module_key: 'df-day-7-handled',
    module_type: 'checkin_prompt',
    title: 'Day 7 check-in',
    eyebrow: 'Day 7 check-in',
    body: 'Validation-only handled state. No action needed right now.',
    day_start: 7,
    day_end: 7,
    status_visibility: ['active'],
    anchor_json: { groupId: 'df-week' },
    cta_json: { label: 'No action needed', disabled: true, microcopy: 'No action is needed here right now.' },
    metadata: { groupId: 'df-week', showWhen: 'checkin_not_due' },
  },
  {
    module_key: 'df-day-14-checkin',
    module_type: 'checkin_prompt',
    title: 'Your final Digestive Reset check-in is ready',
    eyebrow: 'Day 14 check-in',
    body: 'Validation-only. Complete the final signal set below.',
    day_start: 14,
    day_end: 14,
    status_visibility: ['active'],
    anchor_json: { groupId: 'df-week' },
    cta_json: { label: 'Go to Day 14 check-in', anchorKey: 'checkin', tone: 'emerald' },
    metadata: { groupId: 'df-week', showWhen: 'checkin_due' },
  },
];

const DELIVERY_MODULE_KEYS = DELIVERY_MODULES.map((m) => m.module_key);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function log(line = '') {
  console.log(line);
}

function getClientOrExit(): SupabaseClient {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.',
    );
    process.exit(1);
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/* ------------------------------------------------------------------ */
/*  Dry-run summaries                                                  */
/* ------------------------------------------------------------------ */

function printSeedPlan() {
  log('=== DIGESTIVE RESET — VALIDATION SEED (DRY RUN) ===');
  log('No writes performed. Re-run with --confirm to apply.');
  log('');
  log(`programs (upsert on slug):`);
  log(`  slug=${SLUG} title="${TITLE}" status=published storefront_href=/programs`);
  log(`  metadata=${JSON.stringify(VALIDATION_META)}`);
  log('');
  log(`program_versions (upsert on program_id,version_key):`);
  log(`  version_key=${VERSION_KEY} version_number=1 status=published duration_days=14 default_unlock_day=1`);
  log('');
  log(`program_checkin_templates (upsert on program_version_id,checkin_day): ${CHECKIN_TEMPLATES.length} rows`);
  for (const t of CHECKIN_TEMPLATES) {
    log(`  day ${t.checkin_day}: "${t.title}" — ${t.questions_json.length} rich questions [${t.questions_json.map((q) => q.key).join(', ')}]`);
  }
  log('');
  log(`program_delivery_modules (delete-by-key then insert): ${DELIVERY_MODULES.length} rows, status=published`);
  for (const m of DELIVERY_MODULES) {
    const win = m.day_start == null && m.day_end == null ? 'no day window' : `days ${m.day_start}-${m.day_end}`;
    const showWhen = (m.metadata as { showWhen?: string }).showWhen ?? 'always';
    log(`  ${m.module_key} [${m.module_type}] ${win}, showWhen=${showWhen}`);
  }
  log('');
  log('NOT done by this script: entitlement grant, assignment, enrollment.');
}

function printRollbackPlan() {
  log('=== DIGESTIVE RESET — VALIDATION ROLLBACK (DRY RUN) ===');
  log('No writes performed. Re-run with --rollback --confirm to apply.');
  log('');
  log('Deletes (child → parent), scoped to this program only:');
  log(`  program_delivery_modules WHERE program_id=(slug=${SLUG}) AND module_key IN [${DELIVERY_MODULE_KEYS.join(', ')}]`);
  log(`  program_checkin_templates WHERE program_version_id IN versions(slug=${SLUG})`);
  log(`  program_versions WHERE program_id=(slug=${SLUG})`);
  log(`  programs WHERE slug=${SLUG}  (aborts if any enrollment exists)`);
  log('');
  log('NOTE: person_entitlements is NOT touched (this script never grants it).');
}

/* ------------------------------------------------------------------ */
/*  Apply: seed                                                        */
/* ------------------------------------------------------------------ */

async function applySeed(supabase: SupabaseClient) {
  log('Applying Digestive Reset validation seed...');

  const { data: programRow, error: programErr } = await supabase
    .from('programs')
    .upsert(
      {
        slug: SLUG,
        title: TITLE,
        tagline: 'Increase digestive capacity without increasing restriction.',
        description:
          'Validation-only placeholder description for the Digestive Reset runtime. Replace before launch.',
        storefront_href: '/programs',
        status: 'published',
        metadata: VALIDATION_META,
      },
      { onConflict: 'slug' },
    )
    .select('id, slug')
    .single();
  if (programErr) throw programErr;
  const programId = (programRow as { id: string }).id;

  const { data: versionRow, error: versionErr } = await supabase
    .from('program_versions')
    .upsert(
      {
        program_id: programId,
        version_key: VERSION_KEY,
        version_label: 'Digestive Reset v1',
        version_number: 1,
        status: 'published',
        duration_days: 14,
        default_unlock_day: 1,
        published_at: new Date().toISOString(),
        metadata: { ...VALIDATION_META, program_slug: SLUG },
      },
      { onConflict: 'program_id,version_key' },
    )
    .select('id, version_key')
    .single();
  if (versionErr) throw versionErr;
  const versionId = (versionRow as { id: string }).id;

  const templateRows = CHECKIN_TEMPLATES.map((t) => ({
    program_version_id: versionId,
    checkin_day: t.checkin_day,
    title: t.title,
    description: t.description,
    prompt_md: t.prompt_md,
    questions_json: t.questions_json,
    status: 'published',
    metadata: VALIDATION_META,
  }));
  const { error: templateErr } = await supabase
    .from('program_checkin_templates')
    .upsert(templateRows, { onConflict: 'program_version_id,checkin_day' });
  if (templateErr) throw templateErr;

  // Delivery modules: module_key is NOT unique → delete this program's seeded
  // rows by known key list, then insert fresh (idempotent rerun).
  const { error: deleteDmErr } = await supabase
    .from('program_delivery_modules')
    .delete()
    .eq('program_id', programId)
    .in('module_key', DELIVERY_MODULE_KEYS);
  if (deleteDmErr) throw deleteDmErr;

  const deliveryRows = DELIVERY_MODULES.map((m, index) => ({
    program_id: programId,
    program_version_id: versionId,
    module_key: m.module_key,
    module_type: m.module_type,
    title: m.title,
    eyebrow: m.eyebrow,
    body: m.body,
    day_start: m.day_start,
    day_end: m.day_end,
    status_visibility: m.status_visibility,
    capacity_variants_json: {},
    cta_json: m.cta_json,
    anchor_json: m.anchor_json,
    display_order: index,
    status: 'published',
    safety_notes: [],
    no_claims_notes: [],
    metadata: { ...m.metadata, ...VALIDATION_META },
  }));
  const { error: insertDmErr } = await supabase
    .from('program_delivery_modules')
    .insert(deliveryRows);
  if (insertDmErr) throw insertDmErr;

  log(
    `Seeded ${SLUG} ${VERSION_KEY}: program=${programId}, version=${versionId}, ` +
      `checkins=${templateRows.length}, delivery_modules=${deliveryRows.length}`,
  );
  log('Done. (No entitlement/assignment/enrollment created.)');
}

/* ------------------------------------------------------------------ */
/*  Apply: rollback                                                    */
/* ------------------------------------------------------------------ */

async function applyRollback(supabase: SupabaseClient) {
  log('Applying Digestive Reset validation rollback...');

  const { data: programRow, error: programErr } = await supabase
    .from('programs')
    .select('id, slug')
    .eq('slug', SLUG)
    .maybeSingle();
  if (programErr) throw programErr;
  if (!programRow) {
    log(`No '${SLUG}' program row found. Nothing to roll back.`);
    return;
  }
  const programId = (programRow as { id: string }).id;

  // Safety: refuse to tear down version/program while enrollments exist (FK).
  const { count: enrollmentCount, error: enrollErr } = await supabase
    .from('program_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('program_slug', SLUG);
  if (enrollErr) throw enrollErr;
  if ((enrollmentCount ?? 0) > 0) {
    console.error(
      `ABORT: ${enrollmentCount} enrollment(s) reference '${SLUG}'. ` +
        'Remove/cancel those enrollments before rolling back the version/program.',
    );
    process.exit(1);
  }

  const { error: dmErr } = await supabase
    .from('program_delivery_modules')
    .delete()
    .eq('program_id', programId)
    .in('module_key', DELIVERY_MODULE_KEYS);
  if (dmErr) throw dmErr;

  const { data: versions, error: vSelErr } = await supabase
    .from('program_versions')
    .select('id')
    .eq('program_id', programId);
  if (vSelErr) throw vSelErr;
  const versionIds = (versions ?? []).map((v) => (v as { id: string }).id);

  if (versionIds.length > 0) {
    const { error: tErr } = await supabase
      .from('program_checkin_templates')
      .delete()
      .in('program_version_id', versionIds);
    if (tErr) throw tErr;
  }

  const { error: vDelErr } = await supabase
    .from('program_versions')
    .delete()
    .eq('program_id', programId);
  if (vDelErr) throw vDelErr;

  const { error: pErr } = await supabase
    .from('programs')
    .delete()
    .eq('id', programId);
  if (pErr) throw pErr;

  log(`Rolled back '${SLUG}': delivery modules, check-in templates, version(s), and program row deleted.`);
  log('person_entitlements untouched (not managed by this script).');
}

/* ------------------------------------------------------------------ */
/*  Entry                                                              */
/* ------------------------------------------------------------------ */

async function main() {
  if (!CONFIRM) {
    if (ROLLBACK) printRollbackPlan();
    else printSeedPlan();
    log('');
    log('DRY RUN — no database writes were performed.');
    return;
  }

  const supabase = getClientOrExit();
  if (ROLLBACK) await applyRollback(supabase);
  else await applySeed(supabase);
}

main().catch((err) => {
  console.error('Digestive Reset validation seed failed:', err);
  process.exit(1);
});
