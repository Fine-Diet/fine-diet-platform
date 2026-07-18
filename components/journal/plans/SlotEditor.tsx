'use client';

/**
 * SlotEditor
 *
 * Minimal inline editor for a PlannedMeal. Used in two modes:
 *
 *   - Edit mode (`mode: 'edit'`): seeded from an existing PlannedMeal.
 *     On save, calls onSave with the patched fields. The day page
 *     translates to planService.updateMeal.
 *
 *   - Create mode (`mode: 'create'`): used to re-fill an empty slot
 *     after a meal was removed. By default opens in the "pick from
 *     saved meals" view, because the typical intent is to re-add from
 *     the user's stored meal bank rather than hand-roll a new entry.
 *     Falls back to a manual entry form (name / type / totals) via a
 *     "Enter manually instead" affordance — or automatically when the
 *     user has no saved templates yet.
 *
 * More advanced editing (per-item edits, food_object attach, restaurant
 * attach) is out of scope for Phase 2; this editor covers the "user
 * tweaks / re-fills a stub slot" path the core UI exercises.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { journalService, type MealTemplate, type MealTemplateItem } from '@/lib/journal';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { planService } from '@/lib/plans';
import type { ImportedMeal, PlannedMeal, PlannedMealType, PlanSlot } from '@/lib/plans';
import { scalePayloadToServings } from '@/lib/plans/attachUtils';

type SaveShape = {
  name: string;
  meal_type: PlannedMealType;
  payload: PlannedMeal['payload'];
};

interface SlotEditorEditProps {
  mode?: 'edit';
  meal: PlannedMeal;
  slot?: undefined;
  onSave: (patch: SaveShape) => void | Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}

interface SlotEditorCreateProps {
  mode: 'create';
  slot: PlanSlot;
  meal?: undefined;
  onSave: (patch: SaveShape) => void | Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}

type SlotEditorProps = SlotEditorEditProps | SlotEditorCreateProps;

type MealTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type PayloadShape = {
  items?: Array<Record<string, unknown>>;
  totals?: Partial<MealTotals>;
  notes_md?: string;
};

function readTotals(meal: PlannedMeal): MealTotals {
  const totals = (meal.payload as PayloadShape).totals ?? {};
  return {
    calories: Number(totals.calories ?? 0),
    protein_g: Number(totals.protein_g ?? 0),
    carbs_g: Number(totals.carbs_g ?? 0),
    fat_g: Number(totals.fat_g ?? 0),
  };
}

/**
 * Exported so PlanMealComposerPanel (Phase 3: Plans integration) can default
 * its own meal-type select the same way, without duplicating this rule.
 */
export function defaultMealTypeForSlot(slot: PlanSlot): PlannedMealType {
  if (slot.slot_block === 'morning') return 'breakfast';
  if (slot.slot_block === 'midday') return 'lunch';
  if (slot.slot_block === 'evening') return 'dinner';
  return 'other';
}

// ============================================================================
// Template → Plans payload conversion
// ============================================================================

function totalsFromTemplateItems(items: MealTemplateItem[]): MealTotals {
  const acc: MealTotals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  for (const it of items) {
    if (typeof it.calories === 'number') acc.calories += it.calories;
    if (it.macros) {
      if (typeof it.macros.protein === 'number') acc.protein_g += it.macros.protein;
      if (typeof it.macros.carbs === 'number') acc.carbs_g += it.macros.carbs;
      if (typeof it.macros.fat === 'number') acc.fat_g += it.macros.fat;
    }
  }
  return {
    calories: Math.round(acc.calories),
    protein_g: Math.round(acc.protein_g * 10) / 10,
    carbs_g: Math.round(acc.carbs_g * 10) / 10,
    fat_g: Math.round(acc.fat_g * 10) / 10,
  };
}

/**
 * Packet 5 QA guard: returns false when a payload we're about to
 * attach to a slot has totals.calories <= 0 AND totals.protein_g <= 0
 * AND no item carries numeric nutrition. That combination is what
 * produced the live "Creamy Garlic Chicken Recipe · 0 cal" slot —
 * the upstream recipe parser lost per-item calories and the template
 * promote path failed to backfill provenance. We refuse to attach
 * rather than silently writing a zero-nutrition planned_meal.
 */
