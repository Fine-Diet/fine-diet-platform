#!/usr/bin/env tsx
/**
 * Meal Object Foundation — backfill meal_documents (Meal Library)
 *
 * Populates the (additive) public.meal_documents store created by
 * scripts/sql/createMealDocuments.sql from a person's existing sources:
 *
 *   - journal_meal_templates (Saved Meals) -> kind='meal', review_state='confirmed'
 *       via mealTemplateToMealDocument (no nutrition invented; NDS stays null).
 *   - imported_meals                       -> kind='meal'/'recipe', draft/needs_review
 *       via saveImportedMealAsMealDocumentDraft (yield never inferred; the
 *       import path is already idempotent on re-run).
 *
 * SAFETY:
 *   - Additive only. Reuses the tested adapter + server-service write paths;
 *     this script adds no new persistence logic of its own.
 *   - Re-runnable. Saved-meal rows are de-duped by source_template_id against
 *     existing meal_documents; imported rows are de-duped inside the import
 *     service (findMealDocumentBySourceImportedMeal).
 *   - Person-scoped. Every read/write is filtered/stamped by person_id.
 *
 * Usage:
 *   npx tsx scripts/backfillMealDocuments.ts [--person=<uuid>] [--dry-run]
 *   npm run backfill-meal-documents -- --dry-run
 *
 * Defaults to the pilot person (Rashad) when no --person is supplied.
 */

import { config } from 'dotenv';

// Load env BEFORE any module that constructs the Supabase admin client. The
// repo keeps secrets in .env.local; fall back to .env for parity with other
// scripts. The lib modules are imported dynamically inside main() so this runs
// first (static imports would be hoisted above these calls).
config({ path: '.env.local' });
config();

const PILOT_PERSON_ID = '893f480f-85d3-4332-9d08-605952f7cae1';

interface BackfillSummary {
  personId: string;
  dryRun: boolean;
  templates: { total: number; created: number; skipped: number; failed: number };
  imports: { total: number; saved: number; failed: number };
}

function parseArgs(argv: string[]): { personId: string; dryRun: boolean } {
  const dryRun = argv.includes('--dry-run');
  const personFlag = argv.find((a) => a.startsWith('--person='));
  const positional = argv.find((a) => !a.startsWith('--'));
  const personId = personFlag ? personFlag.slice('--person='.length) : positional ?? PILOT_PERSON_ID;
  return { personId, dryRun };
}

async function main(): Promise<void> {
  const { personId, dryRun } = parseArgs(process.argv.slice(2));

  // Dynamic imports: env is configured above before the Supabase client loads.
  const { listMealTemplates } = await import('@/lib/journal/journalServerService');
  const { listImportedMeals } = await import('@/lib/plans/importsServerService');
  const { mealTemplateToMealDocument } = await import('@/lib/meals/adapters');
  const { createMealDocumentForPerson, listMealDocumentsForPerson } = await import(
    '@/lib/meals/mealDocumentServerService'
  );
  const { saveImportedMealAsMealDocumentDraft } = await import(
    '@/lib/meals/importToMealDocumentService'
  );

  console.log(`[backfill] person=${personId} dryRun=${dryRun}`);

  const existing = await listMealDocumentsForPerson(personId);
  const existingTemplateIds = new Set(
    existing
      .filter((d) => d.source.source_type === 'saved_meal' && d.source.source_template_id)
      .map((d) => d.source.source_template_id as string),
  );
  console.log(
    `[backfill] existing meal_documents=${existing.length} (saved_meal-derived=${existingTemplateIds.size})`,
  );

  const summary: BackfillSummary = {
    personId,
    dryRun,
    templates: { total: 0, created: 0, skipped: 0, failed: 0 },
    imports: { total: 0, saved: 0, failed: 0 },
  };

  // 1) Saved Meals -> confirmed meal documents.
  const templates = await listMealTemplates(personId);
  summary.templates.total = templates.length;
  for (const template of templates) {
    if (template.id && existingTemplateIds.has(template.id)) {
      summary.templates.skipped += 1;
      console.log(`[skip] template ${template.id} "${template.name}" already backfilled`);
      continue;
    }
    const doc = { ...mealTemplateToMealDocument(template), id: null, person_id: personId };
    if (dryRun) {
      summary.templates.created += 1;
      console.log(
        `[dry] template ${template.id} "${template.name}" -> meal/confirmed (${doc.components.length} components)`,
      );
      continue;
    }
    try {
      const saved = await createMealDocumentForPerson(personId, doc);
      summary.templates.created += 1;
      console.log(`[ok] template ${template.id} -> meal_document ${saved.id}`);
    } catch (error) {
      summary.templates.failed += 1;
      console.error(`[fail] template ${template.id}: ${(error as Error).message}`);
    }
  }

  // 2) Imported Meals -> draft/needs_review documents (idempotent service).
  const imports = await listImportedMeals(personId);
  summary.imports.total = imports.length;
  for (const imported of imports) {
    if (dryRun) {
      summary.imports.saved += 1;
      console.log(`[dry] import ${imported.id} "${imported.title}" -> draft/needs_review`);
      continue;
    }
    try {
      const doc = await saveImportedMealAsMealDocumentDraft(personId, imported.id);
      summary.imports.saved += 1;
      console.log(`[ok] import ${imported.id} -> meal_document ${doc.id} (${doc.review_state})`);
    } catch (error) {
      summary.imports.failed += 1;
      console.error(`[fail] import ${imported.id}: ${(error as Error).message}`);
    }
  }

  console.log('\n--- backfill summary ---');
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .then(() => {
    console.log('\n[backfill] done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n[backfill] failed:', error);
    process.exit(1);
  });
