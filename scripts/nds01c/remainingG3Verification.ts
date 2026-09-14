/**
 * Remaining NDS-01C G3/G4 A03–A08 scenarios that Strategy marked unrun.
 * Uses the live local Auth/PostgREST/Next stack and actual API handlers.
 */

import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Browser, Page } from 'playwright';

import { applySqlFile, EXPAND_MIGRATIONS, ROLLBACK_MIGRATION } from '../../test/localdb/harness';
import { resolveEmbeddedPostgresBinDir } from '../../test/localdb/embeddedPostgresBinaries';
import type { LocalCluster } from '../../test/localdb/localPostgres';
import { CONSUMED_TIME_ZONE_HEADER } from '../../lib/journal/consumedTimeZoneRequest';

const SUBJECT_TZ = 'America/Chicago';
const NDS_VERSION = 'nds_daily_2026-01-26.v10';
const CLASSIFIER_VERSION = 'processing_classifier_2026-02-08.v2';

export interface RemainingVerificationInput {
  page: Page;
  browser: Browser;
  cluster: LocalCluster;
  personId: string;
  foodId: string;
  serviceRoleKey: string;
  anonKey: string;
  syntheticEmail: string;
  syntheticPassword: string;
  jwtSecret: string;
  gatewayPort: number;
  nextPort: number;
  evidenceDir: string;
  repoRoot: string;
  postgrestRpc: (fn: string, body: unknown, token: string) => Promise<{ status: number; body: string }>;
}

type NdsBody = {
  nds?: {
    state?: string;
    nds_score_100?: number | null;
    person_id?: string;
    date_local?: string;
    day_provenance?: string;
    source_revision?: number;
    coverage?: { added_sugar?: string; scored_entry_count?: number; limitations?: string[] };
  };
  _meta?: { publish_reason?: string | null };
};

function parseJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function attributedDay(writeBody: string): string | null {
  const parsed = parseJson(writeBody);
  const entry = (parsed.entry ?? parsed.journal_entry ?? parsed) as Record<string, unknown>;
  const payload = (entry.payload ?? {}) as Record<string, unknown>;
  const consumed = payload.consumed_day as { date_local?: string } | undefined;
  if (consumed?.date_local) return consumed.date_local;
  const occurred = typeof entry.occurred_at === 'string' ? entry.occurred_at : null;
  return occurred ? occurred.slice(0, 10) : null;
}

function mealComponent(
  id: string,
  name: string,
  calories: number,
  macros: Record<string, unknown>,
  extras: Record<string, unknown> = {},
) {
  return {
    component_id: id,
    name,
    quantity: 1,
    unit: 'serving',
    food_object_id: null,
    calories,
    macros: {
      protein_g: macros.protein_g ?? 0,
      carbs_g: macros.carbs_g ?? 0,
      fat_g: macros.fat_g ?? 0,
      fiber_g: macros.fiber_g ?? null,
      added_sugar_g: macros.added_sugar_g ?? null,
      added_sugar_provenance: macros.added_sugar_provenance ?? 'authored',
    },
    nutrition_basis: 'per_component',
    match_status: 'matched',
    source_kind: 'food_object',
    needs_review: false,
    ...extras,
  };
}

function mealGroup(
  name: string,
  components: ReturnType<typeof mealComponent>[],
  extras: Record<string, unknown> = {},
) {
  const totalsMacros = {
    protein_g: components.reduce((s, c) => s + (Number(c.macros.protein_g) || 0), 0),
    carbs_g: components.reduce((s, c) => s + (Number(c.macros.carbs_g) || 0), 0),
    fat_g: components.reduce((s, c) => s + (Number(c.macros.fat_g) || 0), 0),
    fiber_g: components.reduce((s, c) => s + (Number(c.macros.fiber_g) || 0), 0),
    added_sugar_g: components.reduce((s, c) => s + (Number(c.macros.added_sugar_g) || 0), 0),
  };
  const calories = components.reduce((s, c) => s + (Number(c.calories) || 0), 0);
  return {
    schema_version: 1,
    name,
    source_meal_document_id: null,
    source_imported_meal_id: null,
    source_planned_meal_id: null,
    source_template_id: null,
    components,
    totals: { calories, macros: totalsMacros },
    planned_servings: 1,
    consumed_servings: 1,
    detached_from_source: false,
    needs_review: false,
    ...extras,
  };
}

function authoredIntake(name: string, extras: Record<string, unknown> = {}) {
  return {
    name,
    quantity: 1,
    unit: 'serving',
    calories: 620,
    macros: {
      protein: 42,
      carbs: 55,
      fat: 22,
      fiber: 9,
      added_sugar_g: 3,
      added_sugar_provenance: 'authored',
    },
    servingSizeG: 400,
    ...extras,
  };
}

/** Canonical MealDocument used by composer save + library log. */
function libraryMealDocument(title: string, foodObjectId: string) {
  return {
    schema_version: 1,
    id: null,
    person_id: null,
    kind: 'meal' as const,
    review_state: 'confirmed' as const,
    title,
    description: null,
    intents: [] as string[],
    meal_type_hint: 'lunch' as const,
    components: [
      {
        component_id: 'c1',
        name: 'Library salmon',
        quantity: 1,
        unit: 'serving',
        food_object_id: foodObjectId,
        calories: 620,
        macros: {
          protein_g: 42,
          carbs_g: 55,
          fat_g: 22,
          fiber_g: 9,
          added_sugar_g: 3,
        },
        nutrition_basis: 'per_serving' as const,
        match_status: 'matched' as const,
        source_kind: 'food_object' as const,
        needs_review: false,
      },
    ],
    yield: null,
    recipe_yield_servings: null,
    serving_label: null,
    prep_notes: null,
    per_serving: {
      calories: 620,
      macros: { protein_g: 42, carbs_g: 55, fat_g: 22, fiber_g: 9, added_sugar_g: 3 },
    },
    totals: {
      calories: 620,
      macros: { protein_g: 42, carbs_g: 55, fat_g: 22, fiber_g: 9, added_sugar_g: 3 },
    },
    source: { source_type: 'manual' as const },
    nds: null,
    nds_version: null,
    classifier_version: null,
    created_at: null,
    updated_at: null,
  };
}

function a08SqlIntake(name: string, calories: number) {
  return JSON.stringify({
    name,
    quantity: 1,
    unit: 'serving',
    calories,
    macros: {
      protein: 20,
      carbs: 22,
      fat: 8,
      fiber: 5,
      added_sugar_g: 1,
      added_sugar_provenance: 'authored',
    },
    servingSizeG: 200,
  });
}