function payloadHasUsableNutrition(payload: PlannedMeal['payload']): boolean {
  const p = payload as unknown as {
    totals?: { calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number };
    items?: Array<{
      calories?: number | null;
      macros?:
        | { protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null }
        | null;
    }>;
  };
  const t = p.totals ?? {};
  if (typeof t.calories === 'number' && t.calories > 0) return true;
  if (typeof t.protein_g === 'number' && t.protein_g > 0) return true;
  const items = p.items ?? [];
  for (const it of items) {
    if (typeof it.calories === 'number' && it.calories > 0) return true;
    const m = it.macros ?? null;
    if (
      m &&
      ((typeof m.protein_g === 'number' && m.protein_g > 0) ||
        (typeof m.carbs_g === 'number' && m.carbs_g > 0) ||
        (typeof m.fat_g === 'number' && m.fat_g > 0))
    ) {
      return true;
    }
  }
  return false;
}

function templateToPayload(template: MealTemplate): PlannedMeal['payload'] {
  const items = template.items.map((it) => ({
    name: it.name ?? null,
    quantity: it.quantity ?? null,
    unit: it.unit ?? null,
    calories: typeof it.calories === 'number' ? it.calories : null,
    macros: it.macros
      ? {
          protein_g: it.macros.protein ?? null,
          carbs_g: it.macros.carbs ?? null,
          fat_g: it.macros.fat ?? null,
        }
      : null,
    food_object_id: it.foodObjectId ?? null,
    serving_size_g: it.servingSizeG ?? null,
  }));
  const totals = totalsFromTemplateItems(template.items);
  return {
    items,
    totals,
    source_template_id: template.id,
  } as unknown as PlannedMeal['payload'];
}

// ============================================================================
// Component
// ============================================================================

