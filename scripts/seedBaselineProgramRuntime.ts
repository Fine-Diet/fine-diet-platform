#!/usr/bin/env tsx
/**
 * Seed Baseline Program Runtime v1.
 *
 * Usage:
 *   npx tsx scripts/seedBaselineProgramRuntime.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and
 * SUPABASE_SERVICE_ROLE_KEY in .env.local or the process environment.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config();

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.',
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BASELINE_SLUG = 'baseline';
const VERSION_KEY = 'baseline-v1';

const BASELINE_FIELDS_DAY_7_14 = [
  'digestion_score',
  'digestion_modifier',
  'bm_frequency',
  'meals_per_day',
  'protein_consistency',
  'hunger_pattern',
  'caffeine_use',
  'energy_score',
  'sleep_score',
  'stress_score',
  'cravings_frequency',
  'gi_red_flags',
];

const BASELINE_FIELDS_DAY_21 = [
  ...BASELINE_FIELDS_DAY_7_14,
  'stability_delta',
];

function questionsFor(fields: string[]) {
  return fields.map((field) => ({
    key: field,
    required: false,
    value_type:
      field.endsWith('_score') || field === 'stability_delta'
        ? 'number'
        : field === 'gi_red_flags'
          ? 'string_array'
          : 'string',
  }));
}

async function ensureBaselineProgram() {
  const { data: existing, error: existingErr } = await supabase
    .from('programs')
    .select('id, slug')
    .eq('slug', BASELINE_SLUG)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing) return existing as { id: string; slug: string };

  const { data, error } = await supabase
    .from('programs')
    .insert({
      slug: BASELINE_SLUG,
      title: 'Baseline',
      tagline: 'Establish your starting Fine Diet rhythm.',
      description:
        'A guided starting point for establishing meal rhythm, digestion signals, energy, sleep, stress, and nutrition-density consistency.',
      status: 'published',
      storefront_href: '/programs',
      metadata: { seeded_by: 'seedBaselineProgramRuntime' },
    })
    .select('id, slug')
    .single();
  if (error) throw error;
  return data as { id: string; slug: string };
}

async function upsertVersion(programId: string) {
  const { data, error } = await supabase
    .from('program_versions')
    .upsert(
      {
        program_id: programId,
        version_key: VERSION_KEY,
        version_label: 'Baseline v1',
        version_number: 1,
        status: 'published',
        duration_days: 21,
        default_unlock_day: 1,
        published_at: new Date().toISOString(),
        metadata: {
          seeded_by: 'seedBaselineProgramRuntime',
          program_slug: BASELINE_SLUG,
        },
      },
      { onConflict: 'program_id,version_key' },
    )
    .select('id, version_key')
    .single();
  if (error) throw error;
  return data as { id: string; version_key: string };
}

async function upsertCheckinTemplates(programVersionId: string) {
  const rows = [
    {
      program_version_id: programVersionId,
      checkin_day: 7,
      title: 'Baseline Day 7 Check-In',
      description:
        'First weekly signal check across digestion, meal rhythm, energy, sleep, stress, cravings, and red flags.',
      prompt_md:
        'Reflect on the first week of Baseline. These answers will later help Fine Diet adjust the guided experience.',
      questions_json: questionsFor(BASELINE_FIELDS_DAY_7_14),
      status: 'published',
      metadata: { seeded_by: 'seedBaselineProgramRuntime' },
    },
    {
      program_version_id: programVersionId,
      checkin_day: 14,
      title: 'Baseline Day 14 Check-In',
      description:
        'Second weekly signal check using the same Baseline field contract.',
      prompt_md:
        'Reflect on week two. Keep the same signal fields so later runtime logic can compare week over week.',
      questions_json: questionsFor(BASELINE_FIELDS_DAY_7_14),
      status: 'published',
      metadata: { seeded_by: 'seedBaselineProgramRuntime' },
    },
    {
      program_version_id: programVersionId,
      checkin_day: 21,
      title: 'Baseline Day 21 Check-In',
      description:
        'Final Baseline check-in, including stability_delta for end-of-program comparison.',
      prompt_md:
        'Reflect on the full Baseline period. Stability delta is captured for future runtime recommendation logic.',
      questions_json: questionsFor(BASELINE_FIELDS_DAY_21),
      status: 'published',
      metadata: { seeded_by: 'seedBaselineProgramRuntime' },
    },
  ];

  const { error } = await supabase
    .from('program_checkin_templates')
    .upsert(rows, { onConflict: 'program_version_id,checkin_day' });
  if (error) throw error;
  return rows.length;
}

async function main() {
  console.log('Seeding Baseline program runtime...');
  const program = await ensureBaselineProgram();
  const version = await upsertVersion(program.id);
  const templates = await upsertCheckinTemplates(version.id);

  console.log(
    `Seeded ${BASELINE_SLUG} ${version.version_key}: program=${program.id}, version=${version.id}, checkins=${templates}`,
  );
}

main().catch((err) => {
  console.error('Baseline runtime seed failed:', err);
  process.exit(1);
});