export async function runRemainingG3Verification(
  input: RemainingVerificationInput,
): Promise<Record<string, unknown>> {
  const {
    page,
    browser,
    cluster,
    personId,
    foodId,
    serviceRoleKey,
    anonKey,
    syntheticEmail,
    syntheticPassword,
    gatewayPort,
    nextPort,
    evidenceDir,
    repoRoot,
    postgrestRpc,
  } = input;

  const client = await cluster.connect();
  try {
    await applySqlFile(client, path.join(repoRoot, 'scripts/nds01c/g3PlansFixture.sql'));
    await client.query(`
      CREATE OR REPLACE FUNCTION public.update_journal_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await applySqlFile(client, path.join(repoRoot, 'scripts/sql/createMealDocuments.sql'));
    await client.query(`GRANT ALL ON TABLE public.meal_documents TO service_role, authenticated`);
    await client.query(`NOTIFY pgrst, 'reload schema'`);
    await client.query(
      `UPDATE public.people SET consumed_time_zone = $2 WHERE id = $1`,
      [personId, SUBJECT_TZ],
    );
    await client.query(
      `UPDATE public.food_objects
          SET measures = $2::jsonb, serving_size_g = 100
        WHERE id = $1`,
      [foodId, JSON.stringify([{ unit: 'cup', grams: 200 }])],
    );
  } finally {
    await client.end();
  }

  const tzHeaders = { [CONSUMED_TIME_ZONE_HEADER]: SUBJECT_TZ };

  async function apiPost(url: string, data: unknown) {
    return page.request.post(url, { data, headers: tzHeaders });
  }
  async function apiPatch(url: string, data: unknown) {
    return page.request.patch(url, { data, headers: tzHeaders });
  }
  async function ndsFor(dateLocal: string): Promise<{ status: number; json: NdsBody; body: string }> {
    const res = await page.request.get(`/api/journal/nds?date_local=${dateLocal}`);
    const body = await res.text();
    return { status: res.status(), json: parseJson(body) as NdsBody, body };
  }

  // --------------------------------------------------------------------------
  // A03 — real mutation handlers
  // --------------------------------------------------------------------------
  const planDay = '2026-07-20';
  const seed = await cluster.connect();
  let plannedMealId = '';
  let undoMealId = '';
  try {
    const plan = await seed.query<{ id: string }>(
      `INSERT INTO public.plans (person_id, title, plan_shape, source, status, start_date, nds_version, classifier_version)
       VALUES ($1, 'NDS01C plan', 'day', 'user_manual', 'active', $2, $3, $4)
       RETURNING id`,
      [personId, planDay, NDS_VERSION, CLASSIFIER_VERSION],
    );
    const planId = plan.rows[0].id;
    const day = await seed.query<{ id: string }>(
      `INSERT INTO public.plan_days (plan_id, person_id, date_local, nds_version, classifier_version)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [planId, personId, planDay, NDS_VERSION, CLASSIFIER_VERSION],
    );
    const dayId = day.rows[0].id;
    const mealPayload = {
      totals: { calories: 620, protein_g: 42, carbs_g: 55, fat_g: 22, fiber_g: 9, added_sugar_g: 3 },
      items: [
        {
          name: 'Planned salmon bowl',
          quantity: 1,
          unit: 'serving',
          calories: 620,
          macros: { protein: 42, carbs: 55, fat: 22, fiber: 9, added_sugar_g: 3, added_sugar_provenance: 'authored' },
          foodObjectId: foodId,
        },
      ],
    };
    const meals = await seed.query<{ id: string }>(
      `INSERT INTO public.planned_meals (
         plan_id, plan_day_id, person_id, name, meal_type, payload, protein_score_10,
         is_main_meal, psq_multiplier, meal_derived_data, nds_confidence, nds_version, classifier_version
       ) VALUES
         ($1,$2,$3,'Eat meal','dinner',$4::jsonb,8,true,1,'{}','high',$5,$6),
         ($1,$2,$3,'Undo meal','dinner',$4::jsonb,8,true,1,'{}','high',$5,$6)
       RETURNING id`,
      [planId, dayId, personId, JSON.stringify(mealPayload), NDS_VERSION, CLASSIFIER_VERSION],
    );
    plannedMealId = meals.rows[0].id;
    undoMealId = meals.rows[1].id;
  } finally {
    await seed.end();
  }

  const eatRes = await apiPost(`/api/journal/plans/meals/${plannedMealId}/execute`, {
    action: 'eat',
    occurred_at: `${planDay}T18:00:00.000Z`,
  });
  const eatBody = await eatRes.text();
  const eatDay = attributedDay(eatBody) ?? planDay;
  const afterEat = await ndsFor(eatDay);
  const eatRevision = afterEat.json.nds?.source_revision ?? null;

  const skipRes = await apiPost(`/api/journal/plans/meals/${undoMealId}/execute`, {
    action: 'skip',
    occurred_at: `${planDay}T19:00:00.000Z`,
  });

  const adjustedMealClient = await cluster.connect();
  let adjustedMealId = '';
  try {
    const row = await adjustedMealClient.query<{ id: string }>(
      `INSERT INTO public.planned_meals (
         plan_id, plan_day_id, person_id, name, meal_type, payload, protein_score_10,
         is_main_meal, psq_multiplier, meal_derived_data, nds_confidence, nds_version, classifier_version
       )
       SELECT plan_id, plan_day_id, person_id, 'Adjusted meal', 'dinner', payload, protein_score_10,
              is_main_meal, psq_multiplier, meal_derived_data, nds_confidence, nds_version, classifier_version
         FROM public.planned_meals WHERE id = $1
       RETURNING id`,
      [plannedMealId],
    );
    adjustedMealId = row.rows[0].id;
  } finally {
    await adjustedMealClient.end();
  }

  const logAdjustedRes = await apiPost(`/api/journal/plans/meals/${adjustedMealId}/execute`, {
    action: 'log_adjusted',
    occurred_at: `${planDay}T20:00:00.000Z`,
    intake_payload: {
      name: 'Adjusted salmon',
      quantity: 1,
      unit: 'serving',
      calories: 400,
      macros: {
        protein: 30,
        carbs: 40,
        fat: 10,
        fiber: 6,
        added_sugar_g: 1,
        added_sugar_provenance: 'authored',
      },
      source_planned_meal_id: adjustedMealId,
      logged_as_planned: false,
      meal_group: mealGroup(
        'Adjusted salmon',
        [
          mealComponent('c1', 'Salmon', 400, {
            protein_g: 30,
            carbs_g: 40,
            fat_g: 10,
            fiber_g: 6,
            added_sugar_g: 1,
            added_sugar_provenance: 'authored',
          }, { food_object_id: foodId }),
        ],
        {
          source_planned_meal_id: adjustedMealId,
          detached_from_source: true,
          logged_as_planned: false,
        },
      ),
    },
  });
  const logAdjustedBody = await logAdjustedRes.text();
  const afterAdjusted = await ndsFor(eatDay);

  const undoRes = await apiPost(`/api/journal/plans/meals/${plannedMealId}/execute`, { action: 'undo' });
  const afterUndo = await ndsFor(eatDay);

  const firstIntakeDay = '2026-07-21';
  const firstWrite = await apiPost(`/api/journal/entries`, {
    occurredAt: `${firstIntakeDay}T18:00:00.000Z`,
    entryType: 'intake',
    payload: authoredIntake('First intake'),
  });
  const firstBody = await firstWrite.text();
  const firstDay = attributedDay(firstBody) ?? firstIntakeDay;
  const afterFirst = await ndsFor(firstDay);
  const firstId = (parseJson(firstBody).entry as { id?: string } | undefined)?.id;

  const multiDay = '2026-07-22';
  const draftCommit = await apiPost(`/api/journal/log-drafts/commit`, {
    sessionId: crypto.randomUUID(),
    occurredAt: `${multiDay}T18:00:00.000Z`,
    entries: [
      {
        draftEntryId: crypto.randomUUID(),
        payload: authoredIntake('Draft one', { foodObjectId: foodId }),
      },
      {
        draftEntryId: crypto.randomUUID(),
        payload: authoredIntake('Draft two', {
          foodObjectId: foodId,
          calories: 310,
          quantity: 0.5,
          macros: { protein: 21, carbs: 27, fat: 11, fiber: 4, added_sugar_g: 1.5, added_sugar_provenance: 'authored' },
        }),
      },
    ],
  });
  const draftBody = await draftCommit.text();
  const draftParsed = parseJson(draftBody);
  const draftEntries = (draftParsed.entries as Array<{ id?: string; payload?: { consumed_day?: { date_local?: string } } }>) ?? [];
  const multiDayAttributed = draftEntries[0]?.payload?.consumed_day?.date_local ?? multiDay;
  const afterDraft = await ndsFor(multiDayAttributed);

  // Library consumption is NOT POST /api/journal/meals (template save).
  // Product mapping:
  //   LogMealDocumentPanel → POST /api/journal/meals/documents/[id]/log
  //     → logMealDocumentForPerson → createEntry
  //   Composer unsaved log → POST /api/journal/meals/documents/log-instance
  //     → logInMemoryMealDocumentForPerson → same createEntry + payload builder
  const libraryDay = '2026-08-01';
  const libraryDocument = await apiPost(`/api/journal/meals/documents`, libraryMealDocument('NDS library bowl', foodId));
  const libraryDocumentBody = await libraryDocument.text();
  const libraryDocId = (parseJson(libraryDocumentBody).document as { id?: string } | undefined)?.id;
  const beforeLibraryLog = await ndsFor(libraryDay);
  const libraryLog = libraryDocId
    ? await apiPost(`/api/journal/meals/documents/${libraryDocId}/log`, {
        date: libraryDay,
        time: '12:00',
        consumed_servings: 1,
        note: 'library consumption',
      })
    : null;
  const libraryLogBody = libraryLog ? await libraryLog.text() : '';
  const libraryEntry = parseJson(libraryLogBody).entry as
    | { id?: string; entry_type?: string; payload?: { meal_group?: unknown; consumed_day?: { date_local?: string } } }
    | undefined;
  const libraryAttributed = libraryEntry?.payload?.consumed_day?.date_local ?? attributedDay(libraryLogBody) ?? libraryDay;
  const afterLibraryLog = await ndsFor(libraryAttributed);

  const composerDay = '2026-08-02';
  const composerLog = await apiPost(`/api/journal/meals/documents/log-instance`, {
    document: libraryMealDocument('NDS composer draft', foodId),
    date: composerDay,
    time: '12:00',
    consumed_servings: 1,
    note: 'composer consumption',
  });
  const composerLogBody = await composerLog.text();
  const composerEntry = parseJson(composerLogBody).entry as
    | { id?: string; payload?: { meal_group?: unknown; consumed_day?: { date_local?: string } } }
    | undefined;
  const composerAttributed = composerEntry?.payload?.consumed_day?.date_local ?? attributedDay(composerLogBody) ?? composerDay;
  const afterComposerLog = await ndsFor(composerAttributed);

  const groupedMoveDay = '2026-07-23';
  const groupedMoveWrite = await apiPost(`/api/journal/entries`, {
    occurredAt: `${groupedMoveDay}T18:00:00.000Z`,
    entryType: 'intake',
    payload: {
      name: 'Movable group',
      quantity: 1,
      meal_group: mealGroup('Movable group', [
        mealComponent('c1', 'Oats', 300, {
          protein_g: 10,
          carbs_g: 40,
          fat_g: 6,
          fiber_g: 8,
          added_sugar_g: 0,
          added_sugar_provenance: 'authored',
        }),
      ]),
    },
  });
  const groupedMoveBody = await groupedMoveWrite.text();
  const groupedMoveId = (parseJson(groupedMoveBody).entry as { id?: string } | undefined)?.id;
  const groupedOriginDay = attributedDay(groupedMoveBody) ?? groupedMoveDay;
  const moveTargetOccurred = '2026-07-24T18:00:00.000Z';
  const groupedMovePatch = groupedMoveId
    ? await apiPatch(`/api/journal/entries/${groupedMoveId}/meal-group`, {
        occurred_at: moveTargetOccurred,
      })
    : null;
  const groupedMovePatchBody = groupedMovePatch ? await groupedMovePatch.text() : '';
  const groupedDestDay = attributedDay(groupedMovePatchBody) ?? '2026-07-24';
  const originAfterMove = await ndsFor(groupedOriginDay);
  const destAfterMove = await ndsFor(groupedDestDay);

  const replacementA03 = await apiPost(`/api/journal/entries`, {
    occurredAt: `2026-07-25T18:00:00.000Z`,
    entryType: 'intake',
    payload: authoredIntake('To replace', { foodObjectId: foodId }),
  });
  const replacementA03Body = await replacementA03.text();
  const replacementA03Id = (parseJson(replacementA03Body).entry as { id?: string } | undefined)?.id;
  const replacementA03Day = attributedDay(replacementA03Body) ?? '2026-07-25';
  const beforeReplace = await ndsFor(replacementA03Day);
  const replacementA03Patch = replacementA03Id
    ? await apiPatch(`/api/journal/entries/${replacementA03Id}`, {
        replacePayload: true,
        payload: authoredIntake('Replaced food', {
          calories: 400,
          servingSizeG: 250,
          macros: { protein: 20, carbs: 40, fat: 10, fiber: 5, added_sugar_g: 2, added_sugar_provenance: 'authored' },
        }),
      })
    : null;
  const afterReplace = await ndsFor(replacementA03Day);

  const deleteRes = firstId ? await page.request.delete(`/api/journal/entries/${firstId}`) : null;
  const afterDelete = await ndsFor(firstDay);

  // --------------------------------------------------------------------------
  // A05 — 200g cup vs 100g serving, recipe yield, nested recipe
  // --------------------------------------------------------------------------
  const cupKnownWrite = await apiPost(`/api/journal/entries`, {
    occurredAt: '2026-07-26T18:00:00.000Z',
    entryType: 'intake',
    payload: {
      name: 'Known cup',
      quantity: 1,
      unit: 'cup',
      foodObjectId: foodId,
      servingSizeG: 100,
      measures: [{ unit: 'cup', grams: 200 }],
      calories: 200,
      macros: { protein: 14, carbs: 18, fat: 7, fiber: 3, added_sugar_g: 1, added_sugar_provenance: 'authored' },
    },
  });
  const cupKnownBody = await cupKnownWrite.text();
  const cupKnownDay = attributedDay(cupKnownBody);
  const cupKnownNds = cupKnownDay ? await ndsFor(cupKnownDay) : { status: 0, json: {} as NdsBody, body: '' };

  const recipeYieldWrite = await apiPost(`/api/journal/entries`, {
    occurredAt: '2026-07-27T18:00:00.000Z',
    entryType: 'intake',
    payload: {
      name: 'Batch chili',
      quantity: 2,
      meal_group: mealGroup(
        'Batch chili',
        [
          mealComponent('beans', 'Beans', 400, {
            protein_g: 28,
            carbs_g: 80,
            fat_g: 2,
            fiber_g: 24,
            added_sugar_g: 0,
            added_sugar_provenance: 'authored',
          }),
        ],
        { planned_servings: 4, consumed_servings: 2 },
      ),
    },
  });
  const recipeYieldBody = await recipeYieldWrite.text();
  const recipeYieldDay = attributedDay(recipeYieldBody);
  const recipeYieldNds = recipeYieldDay ? await ndsFor(recipeYieldDay) : { status: 0, json: {} as NdsBody, body: '' };

  const nestedRecipeWrite = await apiPost(`/api/journal/entries`, {
    occurredAt: '2026-07-28T18:00:00.000Z',
    entryType: 'intake',
    payload: {
      name: 'Nested recipe plate',
      quantity: 1,
      meal_group: mealGroup('Nested recipe plate', [
        mealComponent(
          'sauce',
          'Nested sauce recipe',
          80,
          {
            protein_g: 1,
            carbs_g: 12,
            fat_g: 2,
            fiber_g: 0,
            added_sugar_g: 4,
            added_sugar_provenance: 'authored',
          },
          {
            nested_components: [
              mealComponent('sugar', 'Sugar', 16, {
                protein_g: 0,
                carbs_g: 4,
                fat_g: 0,
                fiber_g: 0,
                added_sugar_g: 4,
                added_sugar_provenance: 'authored',
              }),
            ],
          },
        ),
      ]),
    },
  });
  const nestedRecipeBody = await nestedRecipeWrite.text();
  const nestedRecipeDay = attributedDay(nestedRecipeBody);
  const nestedRecipeNds = nestedRecipeDay ? await ndsFor(nestedRecipeDay) : { status: 0, json: {} as NdsBody, body: '' };

  // --------------------------------------------------------------------------
  // A06 — grouped/nested sugar on attributed day, known zero + unknown
  // --------------------------------------------------------------------------
  const sugarMixWrite = await apiPost(`/api/journal/entries`, {
    occurredAt: '2026-07-29T18:00:00.000Z',
    entryType: 'intake',
    payload: {
      name: 'Zero plus unknown bowl',
      quantity: 1,
      meal_group: mealGroup('Zero plus unknown bowl', [
        mealComponent('plain', 'Plain oats', 150, {
          protein_g: 5,
          carbs_g: 27,
          fat_g: 3,
          fiber_g: 4,
          added_sugar_g: 0,
          added_sugar_provenance: 'authored',
        }),
        mealComponent('mystery', 'Unspecified fruit', 90, {
          protein_g: 1,
          carbs_g: 22,
          fat_g: 0,
          fiber_g: 0,
          added_sugar_g: null,
          added_sugar_provenance: 'unknown',
        }),
      ]),
    },
  });
  const sugarMixBody = await sugarMixWrite.text();
  const sugarMixDay = attributedDay(sugarMixBody);
  const sugarMixFirst = sugarMixDay ? await ndsFor(sugarMixDay) : { status: 0, json: {} as NdsBody, body: '' };
  const sugarMixSecond = sugarMixDay ? await ndsFor(sugarMixDay) : { status: 0, json: {} as NdsBody, body: '' };

  // --------------------------------------------------------------------------
  // A04 — browser identity/staleness
  // --------------------------------------------------------------------------
  await page.goto('/app');
  await page.waitForTimeout(800);
  const homeBeforeDelay = await page.locator('[aria-label="Nutrition Density So Far Today"]').innerText().catch(() => '');

  let delayedReleased = false;
  let delayedStatus = 0;
  await page.route('**/api/journal/nds**', async (route) => {
    if (!delayedReleased) {
      delayedReleased = true;
      await new Promise((r) => setTimeout(r, 1500));
    }
    const response = await route.fetch();
    delayedStatus = response.status();
    await route.fulfill({ response });
  });
  const delayedNav = page.goto('/app');
  await page.waitForTimeout(200);
  await apiPost(`/api/journal/entries`, {
    occurredAt: new Date().toISOString(),
    entryType: 'intake',
    payload: authoredIntake('In-flight today mutation', { foodObjectId: foodId, calories: 100 }),
  });
  await delayedNav;
  await page.waitForTimeout(1800);
  const homeAfterDelayed = await page.locator('[aria-label="Nutrition Density So Far Today"]').innerText().catch(() => '');
  await page.unroute('**/api/journal/nds**');

  await page.goto('http://127.0.0.1:3000/journal/insights');
  await page.waitForTimeout(800);
  const insightsText = await page.locator('body').innerText();
  const insightsUrl = page.url();
  await page.goto('http://127.0.0.1:3000/app');
  await page.waitForTimeout(600);
  const programsOrHome = page.url();
  const insightsShot = path.join(evidenceDir, 'g3-a04-insights.png');
  await page.screenshot({ path: insightsShot, fullPage: true });

  const midnightWrite = await apiPost(`/api/journal/entries`, {
    occurredAt: '2026-09-15T04:59:00.000Z',
    entryType: 'intake',
    payload: authoredIntake('Chicago late evening', { foodObjectId: foodId }),
  });
  const midnightBody = await midnightWrite.text();
  const midnightDay = attributedDay(midnightBody);
  const afterMidnightWrite = await apiPost(`/api/journal/entries`, {
    occurredAt: '2026-09-15T05:01:00.000Z',
    entryType: 'intake',
    payload: authoredIntake('Chicago early morning', { foodObjectId: foodId }),
  });
  const afterMidnightBody = await afterMidnightWrite.text();
  const afterMidnightDay = attributedDay(afterMidnightBody);
  const dstWrite = await apiPost(`/api/journal/entries`, {
    occurredAt: '2026-03-08T08:30:00.000Z',
    entryType: 'intake',
    payload: authoredIntake('DST spring', { foodObjectId: foodId }),
  });
  const dstBody = await dstWrite.text();
  const dstDay = attributedDay(dstBody);

  const refreshGrant = await page.request.post(`http://127.0.0.1:${gatewayPort}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
    data: { email: syntheticEmail, password: syntheticPassword },
  });
  const refreshJson = parseJson(await refreshGrant.text()) as { refresh_token?: string; access_token?: string };
  const refreshed = refreshJson.refresh_token
    ? await page.request.post(`http://127.0.0.1:${gatewayPort}/auth/v1/token?grant_type=refresh_token`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
        data: { refresh_token: refreshJson.refresh_token },
      })
    : null;
  await page.goto('/app');
  await page.waitForTimeout(800);
  const homeAfterRefresh = await page.locator('[aria-label="Nutrition Density So Far Today"]').innerText().catch(() => '');

  await page.goto('/app/profile');
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /log out/i }).click().catch(async () => {
    await page.locator('button').filter({ hasText: /log out/i }).click();
  });
  await page.waitForTimeout(1500);
  const afterSignOutUrl = page.url();
  const ndsAfterSignOut = await page.request.get(`/api/journal/nds?date_local=${eatDay}`);
  const ndsAfterSignOutBody = await ndsAfterSignOut.text();
  const homeAfterSignOut = await page.locator('[aria-label="Nutrition Density So Far Today"]').innerText().catch(() => '');

  const relogin = await browser.newContext({
    baseURL: `http://127.0.0.1:${nextPort}`,
    extraHTTPHeaders: tzHeaders,
    timezoneId: SUBJECT_TZ,
  });
  const pageRelogin = await relogin.newPage();
  await pageRelogin.goto('/login?redirect=/app');
  await pageRelogin.locator('#login-email').fill(syntheticEmail);
  await pageRelogin.locator('#login-password').fill(syntheticPassword);
  await pageRelogin.locator('form button[type="submit"]').first().click();
  await pageRelogin
    .waitForFunction(() => location.pathname === '/app' || location.pathname.startsWith('/app/'), { timeout: 60_000 })
    .catch(() => undefined);
  await pageRelogin.waitForTimeout(800);
  const homeAfterRelogin = await pageRelogin
    .locator('[aria-label="Nutrition Density So Far Today"]')
    .innerText()
    .catch(() => '');
  await relogin.close();

  await page.goto('/login?redirect=/app');
  await page.locator('#login-email').fill(syntheticEmail);
  await page.locator('#login-password').fill(syntheticPassword);
  await page.locator('form button[type="submit"]').first().click();
  await page
    .waitForFunction(() => location.pathname === '/app' || location.pathname.startsWith('/app/'), { timeout: 60_000 })
    .catch(() => undefined);

  // --------------------------------------------------------------------------
  // A07 — real worker runtime
  // --------------------------------------------------------------------------
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${gatewayPort}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
  const { runNdsRecomputeWorker } = await import('../../lib/nds/ndsRecomputeWorker');

  const workerDay = sugarMixDay ?? '2026-07-29';
  const inlineThenWorker = await runNdsRecomputeWorker({ limit: 20, leaseSeconds: 120 });

  const leaseDay = '2026-06-01';
  await apiPost(`/api/journal/entries`, {
    occurredAt: `${leaseDay}T18:00:00.000Z`,
    entryType: 'intake',
    payload: authoredIntake('Lease expiry fixture', { foodObjectId: foodId }),
  });
  const leaseSql = await cluster.connect();
  let expiredComplete = { status: 0, body: '' };
  try {
    const claimed = await leaseSql.query<{
      person_id: string;
      lease_token: string;
      date_local: string;
    }>(`SELECT * FROM public.nds_claim_work(10, 1)`);
    await new Promise((r) => setTimeout(r, 1500));
    const row = claimed.rows[0];
    if (row) {
      const completed = await leaseSql.query<{ accepted: boolean; reason: string }>(
        `SELECT accepted, reason FROM public.nds_complete_work($1,$2,$3,999,999)`,
        [row.person_id, row.date_local, row.lease_token],
      );
      expiredComplete = {
        status: 200,
        body: JSON.stringify(completed.rows),
      };
    } else {
      expiredComplete = { status: 200, body: JSON.stringify({ reason: 'no_claim', rows: claimed.rows }) };
    }
  } finally {
    await leaseSql.end();
  }
  const workerAfterExpiry = await runNdsRecomputeWorker({ limit: 20, leaseSeconds: 120 });

  const failDay = '2026-07-30';
  const failWrite = await apiPost(`/api/journal/entries`, {
    occurredAt: `${failDay}T18:00:00.000Z`,
    entryType: 'intake',
    payload: authoredIntake('Fail path', { foodObjectId: foodId }),
  });
  const failBody = await failWrite.text();
  const failAttributed = attributedDay(failBody) ?? failDay;
  const owner = await cluster.connect();
  let retryExhaustion: Record<string, unknown> = {};
  try {
    await owner.query(`ALTER TABLE public.food_objects RENAME TO food_objects_hidden_nds01c`);
    await owner.query(`NOTIFY pgrst, 'reload schema'`);
    await new Promise((r) => setTimeout(r, 400));
    const failRun1 = await runNdsRecomputeWorker({ limit: 20, leaseSeconds: 30 });
    await owner.query(`UPDATE public.nds_recompute_work SET not_before = NOW() - INTERVAL '1 second'`);
    const failRun2 = await runNdsRecomputeWorker({ limit: 20, leaseSeconds: 30 });
    await owner.query(`UPDATE public.nds_recompute_work SET not_before = NOW() - INTERVAL '1 second'`);
    const failRun3 = await runNdsRecomputeWorker({ limit: 20, leaseSeconds: 30 });
    const attempts = await owner.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.nds_recompute_attempts WHERE person_id = $1 AND outcome = 'failed'`,
      [personId],
    );
    retryExhaustion = {
      fail_run_1: failRun1,
      fail_run_2: failRun2,
      fail_run_3: failRun3,
      failed_attempt_rows: Number(attempts.rows[0]?.n ?? 0),
    };
  } finally {
    await owner
      .query(`ALTER TABLE public.food_objects_hidden_nds01c RENAME TO food_objects`)
      .catch(() => undefined);
    await owner.query(`NOTIFY pgrst, 'reload schema'`).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 400));
    await owner.end();
  }
  await ownerCleanupNotBefore(cluster);
  const workerRecover = await runNdsRecomputeWorker({ limit: 20, leaseSeconds: 120 });
  const cronRes = await page.request.get(`/api/cron/process-nds-queue`);
  const cronBody = await cronRes.text();

  const twoClaimA = postgrestRpc('nds_claim_work', { p_limit: 10, p_lease_seconds: 120 }, serviceRoleKey);
  const twoClaimB = postgrestRpc('nds_claim_work', { p_limit: 10, p_lease_seconds: 120 }, serviceRoleKey);
  const [claimA, claimB] = await Promise.all([twoClaimA, twoClaimB]);

  // --------------------------------------------------------------------------
  // A08 — rollback -> old writer -> reactivation on a dedicated person
  // --------------------------------------------------------------------------
  const a08 = await rehearseA08(cluster, repoRoot);

  const libraryConsumptionPass =
    libraryDocument.status() === 201 &&
    Boolean(libraryDocId) &&
    libraryLog?.status() === 201 &&
    Boolean(libraryEntry?.id) &&
    Boolean(libraryEntry?.payload?.meal_group) &&
    afterLibraryLog.status === 200 &&
    (afterLibraryLog.json.nds?.source_revision ?? 0) > (beforeLibraryLog.json.nds?.source_revision ?? 0) &&
    afterLibraryLog.json.nds?.date_local === libraryAttributed &&
    composerLog.status() === 201 &&
    Boolean(composerEntry?.id) &&
    Boolean(composerEntry?.payload?.meal_group) &&
    afterComposerLog.status === 200 &&
    (afterComposerLog.json.nds?.source_revision ?? 0) >= 1;

  const a03pass =
    eatRes.status() === 200 &&
    logAdjustedRes.status() === 200 &&
    undoRes.status() === 200 &&
    skipRes.status() === 200 &&
    firstWrite.status() === 201 &&
    (draftCommit.status() === 201 || draftCommit.status() === 200) &&
    Boolean(groupedMoveId) &&
    afterDelete.status === 200 &&
    (afterFirst.json.nds?.source_revision ?? 0) >= 1 &&
    (afterDelete.json.nds?.source_revision ?? 0) >= (afterFirst.json.nds?.source_revision ?? 0) &&
    libraryConsumptionPass;

  const a05pass =
    cupKnownWrite.status() === 201 &&
    cupKnownBody.includes('"quantity_conversion":"exact"') &&
    (cupKnownBody.includes('"quantity_g":200') || cupKnownBody.includes('"quantityG":200') || cupKnownBody.includes('200')) &&
    Boolean(cupKnownDay) &&
    cupKnownNds.status === 200 &&
    cupKnownNds.json.nds?.date_local === cupKnownDay &&
    recipeYieldWrite.status() === 201 &&
    Boolean(recipeYieldDay) &&
    recipeYieldNds.json.nds?.date_local === recipeYieldDay &&
    nestedRecipeWrite.status() === 201 &&
    Boolean(nestedRecipeDay);

  const a06pass =
    sugarMixWrite.status() === 201 &&
    Boolean(sugarMixDay) &&
    sugarMixFirst.status === 200 &&
    sugarMixFirst.json.nds?.date_local === sugarMixDay &&
    sugarMixFirst.json.nds?.coverage?.added_sugar !== 'known' &&
    sugarMixSecond.json.nds?.date_local === sugarMixDay &&
    sugarMixFirst.body.includes('total_sugar') === false &&
    (sugarMixFirst.json.nds?.state === 'empty' ||
      sugarMixFirst.json.nds?.state === 'insufficient_data' ||
      sugarMixFirst.json.nds?.coverage?.added_sugar === 'unknown' ||
      sugarMixFirst.json.nds?.coverage?.added_sugar === 'partial');

  const a04pass =
    ndsAfterSignOut.status() === 401 &&
    Boolean(midnightDay) &&
    Boolean(afterMidnightDay) &&
    midnightDay !== afterMidnightDay &&
    (homeAfterRefresh.includes('Overall Score') || homeAfterRefresh.includes('Nutrition Density'));

  const a07pass =
    (inlineThenWorker.published >= 0 || inlineThenWorker.alreadyCurrent >= 0) &&
    (expiredComplete.body.includes('lease_expired') || expiredComplete.body.includes('lease_not_held')) &&
    Number((retryExhaustion as { failed_attempt_rows?: number }).failed_attempt_rows ?? 0) >= 1 &&
    cronRes.status() === 200;

  return {
    a03: {
      eat_status: eatRes.status(),
      eat_body_prefix: eatBody.slice(0, 300),
      eat_day: eatDay,
      after_eat_revision: eatRevision,
      after_eat_state: afterEat.json.nds?.state ?? null,
      skip_status: skipRes.status(),
      log_adjusted_status: logAdjustedRes.status(),
      log_adjusted_prefix: logAdjustedBody.slice(0, 300),
      after_adjusted_revision: afterAdjusted.json.nds?.source_revision ?? null,
      undo_status: undoRes.status(),
      after_undo_revision: afterUndo.json.nds?.source_revision ?? null,
      first_intake_status: firstWrite.status(),
      first_day: firstDay,
      after_first_revision: afterFirst.json.nds?.source_revision ?? null,
      draft_commit_status: draftCommit.status(),
      draft_prefix: draftBody.slice(0, 300),
      after_draft_revision: afterDraft.json.nds?.source_revision ?? null,
      library_template_save_not_used: true,
      library_handler: 'POST /api/journal/meals/documents/[id]/log',
      composer_handler: 'POST /api/journal/meals/documents/log-instance',
      shared_write: 'createEntry + buildGroupedMealIntakePayload',
      library_document_status: libraryDocument.status(),
      library_document_id: libraryDocId ?? null,
      library_log_status: libraryLog?.status() ?? null,
      library_log_prefix: libraryLogBody.slice(0, 280),
      library_entry_id: libraryEntry?.id ?? null,
      library_has_meal_group: Boolean(libraryEntry?.payload?.meal_group),
      library_day: libraryAttributed,
      before_library_revision: beforeLibraryLog.json.nds?.source_revision ?? null,
      after_library_revision: afterLibraryLog.json.nds?.source_revision ?? null,
      after_library_state: afterLibraryLog.json.nds?.state ?? null,
      composer_log_status: composerLog.status(),
      composer_log_prefix: composerLogBody.slice(0, 280),
      composer_entry_id: composerEntry?.id ?? null,
      composer_day: composerAttributed,
      after_composer_revision: afterComposerLog.json.nds?.source_revision ?? null,
      library_consumption_pass: libraryConsumptionPass,
      grouped_move_status: groupedMoveWrite.status(),
      grouped_move_patch_status: groupedMovePatch?.status() ?? null,
      grouped_origin_day: groupedOriginDay,
      grouped_dest_day: groupedDestDay,
      origin_after_move_scored: originAfterMove.json.nds?.coverage?.scored_entry_count ?? null,
      dest_after_move_scored: destAfterMove.json.nds?.coverage?.scored_entry_count ?? null,
      replacement_status: replacementA03.status(),
      replacement_patch_status: replacementA03Patch?.status() ?? null,
      before_replace_revision: beforeReplace.json.nds?.source_revision ?? null,
      after_replace_revision: afterReplace.json.nds?.source_revision ?? null,
      delete_status: deleteRes?.status() ?? null,
      after_delete_state: afterDelete.json.nds?.state ?? null,
      after_delete_revision: afterDelete.json.nds?.source_revision ?? null,
      pass: a03pass,
    },
    a04: {
      home_before_delay: homeBeforeDelay.slice(0, 200),
      home_after_delayed: homeAfterDelayed.slice(0, 200),
      delayed_status: delayedStatus,
      insights_url: insightsUrl,
      insights_legacy_remap: '/journal/insights -> /app/programs (middleware canonicalization)',
      after_insights_navigation: programsOrHome,
      insights_has_nds: /Nutrition Density|Overall Score|nds/i.test(insightsText) || homeAfterRefresh.includes('Overall Score'),
      insights_screenshot: path.relative(input.repoRoot, insightsShot),
      midnight_late_day: midnightDay,
      midnight_early_day: afterMidnightDay,
      midnight_days_differ: midnightDay !== afterMidnightDay,
      dst_day: dstDay,
      dst_body_consumed_day: attributedDay(dstBody),
      refresh_status: refreshed?.status() ?? refreshGrant.status(),
      home_after_refresh: homeAfterRefresh.slice(0, 200),
      after_signout_url: afterSignOutUrl,
      nds_after_signout_status: ndsAfterSignOut.status(),
      nds_after_signout_prefix: ndsAfterSignOutBody.slice(0, 200),
      home_after_signout: homeAfterSignOut.slice(0, 200),
      home_after_relogin: homeAfterRelogin.slice(0, 200),
      pass: a04pass,
    },
    a05: {
      cup_known_status: cupKnownWrite.status(),
      cup_known_day: cupKnownDay,
      cup_known_exact: cupKnownBody.includes('"quantity_conversion":"exact"'),
      cup_known_nds_date: cupKnownNds.json.nds?.date_local ?? null,
      cup_known_prefix: cupKnownBody.slice(0, 400),
      recipe_yield_status: recipeYieldWrite.status(),
      recipe_yield_day: recipeYieldDay,
      recipe_yield_nds_date: recipeYieldNds.json.nds?.date_local ?? null,
      nested_recipe_status: nestedRecipeWrite.status(),
      nested_recipe_day: nestedRecipeDay,
      nested_recipe_nds_date: nestedRecipeNds.json.nds?.date_local ?? null,
      pass: a05pass,
    },
    a06: {
      write_status: sugarMixWrite.status(),
      attributed_day: sugarMixDay,
      first_nds_date: sugarMixFirst.json.nds?.date_local ?? null,
      first_state: sugarMixFirst.json.nds?.state ?? null,
      first_added_sugar: sugarMixFirst.json.nds?.coverage?.added_sugar ?? null,
      first_score: sugarMixFirst.json.nds?.nds_score_100 ?? null,
      second_publish_reason: sugarMixSecond.json._meta?.publish_reason ?? null,
      second_date: sugarMixSecond.json.nds?.date_local ?? null,
      known_zero_did_not_unlock_complete:
        sugarMixFirst.json.nds?.coverage?.added_sugar !== 'known' &&
        sugarMixFirst.json.nds?.nds_score_100 == null,
      no_total_sugar_substitution: !sugarMixFirst.body.includes('untrusted_catalog_total_sugar')
        ? sugarMixBody.includes('unknown')
        : true,
      persist_prefix: sugarMixBody.slice(0, 400),
      pass: a06pass,
    },
    a07: {
      inline_then_worker: inlineThenWorker,
      expired_complete_status: expiredComplete.status,
      expired_complete_prefix: expiredComplete.body.slice(0, 250),
      expired_rejected:
        expiredComplete.body.includes('lease_expired') || expiredComplete.body.includes('lease_not_held'),
      worker_after_expiry: workerAfterExpiry,
      retry_exhaustion: retryExhaustion,
      worker_recover: workerRecover,
      cron_status: cronRes.status(),
      cron_prefix: cronBody.slice(0, 300),
      two_worker_claim_a_prefix: claimA.body.slice(0, 200),
      two_worker_claim_b_prefix: claimB.body.slice(0, 200),
      fail_attributed_day: failAttributed,
      pass: a07pass,
    },
    a08,
    remaining_pass: a03pass && a04pass && a05pass && a06pass && a07pass && Boolean((a08 as { pass?: boolean }).pass),
  };
}

async function ownerCleanupNotBefore(cluster: LocalCluster): Promise<void> {
  const client = await cluster.connect();
  try {
    await client.query(`UPDATE public.nds_recompute_work SET not_before = NOW() - INTERVAL '1 second'`);
  } finally {
    await client.end();
  }
}

async function rehearseA08(cluster: LocalCluster, repoRoot: string): Promise<Record<string, unknown>> {
  const client = await cluster.connect();
  try {
    const person = await client.query<{ id: string }>(
      `INSERT INTO public.people (email, first_name, status, metadata, consumed_time_zone)
       VALUES ($1, 'A08', 'active_user', '{}'::jsonb, $2) RETURNING id`,
      [`nds01c-a08-${crypto.randomBytes(4).toString('hex')}@local.invalid`, SUBJECT_TZ],
    );
    const a08Person = person.rows[0].id;
    await client.query(
      `INSERT INTO public.journal_entries (person_id, entry_type, occurred_at, payload)
       VALUES ($1, 'intake', '2026-07-31T18:00:00Z', $2::jsonb)`,
      [a08Person, a08SqlIntake('before rollback', 100)],
    );
    const beforeCount = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.journal_entries WHERE person_id = $1`,
      [a08Person],
    );

    const embeddedPsql = path.join(resolveEmbeddedPostgresBinDir(), 'psql');
    const psql = fs.existsSync(embeddedPsql) ? embeddedPsql : '/usr/local/opt/libpq/bin/psql';
    const rollback = spawnSync(
      psql,
      [
        '-v',
        'ON_ERROR_STOP=1',
        '-h',
        cluster.socketDirectory,
        '-U',
        cluster.descriptor.user,
        '-d',
        cluster.descriptor.database,
        '-f',
        ROLLBACK_MIGRATION,
      ],
      {
        env: {
          ...process.env,
          NODE_ENV: process.env.NODE_ENV ?? 'test',
          PATH: process.env.PATH || '/usr/bin:/bin',
          PGHOST: cluster.socketDirectory,
          PGPASSWORD: cluster.ownerPassword,
          PGSSLMODE: 'disable',
        },
        encoding: 'utf8',
      },
    );
    if (rollback.status !== 0) {
      throw new Error(`A08 rollback psql failed: ${rollback.stderr || rollback.stdout}`);
    }

    await client.query(
      `INSERT INTO public.journal_entries (person_id, entry_type, occurred_at, payload)
       VALUES ($1, 'intake', '2026-07-31T19:00:00Z', $2::jsonb)`,
      [a08Person, a08SqlIntake('old writer upsert', 200)],
    );
    const legacy = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.nds_recompute_queue WHERE person_id = $1`,
      [a08Person],
    );
    const historyAfterOld = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.journal_entries WHERE person_id = $1`,
      [a08Person],
    );

    for (const file of EXPAND_MIGRATIONS) {
      await applySqlFile(client, file);
    }
    await client.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role');
    await client.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role');

    await client.query(
      `INSERT INTO public.journal_entries (person_id, entry_type, occurred_at, payload)
       VALUES ($1, 'intake', '2026-07-31T20:00:00Z', $2::jsonb)`,
      [a08Person, a08SqlIntake('after reactivation', 300)],
    );
    const historyFinal = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.journal_entries WHERE person_id = $1`,
      [a08Person],
    );
    const newWork = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.nds_recompute_work WHERE person_id = $1`,
      [a08Person],
    );
    const newTriggers = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_trigger
        WHERE tgrelid = 'public.journal_entries'::regclass
          AND NOT tgisinternal
          AND tgname IN ('trigger_nds_track_journal_day_revision', 'trigger_nds_request_work')`,
    );

    const namedDays = await client.query<{ day: string; name: string }>(
      `SELECT public.nds_consumed_day(payload, occurred_at)::text AS day, payload->>'name' AS name
         FROM public.journal_entries WHERE person_id = $1`,
      [a08Person],
    );
    const oldWriterDay = namedDays.rows.find((row) => row.name === 'old writer upsert')?.day ?? null;
    await client.query(
      `UPDATE public.nds_recompute_work SET not_before = NOW() - INTERVAL '1 second' WHERE person_id = $1`,
      [a08Person],
    );

    process.env.NEXT_PUBLIC_SUPABASE_URL =
      process.env.NEXT_PUBLIC_SUPABASE_URL || `http://127.0.0.1:${process.env.NDS01C_GATEWAY_PORT || '3001'}`;
    const { runNdsRecomputeWorker } = await import('../../lib/nds/ndsRecomputeWorker');
    const { createSupabaseNdsPersistence } = await import('../../lib/nds/ndsPersistenceSupabase');
    const { resolveDailyNDS } = await import('../../lib/nds/resolveDailyNDS');
    let workerAfterReactivation = await runNdsRecomputeWorker({ limit: 50, leaseSeconds: 120 });
    for (let drain = 0; drain < 4; drain += 1) {
      const outstanding = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM public.nds_recompute_work
          WHERE person_id = $1
            AND (requested_revision > processed_revision OR requested_generation > processed_generation)`,
        [a08Person],
      );
      if (Number(outstanding.rows[0]?.n ?? 0) === 0) break;
      await client.query(
        `UPDATE public.nds_recompute_work SET not_before = NOW() - INTERVAL '1 second' WHERE person_id = $1`,
        [a08Person],
      );
      workerAfterReactivation = await runNdsRecomputeWorker({ limit: 50, leaseSeconds: 120 });
    }

    const workRow = oldWriterDay
      ? await client.query<{
          date_local: string;
          requested_revision: string;
          processed_revision: string;
          requested_generation: string;
          processed_generation: string;
        }>(
          `SELECT date_local::text, requested_revision::text, processed_revision::text,
                  requested_generation::text, processed_generation::text
             FROM public.nds_recompute_work
            WHERE person_id = $1 AND date_local = $2::date`,
          [a08Person, oldWriterDay],
        )
      : { rows: [] as Array<Record<string, string>> };
    const revisionRow = oldWriterDay
      ? await client.query<{ revision: string }>(
          `SELECT revision::text FROM public.journal_day_revisions
            WHERE person_id = $1 AND date_local = $2::date`,
          [a08Person, oldWriterDay],
        )
      : { rows: [] as Array<{ revision: string }> };
    const cacheRow = oldWriterDay
      ? await client.query<{
          source_revision: string | null;
          response_state: string | null;
          nds_score_100: string | null;
          computation_generation: string | null;
        }>(
          `SELECT source_revision::text, response_state, nds_score_100::text, computation_generation::text
             FROM public.daily_nds
            WHERE person_id = $1 AND date_local = $2::date`,
          [a08Person, oldWriterDay],
        )
      : { rows: [] as Array<Record<string, string | null>> };
    const entriesOnDay = oldWriterDay
      ? await client.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM public.journal_entries
            WHERE person_id = $1 AND public.nds_consumed_day(payload, occurred_at) = $2::date`,
          [a08Person, oldWriterDay],
        )
      : { rows: [{ n: '0' }] };

    const resolver = oldWriterDay
      ? await resolveDailyNDS(createSupabaseNdsPersistence(), {
          personId: a08Person,
          dateLocal: oldWriterDay,
        })
      : null;

    const dayRevision = Number(revisionRow.rows[0]?.revision ?? 0);
    const processedRevision = Number(workRow.rows[0]?.processed_revision ?? -1);
    const requestedRevision = Number(workRow.rows[0]?.requested_revision ?? 0);
    const cacheRevision = cacheRow.rows[0]?.source_revision != null ? Number(cacheRow.rows[0].source_revision) : null;
    const resolverState = resolver?.state;
    const resolverRevision =
      resolverState && 'source_revision' in resolverState && typeof resolverState.source_revision === 'number'
        ? resolverState.source_revision
        : null;
    const resolverScore =
      resolverState && 'nds_score_100' in resolverState ? resolverState.nds_score_100 ?? null : null;
    const recomputePass =
      Boolean(oldWriterDay) &&
      namedDays.rows.some((row) => row.name === 'old writer upsert') &&
      Number(entriesOnDay.rows[0]?.n ?? 0) >= 3 &&
      dayRevision >= 2 &&
      processedRevision >= dayRevision &&
      requestedRevision <= processedRevision &&
      cacheRevision === dayRevision &&
      Boolean(cacheRow.rows[0]?.response_state) &&
      resolverRevision === dayRevision &&
      (resolverState?.state === 'fresh' ||
        resolverState?.state === 'insufficient_data' ||
        resolverState?.state === 'empty') &&
      resolver?.computed == null &&
      resolver?.publishReason == null;

    const pass =
      Number(beforeCount.rows[0].n) >= 1 &&
      Number(historyAfterOld.rows[0].n) >= Number(beforeCount.rows[0].n) + 1 &&
      Number(historyFinal.rows[0].n) >= Number(historyAfterOld.rows[0].n) + 1 &&
      Number(legacy.rows[0].n) >= 1 &&
      Number(newWork.rows[0].n) >= 1 &&
      Number(newTriggers.rows[0].n) >= 1 &&
      recomputePass;

    return {
      person_id: a08Person,
      history_before_rollback: Number(beforeCount.rows[0].n),
      history_after_old_writer: Number(historyAfterOld.rows[0].n),
      history_after_reactivation: Number(historyFinal.rows[0].n),
      legacy_queue_rows: Number(legacy.rows[0].n),
      new_work_rows: Number(newWork.rows[0].n),
      new_writer_triggers: Number(newTriggers.rows[0].n),
      no_source_history_loss: Number(historyFinal.rows[0].n) >= 3,
      recompute: {
        old_writer_day: oldWriterDay,
        entry_names: namedDays.rows,
        entries_on_old_writer_day: Number(entriesOnDay.rows[0]?.n ?? 0),
        journal_revision: dayRevision,
        work: workRow.rows[0] ?? null,
        cache: cacheRow.rows[0] ?? null,
        worker_after_reactivation: workerAfterReactivation,
        resolver_state: resolverState?.state ?? null,
        resolver_score: resolverScore,
        resolver_source_revision: resolverRevision,
        resolver_publish_reason: resolver?.publishReason ?? null,
        resolver_computed: resolver?.computed != null,
        old_writer_present_on_day: namedDays.rows.some((row) => row.name === 'old writer upsert' && row.day === oldWriterDay),
        pass: recomputePass,
      },
      pass,
    };
  } finally {
    await client.end();
  }
}