export function SlotEditor(props: SlotEditorProps) {
  const isCreate = props.mode === 'create';
  const { onSave, onCancel, busy } = props;

  const initialName = isCreate ? '' : (props.meal.name ?? '');
  const initialType: PlannedMealType = isCreate
    ? defaultMealTypeForSlot(props.slot)
    : props.meal.meal_type;
  const initialTotals: MealTotals = isCreate
    ? { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    : readTotals(props.meal);

  const [name, setName] = useState<string>(initialName);
  const [mealType, setMealType] = useState<PlannedMealType>(initialType);
  const [totals, setTotals] = useState<MealTotals>(initialTotals);

  // Packet 35 — servings scaling state for the import picker.
  // When the user clicks an import that has a known servings count, we park
  // the selection here and show an inline "how many servings?" step before
  // committing the attach. Null means no pending scaling step is open.
  const [pendingImport, setPendingImport] = useState<{
    imp: ImportedMeal;
    base: number;
  } | null>(null);
  const [pendingServingsTarget, setPendingServingsTarget] = useState<string>('');

  // Create-mode only: template picker state.
  // Start in 'pick' so the user's saved meal bank is the lead path.
  // Phase 4 additionally loads imported-meal drafts so the user can
  // attach a draft directly without first promoting it.
  const [createSubMode, setCreateSubMode] = useState<'pick' | 'manual'>('pick');
  const [templates, setTemplates] = useState<MealTemplate[] | null>(null);
  const [imports, setImports] = useState<ImportedMeal[] | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState<boolean>(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  /**
   * Packet 5 QA: surfaced when the picker refuses to attach a saved
   * meal or imported draft because its nutrition data is entirely
   * missing (0 cal, 0 macros, no per-item numbers). Silently attaching
   * a zero-nutrition meal was the Packet 4 carryover that produced the
   * live Dinner slot showing "0 cal" — this guard prevents recurrence.
   */
  const [attachError, setAttachError] = useState<string | null>(null);

  useEffect(() => {
    if (!isCreate) return;
    let cancelled = false;
    setTemplatesLoading(true);
    setTemplatesError(null);
    Promise.all([
      journalService.listMealTemplates().catch((): MealTemplate[] => []),
      planService.listImports().catch((): ImportedMeal[] => []),
    ])
      .then(([list, importList]) => {
        if (cancelled) return;
        setTemplates(list);
        setImports(importList);
        // If the user has nothing saved or imported, fall straight into
        // manual mode so they aren't staring at an empty picker.
        if (list.length === 0 && importList.length === 0) {
          setCreateSubMode('manual');
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTemplates([]);
        setImports([]);
        setTemplatesError(
          err instanceof Error ? err.message : 'Could not load saved meals.',
        );
        setCreateSubMode('manual');
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isCreate]);

  const sortedTemplates = useMemo(
    () => (templates ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [templates],
  );
  const sortedImports = useMemo(
    () =>
      (imports ?? [])
        .slice()
        .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '')),
    [imports],
  );

  async function handlePickTemplate(template: MealTemplate) {
    const payload = templateToPayload(template);
    if (!payloadHasUsableNutrition(payload)) {
      setAttachError(
        `"${template.name}" has no nutrition data saved. Edit the saved meal to add calories or quantities before attaching it to a slot.`,
      );
      return;
    }
    setAttachError(null);
    await onSave({
      name: template.name,
      meal_type: mealType,
      payload,
    });
  }

  /**
   * Attach an imported-meal draft directly to the slot without first
   * promoting it to a reusable template. The draft's `payload` is the
   * attachable shape (items + totals) already computed at import time,
   * so this mirrors the template attach path for NDS consistency. A
   * `source_imported_meal_id` marker is carried in the payload so
   * provenance is preserved on the planned_meal row.
   *
   * Packet 35: when the draft carries a known servings count, clicking
   * an import enters a servings-scaling step before the attach commits.
   * If no servings are available, the attach proceeds immediately as
   * before (no scaling step, no false baseline claim).
   */
  async function handlePickImport(imp: ImportedMeal) {
    const basePayload = (imp.payload as unknown as Record<string, unknown>) ?? {};
    const provenancePayload = {
      ...basePayload,
      source_imported_meal_id: imp.id,
    } as unknown as PlannedMeal['payload'];
    if (!payloadHasUsableNutrition(provenancePayload)) {
      setAttachError(
        `"${imp.title}" was imported without nutrition data. Open the import, add per-item calories or a meal total, then try again.`,
      );
      return;
    }
    setAttachError(null);

    const baseServings = imp.parsed_payload_json?.servings ?? null;
    if (baseServings && baseServings > 0) {
      // Enter the scaling step — user must confirm or skip before the
      // attach fires. This keeps the original import yield as source
      // truth and scales only the payload being written to the plan.
      setPendingImport({ imp, base: baseServings });
      setPendingServingsTarget(String(baseServings));
      return;
    }

    // No servings available — attach at as-is nutrition (can't scale).
    await onSave({ name: imp.title, meal_type: mealType, payload: provenancePayload });
  }

  /**
   * Packet 35 — Confirm the scaling step and attach the import.
   * @param skipScaling true = attach at imported nutrition as-is.
   */
  async function handleConfirmScaledImport(skipScaling = false) {
    if (!pendingImport) return;
    const { imp, base } = pendingImport;

    const basePayload = {
      ...(imp.payload as unknown as Record<string, unknown>),
      source_imported_meal_id: imp.id,
    } as unknown as PlannedMeal['payload'];

    let payload = basePayload;
    if (!skipScaling) {
      const target = parseFloat(pendingServingsTarget);
      if (!isNaN(target) && target > 0 && target !== base) {
        payload = scalePayloadToServings(basePayload, base, target);
      }
    }

    setPendingImport(null);
    setPendingServingsTarget('');
    await onSave({ name: imp.title, meal_type: mealType, payload });
  }

  async function handleSubmitManual(e: React.FormEvent) {
    e.preventDefault();
    const base: PayloadShape = isCreate
      ? {}
      : ((props.meal.payload as PayloadShape) ?? {});
    const nextPayload: PlannedMeal['payload'] = {
      ...base,
      totals,
      items: base.items ?? [],
    } as PlannedMeal['payload'];
    await onSave({ name, meal_type: mealType, payload: nextPayload });
  }

  // --------------------------------------------------------------------------
  // Edit mode renders straight into the manual form (unchanged behavior).
  // Create mode defaults to the picker with a manual-entry escape hatch.
  // --------------------------------------------------------------------------

  if (isCreate && createSubMode === 'pick') {
    return (
      <div className="rounded-2xl bg-white/[0.06] p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] uppercase tracking-wider text-white/40 antialiased">
            Add meal to this slot
          </p>
          <div className="flex gap-1.5">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/[0.06] text-[11px] text-white/70 antialiased">
              From saved meals
            </span>
          </div>
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
            Slot type
          </label>
          <select
            value={mealType}
            onChange={(e) => setMealType(e.target.value as PlannedMealType)}
            className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400"
          >
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
            <option value="other">Other</option>
          </select>
        </div>

        {attachError && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
            <p className="text-xs text-amber-200 antialiased">{attachError}</p>
          </div>
        )}

        {/* Packet 35 — Servings scaling step. Shown when user picks an
            import that has a known yield; hides the picker list until
            the user confirms or cancels. */}
        {pendingImport !== null ? (
          <div className="rounded-xl bg-denim-500/10 border border-denim-500/25 p-4 space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 antialiased mb-0.5">
                Attaching import
              </p>
              <p className="text-sm font-medium text-white antialiased truncate">
                {pendingImport.imp.title}
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] text-white/60 antialiased">
                Recipe makes{' '}
                <span className="text-white font-medium">
                  {pendingImport.base} serving{pendingImport.base === 1 ? '' : 's'}
                </span>
                . Servings for this slot:
              </p>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={pendingServingsTarget}
                onChange={(e) => setPendingServingsTarget(e.target.value)}
                className="w-24 rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-1.5 focus:outline-none focus:border-denim-400"
              />
              <p className="text-[10px] text-white/40 antialiased">
                Nutrition totals and per-item values scale proportionally.
                The original import yield is preserved on the draft.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirmScaledImport(false)}
                className="flex-1 py-2.5 rounded-full bg-denim-500/20 hover:bg-denim-500/30 disabled:opacity-50 transition-colors text-sm font-semibold text-denim-200 antialiased"
              >
                {busy ? 'Adding…' : 'Add to slot'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirmScaledImport(true)}
                className="text-xs text-white/50 hover:text-white/70 disabled:text-white/30 transition-colors antialiased"
              >
                Skip scaling
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPendingImport(null);
                  setPendingServingsTarget('');
                }}
                className="text-xs text-white/50 hover:text-white/70 disabled:text-white/30 transition-colors antialiased"
              >
                Back
              </button>
            </div>
          </div>
        ) : templatesLoading ? (
          <div className="rounded-xl bg-white/[0.03] p-3">
            <p className="text-xs text-white/50 antialiased">Loading saved meals…</p>
          </div>
        ) : templatesError ? (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
            <p className="text-xs text-red-200 antialiased">{templatesError}</p>
          </div>
        ) : sortedTemplates.length === 0 && sortedImports.length === 0 ? (
          <div className="rounded-xl bg-white/[0.03] p-3 space-y-2">
            <p className="text-xs text-white/60 antialiased">
              You don&apos;t have any saved meals yet. Save a meal from
              the Journal, or import a recipe to reuse it here.
            </p>
            <Link
              href={APP_ROUTES.planImportNew}
              className="inline-block text-[11px] text-denim-300 hover:text-denim-200 antialiased"
            >
              Import a recipe →
            </Link>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {sortedTemplates.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-white/40 antialiased">
                  Saved meals
                </p>
                {sortedTemplates.map((t) => {
                  const totalsPreview = totalsFromTemplateItems(t.items);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={busy}
                      onClick={() => handlePickTemplate(t)}
                      className="w-full text-left rounded-xl bg-white/[0.03] hover:bg-white/[0.06] disabled:opacity-50 transition-colors p-3"
                    >
                      <p className="text-sm font-medium text-white antialiased truncate">
                        {t.name}
                      </p>
                      <p className="text-[11px] text-white/50 antialiased mt-0.5">
                        {t.items.length} item{t.items.length === 1 ? '' : 's'}
                        {totalsPreview.calories > 0
                          ? ` · ${Math.round(totalsPreview.calories)} cal`
                          : ''}
                        {totalsPreview.protein_g > 0
                          ? ` · ${Math.round(totalsPreview.protein_g)}g protein`
                          : ''}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            {sortedImports.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <p className="text-[10px] uppercase tracking-wider text-white/40 antialiased">
                    Imported drafts
                  </p>
                  <Link
                    href={APP_ROUTES.planImportNew}
                    className="text-[10px] text-denim-300 hover:text-denim-200 antialiased"
                  >
                    Import another →
                  </Link>
                </div>
                {sortedImports.slice(0, 12).map((imp) => {
                  const totalsShape = imp.payload as unknown as {
                    totals?: { calories?: number; protein_g?: number };
                  };
                  const cal = totalsShape.totals?.calories ?? 0;
                  const prot = totalsShape.totals?.protein_g ?? 0;
                  return (
                    <button
                      key={imp.id}
                      type="button"
                      disabled={busy}
                      onClick={() => handlePickImport(imp)}
                      className="w-full text-left rounded-xl bg-white/[0.03] hover:bg-white/[0.06] disabled:opacity-50 transition-colors p-3"
                    >
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white antialiased truncate">
                          {imp.title}
                        </p>
                        {imp.parse_status === 'manual_review' && (
                          <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[10px] bg-amber-500/10 text-amber-200 antialiased">
                            Needs review
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-white/50 antialiased mt-0.5">
                        Draft
                        {imp.source_platform ? ` · ${imp.source_platform}` : ''}
                        {cal > 0 ? ` · ${Math.round(cal)} cal` : ''}
                        {prot > 0 ? ` · ${Math.round(prot)}g protein` : ''}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => setCreateSubMode('manual')}
            disabled={busy}
            className="text-xs font-medium text-denim-300 hover:text-denim-200 disabled:text-white/30 transition-colors antialiased"
          >
            Enter manually instead
          </button>
          <span className="text-white/20">·</span>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-xs text-white/60 hover:text-white/80 transition-colors antialiased"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const title = isCreate ? 'Add meal to this slot' : 'Edit meal';
  const submitLabel = busy ? 'Saving…' : isCreate ? 'Add meal' : 'Save';

  return (
    <form
      onSubmit={handleSubmitManual}
      className="rounded-2xl bg-white/[0.06] p-4 space-y-3"
    >
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] uppercase tracking-wider text-white/40 antialiased">
          {title}
        </p>
        {isCreate && (
          <button
            type="button"
            onClick={() => setCreateSubMode('pick')}
            disabled={busy}
            className="text-[11px] text-denim-300 hover:text-denim-200 antialiased"
          >
            ← Pick from saved meals
          </button>
        )}
      </div>

      <div>
        <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
          Meal name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isCreate ? 'e.g., Greek yogurt + berries' : undefined}
          className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400"
        />
      </div>

      <div>
        <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
          Type
        </label>
        <select
          value={mealType}
          onChange={(e) => setMealType(e.target.value as PlannedMealType)}
          className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400"
        >
          <option value="breakfast">Breakfast</option>
          <option value="lunch">Lunch</option>
          <option value="dinner">Dinner</option>
          <option value="snack">Snack</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(['calories', 'protein_g', 'carbs_g', 'fat_g'] as const).map((k) => (
          <div key={k}>
            <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
              {k.replace('_g', ' (g)')}
            </label>
            <input
              type="number"
              min={0}
              value={totals[k]}
              onChange={(e) =>
                setTotals((t) => ({ ...t, [k]: Number(e.target.value) }))
              }
              className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400"
            />
          </div>
        ))}
      </div>

      <p className="text-[11px] text-white/30 antialiased">
        Totals drive NDS projection. Per-item edits are coming in a later phase.
      </p>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={busy || name.trim().length === 0}
          className="rounded-full bg-denim-500/20 hover:bg-denim-500/30 disabled:bg-white/[0.04] disabled:text-white/40 transition-colors px-4 py-2 text-sm font-medium text-denim-200 antialiased"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-full px-4 py-2 text-sm text-white/60 hover:text-white/80 transition-colors antialiased"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
