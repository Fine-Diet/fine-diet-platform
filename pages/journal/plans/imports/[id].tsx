'use client';

/**
 * /journal/plans/imports/[id] — Phase 4 recipe/meal import review.
 *
 * Displays the structured draft (title, servings, ingredients, steps),
 * the nutrition estimate (with its own confidence band, separate from
 * NDS confidence), ingredient match review, and the attachable
 * meal-level NDS. Supports:
 *
 *   - Editing title, servings, description
 *   - Per-ingredient field edits (name / amount / unit / prep note)
 *   - Per-step edits, reorder, remove
 *   - Saving the draft (PATCH /api/journal/plans/imports/meals/[id])
 *   - Promoting to a reusable saved meal
 *     (POST /api/journal/plans/imports/meals/[id]/save)
 *
 * Instruction-separation guarantee (Packet 4 QA verification):
 *   - Steps live ONLY on `parsed_payload_json.steps` (draft-only).
 *   - The attachable `payload.items` is built from ingredients only
 *     (`recipeImporter.buildAttachablePayload`).
 *   - Promotion (`promoteImportedMealToTemplate`) maps attachable.items
 *     only — steps are never read.
 *   - Slot attach (SlotEditor.handlePickImport / handlePickTemplate)
 *     copies the attachable items; no step source exists.
 *   - Journal log apply (`log.tsx handleApplySavedMeal`) iterates
 *     `template.items`; steps never appear.
 * So instructions cannot flow into nutrition, NDS, or journal entries.
 *
 * Transparency guarantee: the server PATCH handler recomputes the
 * attachable payload, nutrition estimate, match table, and meal-level
 * NDS from `parsed_payload_json.ingredients` whenever the draft
 * changes (`rebuildDerivedFromIngredients`). Edits made here flow
 * through to templates and plan slots without client-side math.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import {
  planService,
  type Plan,
  type PlanDay,
  type PlanSlot,
  type PlannedMeal,
  type PlannedMealType,
  type ImportedMeal,
  type ImportedMealDraftIngredient,
  type ImportedMealDraftPayload,
  type ImportedMealDraftStep,
  type IngredientMatchEntry,
  type NutritionEstimate,
  type SourceSearchCandidate,
} from '@/lib/plans';
import { scalePayloadToServings } from '@/lib/plans/attachUtils';
import {
  parseIngredientPhrase,
  rebuildRawTextFromStructured,
} from '@/lib/plans/ingredientPhraseParser';
import {
  classifyMatchEntry,
  type SuggestedSourceEligibility,
} from '@/lib/plans/suggestedSourceEligibility';

function statusStyle(status: ImportedMeal['parse_status']): string {
  switch (status) {
    case 'parsed':
      return 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30';
    case 'manual_review':
      return 'bg-amber-500/15 text-amber-200 border-amber-500/30';
    case 'failed':
      return 'bg-red-500/15 text-red-200 border-red-500/30';
    default:
      return 'bg-white/[0.08] text-white/70 border-white/10';
  }
}

function statusLabel(status: ImportedMeal['parse_status']): string {
  switch (status) {
    case 'parsed':
      return 'Parsed';
    case 'manual_review':
      return 'Needs review';
    case 'failed':
      return 'Parse failed';
    default:
      return 'Pending';
  }
}

function confidenceLabel(c: NutritionEstimate['confidence']): string {
  return c === 'high'
    ? 'High confidence'
    : c === 'medium'
      ? 'Medium confidence'
      : 'Low confidence';
}

export default function ImportDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;

  const [imported, setImported] = useState<ImportedMeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoteMsg, setPromoteMsg] = useState<string | null>(null);

  // Local edit state — only commits on Save. We hold the full draft
  // shape so we can edit title, servings, description, ingredients,
  // and steps without a round trip per keystroke.
  //
  // Packet 4 QA gap: the prior editor only supported add/remove on
  // ingredients and had no inline edit for existing items, steps, or
  // description. This page is the only place a user can review an
  // imported draft before promoting it to a saved meal, so it must
  // support full field-level edits.
  const [title, setTitle] = useState<string>('');
  const [servings, setServings] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [ingredients, setIngredients] = useState<ImportedMealDraftIngredient[]>([]);
  const [steps, setSteps] = useState<ImportedMealDraftStep[]>([]);
  const [newIngredient, setNewIngredient] = useState<string>('');
  const [newStep, setNewStep] = useState<string>('');

  // Packet 28 — row-level source adoption workflow.
  //   `reviewingIdx`: which ingredient row is expanded into the
  //       "Review source" preview panel (review-first partials).
  //   `sourceBusyIdx`: the row currently awaiting a server response
  //       for an apply/reject/undo POST. We block that row's
  //       controls so double-taps don't race.
  //   `sourceError`: last error message from a source action, shown
  //       inline next to the affected row.
  const [reviewingIdx, setReviewingIdx] = useState<number | null>(null);
  const [sourceBusyIdx, setSourceBusyIdx] = useState<number | null>(null);
  const [sourceError, setSourceError] = useState<{ idx: number; message: string } | null>(
    null,
  );

  // Packet 29 — row-level trusted-source search panel state.
  //   `searchOpenIdx`: which ingredient row has its "Find source" /
  //       "Replace source" panel open. Only one at a time to keep the
  //       UI focused and avoid concurrent searches.
  //   `searchQuery`: current input in the open panel.
  //   `searchResults`: cached candidates for the current query.
  //   `searchBusy` / `searchError`: network state for the search.
  const [searchOpenIdx, setSearchOpenIdx] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SourceSearchCandidate[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Packet 29 — row-level in-place save state.
  //   `savingRowIdx`: the row currently awaiting a server response on
  //       the row-save endpoint. We block that row's Save button so
  //       double-taps don't race.
  //   `rowSaveError`: last error message from a row save.
  const [savingRowIdx, setSavingRowIdx] = useState<number | null>(null);
  const [rowSaveError, setRowSaveError] = useState<
    { idx: number; message: string } | null
  >(null);

  // Packet 35 — "Add to Plan" inline panel state.
  //
  // Flow: open panel → load plans → user picks date + plan → load day
  // slots → user picks slot + optionally adjusts servings → confirm
  // attach → write planned_meal with source_imported_meal_id provenance.
  //
  // attachPlans: null = not yet loaded; [] = no plans found.
  // attachDayData: null = day not yet loaded or date not found in plan.
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachPlans, setAttachPlans] = useState<Plan[] | null>(null);
  const [attachPlanId, setAttachPlanId] = useState<string | null>(null);
  const [attachDate, setAttachDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10),
  );
  const [attachDayData, setAttachDayData] = useState<{
    day: PlanDay;
    slots: PlanSlot[];
    meals: PlannedMeal[];
  } | null>(null);
  const [attachDayLoading, setAttachDayLoading] = useState(false);
  const [attachDayError, setAttachDayError] = useState<string | null>(null);
  const [attachSlotId, setAttachSlotId] = useState<string | null>(null);
  const [attachMealType, setAttachMealType] = useState<PlannedMealType>('dinner');
  const [attachTargetServings, setAttachTargetServings] = useState<string>('');
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attachDone, setAttachDone] = useState<{
    planId: string;
    date: string;
  } | null>(null);

  const fetchedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const fetched = await planService.getImport(id);
      setImported(fetched);
      setTitle(fetched.title);
      const draft = fetched.parsed_payload_json;
      setServings(
        draft?.servings != null ? String(draft.servings) : '',
      );
      setDescription(draft?.description ?? '');
      setIngredients(draft?.ingredients ?? []);
      setSteps(draft?.steps ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load import.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id || fetchedRef.current) return;
    fetchedRef.current = true;
    void refresh();
  }, [id, refresh]);

  const nutrition = imported?.nutrition_estimate_json ?? null;
  const draft = imported?.parsed_payload_json ?? null;
  const matchEntries = imported?.ingredient_match_json ?? null;

  /**
   * Join server-derived per-item metadata (match + attachable item) by
   * ingredient index. This is what powers the "per-item estimate" and
   * "matched vs guessed" badges in the structured review UI. The join
   * is by index because that is how both arrays are ordered on the
   * server (`buildAttachablePayload` + `buildIngredientMatchTable`
   * iterate the same `ingredients` array).
   *
   * Note: this reflects the LAST SAVED state. Local edits to an
   * ingredient's amount/name/unit only show up in these readouts after
   * a save (which triggers the server-side recompute).
   */
  const derivationByIndex = useMemo(() => {
    const items = (imported?.payload as { items?: Array<{
      calories?: number;
      macros?: { protein_g?: number };
    }> } | null)?.items ?? null;
    const match = matchEntries ?? [];
    const map = new Map<
      number,
      {
        match: IngredientMatchEntry | null;
        calories: number | null;
        protein_g: number | null;
      }
    >();
    const len = Math.max(items?.length ?? 0, match.length);
    for (let i = 0; i < len; i++) {
      map.set(i, {
        match: match[i] ?? null,
        calories: items?.[i]?.calories ?? null,
        protein_g: items?.[i]?.macros?.protein_g ?? null,
      });
    }
    return map;
  }, [imported?.payload, matchEntries]);

  // --------------------------------------------------------------------------
  // Ingredient edits — per-field, inline. When the user rewrites an
  // ingredient's text, we re-split it (quantity + unit + name + prep
  // note) using the shared hardened parser
  // (`lib/plans/ingredientPhraseParser`) so the nutrition estimate
  // and ingredient-match table regenerate consistently on Save.
  // Packet 24 collapsed the prior server/client duplicate into a
  // single isomorphic module so edits here run the exact same rules
  // the server runs on initial import.
  // --------------------------------------------------------------------------

  function reparseIngredientText(raw: string): ImportedMealDraftIngredient {
    const parsed = parseIngredientPhrase(raw);
    return {
      raw_text: parsed.raw_text,
      normalized_name: parsed.normalized_name,
      quantity_value: parsed.quantity_value,
      quantity_unit: parsed.quantity_unit,
      preparation_note: parsed.preparation_note,
      parse_confidence: parsed.parse_confidence,
      quantity_source: parsed.quantity_source,
    };
  }

  function handleAddIngredient() {
    const raw = newIngredient.trim();
    if (raw.length === 0) return;
    setIngredients((prev) => [...prev, reparseIngredientText(raw)]);
    setNewIngredient('');
  }

  function handleRemoveIngredient(idx: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleEditIngredientText(idx: number, text: string) {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === idx ? reparseIngredientText(text) : ing)),
    );
  }

  /**
   * Rebuild `raw_text` from structured fields so server recompute and
   * future client re-parses stay consistent. `raw_text` is authoritative
   * for the free-text UI; structured fields are authoritative for
   * nutrition derivation. We keep them in sync on every field edit.
   * Packet 24 — uses the shared helper so the whole-item pseudo-unit
   * stays hidden from the user's typed text.
   */
  function updateIngredientField(
    idx: number,
    patch: Partial<ImportedMealDraftIngredient>,
  ) {
    setIngredients((prev) =>
      prev.map((ing, i) => {
        if (i !== idx) return ing;
        const merged: ImportedMealDraftIngredient = { ...ing, ...patch };
        merged.raw_text = rebuildRawTextFromStructured(merged);
        return merged;
      }),
    );
  }

  function handleMoveIngredient(idx: number, dir: -1 | 1) {
    setIngredients((prev) => {
      const next = prev.slice();
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function handleAddStep() {
    const raw = newStep.trim();
    if (raw.length === 0) return;
    setSteps((prev) => [...prev, { step_number: prev.length + 1, instruction: raw }]);
    setNewStep('');
  }

  function handleEditStep(idx: number, instruction: string) {
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, instruction } : s)),
    );
  }

  function handleRemoveStep(idx: number) {
    setSteps((prev) =>
      prev
        .filter((_, i) => i !== idx)
        .map((s, i) => ({ ...s, step_number: i + 1 })),
    );
  }

  function handleMoveStep(idx: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = prev.slice();
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((s, i) => ({ ...s, step_number: i + 1 }));
    });
  }

  async function handleSave() {
    if (!imported || busy) return;
    setBusy(true);
    setError(null);
    try {
      const servingsNum =
        servings.trim().length > 0 ? Number(servings) : null;
      const nextDraft: ImportedMealDraftPayload = {
        title: title.trim().length > 0 ? title.trim() : null,
        description:
          description.trim().length > 0 ? description.trim() : null,
        servings:
          servingsNum != null && Number.isFinite(servingsNum) && servingsNum > 0
            ? servingsNum
            : null,
        ingredients,
        steps: steps.map((s, i) => ({ ...s, step_number: i + 1 })),
        meal_type_hint: draft?.meal_type_hint ?? 'unknown',
        // Packet 32 — Preserve the original acquisition provenance
        // through full-draft save. Editing the recipe body never
        // changes how the draft was acquired, so these fields must
        // survive (otherwise pills/banners disappear after a save
        // and the draft's story stops matching reality).
        acquisition_mode: draft?.acquisition_mode ?? null,
        onscreen_assist: draft?.onscreen_assist ?? null,
        transcript_source: draft?.transcript_source ?? null,
        translated_from_language: draft?.translated_from_language ?? null,
      };
      const updated = await planService.updateImport(imported.id, {
        title: title.trim().length > 0 ? title.trim() : undefined,
        parsed_payload_json: nextDraft,
      });
      setImported(updated);
      setPromoteMsg('Changes saved.');
      setTimeout(() => setPromoteMsg(null), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Packet 28 — Row-level suggested-source actions.
   *
   * Sends an apply / reject / undo POST to the row-level source
   * endpoint and folds the refreshed `ImportedMeal` back into local
   * state. The editable ingredient-row fields are not touched so
   * the user's in-flight edits to amount/unit/name/prep note
   * survive the action.
   */
  async function handleIngredientSourceAction(
    idx: number,
    action: 'apply' | 'reject' | 'undo',
  ) {
    if (!imported || sourceBusyIdx !== null) return;
    setSourceBusyIdx(idx);
    setSourceError(null);
    try {
      const { imported_meal } = await planService.updateIngredientSource(
        imported.id,
        idx,
        { action },
      );
      setImported(imported_meal);
      if (action !== 'apply') setReviewingIdx(null);
    } catch (err) {
      setSourceError({
        idx,
        message: err instanceof Error ? err.message : 'Source action failed.',
      });
    } finally {
      setSourceBusyIdx(null);
    }
  }

  /**
   * Packet 29 — Row-level trusted-source search.
   *
   * Opens (or toggles) the inline search panel for the given row and
   * seeds the query with the current ingredient name. The user can
   * refine the query, pick a candidate, and apply it via
   * `updateIngredientSource({ action: 'apply', food_object_id })`.
   */
  async function handleOpenSourceSearch(idx: number) {
    if (!imported) return;
    if (searchOpenIdx === idx) {
      handleCloseSourceSearch();
      return;
    }
    setSearchOpenIdx(idx);
    setSearchError(null);
    setSourceError(null);
    const row = ingredients[idx];
    const seed = (row?.normalized_name ?? row?.raw_text ?? '').trim();
    setSearchQuery(seed);
    if (seed.length >= 2) {
      await runSourceSearch(seed, idx);
    } else {
      setSearchResults([]);
    }
  }

  function handleCloseSourceSearch() {
    setSearchOpenIdx(null);
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(null);
  }

  /**
   * Packet 30 — Run the row-level source search. Forwards the row
   * `idx` (when available) so the server can apply row-context
   * ranking (e.g. a sauce row prefers sauce candidates over
   * unrelated same-brand items).
   */
  async function runSourceSearch(q: string, rowIdx?: number | null) {
    if (!imported) return;
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }
    const contextIdx =
      typeof rowIdx === 'number' && rowIdx >= 0
        ? rowIdx
        : searchOpenIdx ?? undefined;
    setSearchBusy(true);
    setSearchError(null);
    try {
      const results = await planService.searchIngredientSources(
        imported.id,
        trimmed,
        contextIdx ?? undefined,
      );
      setSearchResults(results);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed.');
      setSearchResults([]);
    } finally {
      setSearchBusy(false);
    }
  }

  async function handleApplyFromSearch(idx: number, foodObjectId: string) {
    if (!imported || sourceBusyIdx !== null) return;
    setSourceBusyIdx(idx);
    setSourceError(null);
    try {
      const { imported_meal } = await planService.updateIngredientSource(
        imported.id,
        idx,
        { action: 'apply', food_object_id: foodObjectId },
      );
      setImported(imported_meal);
      handleCloseSourceSearch();
    } catch (err) {
      setSourceError({
        idx,
        message: err instanceof Error ? err.message : 'Failed to apply source.',
      });
    } finally {
      setSourceBusyIdx(null);
    }
  }

  /**
   * Packet 29 — In-place row save.
   *
   * Commits the local edits for a single ingredient row without
   * touching other rows. After success, we sync this row's local
   * state to the server's authoritative copy so the dirty indicator
   * clears. Other rows' in-flight local edits are preserved.
   */
  async function handleSaveRow(idx: number) {
    if (!imported || savingRowIdx !== null) return;
    const row = ingredients[idx];
    if (!row) return;
    setSavingRowIdx(idx);
    setRowSaveError(null);
    try {
      const { imported_meal } = await planService.saveIngredient(imported.id, idx, {
        raw_text: row.raw_text,
        normalized_name: row.normalized_name ?? null,
        quantity_value: row.quantity_value ?? null,
        quantity_unit: row.quantity_unit ?? null,
        preparation_note: row.preparation_note ?? null,
        parse_confidence: row.parse_confidence ?? null,
        quantity_source: row.quantity_source ?? null,
      });
      setImported(imported_meal);
      const savedRow = imported_meal.parsed_payload_json?.ingredients?.[idx] ?? row;
      setIngredients((prev) => prev.map((r, i) => (i === idx ? savedRow : r)));
    } catch (err) {
      setRowSaveError({
        idx,
        message: err instanceof Error ? err.message : 'Failed to save row.',
      });
    } finally {
      setSavingRowIdx(null);
    }
  }

  function handleCancelRow(idx: number) {
    const saved = imported?.parsed_payload_json?.ingredients?.[idx];
    if (!saved) return;
    setIngredients((prev) => prev.map((r, i) => (i === idx ? saved : r)));
    if (rowSaveError && rowSaveError.idx === idx) setRowSaveError(null);
  }

  /**
   * Packet 29 — Whether the local copy of row `idx` diverges from the
   * server-authoritative copy on `imported.parsed_payload_json`. Drives
   * the in-place "Save row" / "Cancel" affordance.
   */
  function isRowDirty(idx: number): boolean {
    const local = ingredients[idx];
    const saved = imported?.parsed_payload_json?.ingredients?.[idx];
    if (!local) return false;
    if (!saved) return true;
    return (
      (local.raw_text ?? '') !== (saved.raw_text ?? '') ||
      (local.normalized_name ?? null) !== (saved.normalized_name ?? null) ||
      (local.quantity_value ?? null) !== (saved.quantity_value ?? null) ||
      ((local.quantity_unit ?? null) || null) !== ((saved.quantity_unit ?? null) || null) ||
      (local.preparation_note ?? null) !== (saved.preparation_note ?? null)
    );
  }

  /**
   * Packet 26 §3a — Servings guardrail. When the draft has no
   * servings value, per-serving calories/macros/NDS are provisional:
   * the estimate pipeline divides total contributions by the stored
   * servings value, so a missing servings count yields a number that
   * can be materially off (either collapsed to totals / 1 or skipped
   * entirely depending on downstream code path). We surface this at
   * the top of the draft, annotate the estimate card as provisional,
   * and require an explicit confirmation before promoting the draft
   * into a saved meal.
   */
  const servingsMissing = servings.trim().length === 0;

  /**
   * Recipe vs Meal classification for copy + library destination. Mirrors the
   * canonical adapter rule (lib/meals/adapters.importedMealToMealDocumentDraft:
   * a draft with prep steps becomes kind='recipe', otherwise kind='meal'), so
   * the CTA label and confirmation match the kind the MealDocument is saved as.
   */
  const isRecipeLike = (imported?.parsed_payload_json?.steps?.length ?? 0) > 0;
  const saveTypeNoun = isRecipeLike ? 'Recipe' : 'Meal';

  async function handlePromote() {
    if (!imported || busy) return;
    if (servingsMissing) {
      const ok = window.confirm(
        'No servings count is set on this draft. Per-serving calories, macros, ' +
          `and NDS may be materially off. Save this ${saveTypeNoun.toLowerCase()} anyway?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    setPromoteMsg(null);
    try {
      // Persist the canonical MealDocument so the item appears in the Meals &
      // Recipes library (/app/meals) with the correct Recipe/Meal type. The
      // adapter decides kind from the draft's structure. Yield is NOT confirmed
      // here (recipes stay draft/needs_review until explicitly confirmed).
      const libraryRes = await fetch(
        `/api/journal/meals/documents/from-import/${imported.id}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      );
      if (!libraryRes.ok) {
        throw new Error(`Could not save to your library (${libraryRes.status}).`);
      }

      // Keep the legacy slot-picker path working: promoting to a meal template
      // is what makes the item selectable when adding to a plan slot. This is
      // best-effort — the library save above is the primary destination, so a
      // slot-picker hiccup must not present as an overall failure.
      let slotPickerReady = true;
      try {
        await planService.promoteImport(imported.id, { name: title.trim() || undefined });
      } catch {
        slotPickerReady = false;
      }

      setPromoteMsg(
        `Saved to your Meals & Recipes library as a ${saveTypeNoun}. Find it under Meals.` +
          (slotPickerReady
            ? " It's also available in the saved-meal picker when you add to a plan slot."
            : ''),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Failed to save this ${saveTypeNoun.toLowerCase()}.`,
      );
    } finally {
      setBusy(false);
    }
  }

  // Packet 35 — Load plans when the "Add to Plan" panel opens.
  // Deferred so we don't pay the network cost on every page load.
  useEffect(() => {
    if (!attachOpen || attachPlans !== null) return;
    planService.list().then((plans) => {
      const active = plans.filter((p) => p.status !== 'archived');
      setAttachPlans(active);
      if (active.length > 0) setAttachPlanId(active[0].id);
    }).catch(() => {
      setAttachPlans([]);
    });
  }, [attachOpen, attachPlans]);

  // Packet 35 — Reload day slots whenever plan or date changes in the panel.
  useEffect(() => {
    if (!attachOpen || !attachPlanId || !attachDate) return;
    let cancelled = false;
    setAttachDayLoading(true);
    setAttachDayError(null);
    setAttachSlotId(null);
    setAttachDayData(null);
    planService.getDayDetail(attachPlanId, attachDate)
      .then((data) => {
        if (cancelled) return;
        setAttachDayData({ day: data.day, slots: data.slots, meals: data.meals });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Could not load slots.';
        // 404 means this plan has no day for that date.
        setAttachDayError(
          msg.includes('404') || msg.includes('not found')
            ? 'No plan day found for this date. Check your plan dates.'
            : msg,
        );
      })
      .finally(() => { if (!cancelled) setAttachDayLoading(false); });
    return () => { cancelled = true; };
  }, [attachOpen, attachPlanId, attachDate]);

  async function handleOpenAttach() {
    setAttachOpen(true);
    setAttachDone(null);
    setAttachError(null);
    // Seed target servings from the current draft servings value so the
    // user sees the recipe's own yield as the default.
    const draftServings = imported?.parsed_payload_json?.servings;
    if (draftServings && draftServings > 0) {
      setAttachTargetServings(String(draftServings));
    } else {
      setAttachTargetServings('');
    }
    // Infer meal type from the draft hint.
    const hint = imported?.parsed_payload_json?.meal_type_hint;
    if (hint === 'breakfast') setAttachMealType('breakfast');
    else if (hint === 'lunch') setAttachMealType('lunch');
    else if (hint === 'dinner') setAttachMealType('dinner');
    else if (hint === 'snack') setAttachMealType('snack');
    else setAttachMealType('dinner');
  }

  async function handleAttachToPlan() {
    if (!imported || !attachPlanId || !attachSlotId || !attachDayData) return;
    setAttachBusy(true);
    setAttachError(null);
    try {
      const basePayload = {
        ...(imported.payload as Record<string, unknown>),
        source_imported_meal_id: imported.id,
      } as unknown as PlannedMeal['payload'];

      const draftServings = imported.parsed_payload_json?.servings ?? null;
      const targetNum = attachTargetServings ? parseFloat(attachTargetServings) : null;

      const payload =
        draftServings && draftServings > 0 && targetNum && targetNum > 0 && targetNum !== draftServings
          ? scalePayloadToServings(basePayload, draftServings, targetNum)
          : basePayload;

      await planService.createMeal({
        plan_id: attachPlanId,
        plan_day_id: attachDayData.day.id,
        plan_slot_id: attachSlotId,
        name: title.trim() || imported.title,
        meal_type: attachMealType,
        payload,
        source_imported_meal_id: imported.id,
      });

      setAttachDone({ planId: attachPlanId, date: attachDate });
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : 'Attach failed.');
    } finally {
      setAttachBusy(false);
    }
  }

  function slotLabel(slot: PlanSlot): string {
    if (slot.slot_label) return slot.slot_label;
    if (slot.slot_block === 'morning') return 'Morning slot';
    if (slot.slot_block === 'midday') return 'Midday slot';
    if (slot.slot_block === 'evening') return 'Evening slot';
    return `Slot ${slot.slot_ordinal + 1}`;
  }

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="w-full max-w-[650px] mx-auto px-5 pt-14 pb-2">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold antialiased">
              {isRecipeLike ? 'Imported recipe draft' : 'Imported meal draft'}
            </h1>
            <Link
              href={APP_ROUTES.plans}
              className="text-xs text-white/60 hover:text-white/80 antialiased"
            >
              ← Plans
            </Link>
          </div>
          <p className="text-sm text-white/50 antialiased mt-0.5">
            {isRecipeLike
              ? 'Review the parsed draft, then save it to your Meals & Recipes library as a Recipe. Edit anything first if it needs a fix.'
              : 'Review the parsed draft, then save it to your Meals & Recipes library as a Meal. Edit anything first if it needs a fix.'}
          </p>
        </div>

        <div className="w-full max-w-[650px] mx-auto px-5 mt-6 space-y-4">
          {loading ? (
            <div className="rounded-2xl bg-white/[0.04] p-5 animate-pulse">
              <div className="h-4 w-40 bg-white/[0.06] rounded mb-3" />
              <div className="h-3 w-60 bg-white/[0.06] rounded" />
            </div>
          ) : !imported ? (
            <div className="rounded-2xl bg-white/[0.04] p-5">
              <p className="text-sm text-white/70 antialiased">
                Draft not found.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border antialiased ${statusStyle(
                    imported.parse_status,
                  )}`}
                >
                  {statusLabel(imported.parse_status)}
                </span>
                {imported.source_platform && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-white/[0.06] text-white/70 antialiased">
                    {imported.source_platform}
                  </span>
                )}
                {imported.source_url && (
                  <a
                    href={imported.source_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[11px] text-denim-300 hover:text-denim-200 antialiased truncate"
                  >
                    Open source ↗
                  </a>
                )}
                {imported.parsed_payload_json?.acquisition_mode ===
                  'user_assisted' && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-denim-500/15 text-denim-200 border border-denim-500/25 antialiased"
                    title="We couldn't auto-read this video. The recipe text was pasted by you alongside the URL."
                  >
                    Assisted caption
                  </span>
                )}
                {imported.parsed_payload_json?.acquisition_mode === 'automatic' && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/10 text-emerald-200 border border-emerald-500/20 antialiased"
                    title="Source text was acquired automatically from the video's captions or description."
                  >
                    Auto transcript
                  </span>
                )}
                {imported.parsed_payload_json?.onscreen_assist?.used && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-amber-500/10 text-amber-200 border border-amber-500/20 antialiased"
                    title={
                      imported.parsed_payload_json.onscreen_assist.source ===
                      'user_supplied'
                        ? 'On-screen text the user saw in the video was merged into the source text as a secondary assist.'
                        : 'On-screen text from a registered extractor was merged into the source text as a secondary assist.'
                    }
                  >
                    On-screen assist
                  </span>
                )}
                {imported.parsed_payload_json?.translated_from_language && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-violet-500/15 text-violet-200 border border-violet-500/30 antialiased"
                    title={`The caption track was in ${imported.parsed_payload_json.translated_from_language}. It was translated to English before the recipe was parsed.`}
                  >
                    Translated from{' '}
                    {imported.parsed_payload_json.translated_from_language}
                  </span>
                )}
                {imported.parsed_payload_json?.transcript_source ===
                  'youtube_title_only' && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-rose-500/15 text-rose-200 border border-rose-500/30 antialiased"
                    title="YouTube refused to serve captions and the description was empty. Only the video title was captured; paste the recipe body to continue."
                  >
                    Title only
                  </span>
                )}
                {imported.parsed_payload_json?.transcript_source ===
                  'external_provider' && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-sky-500/15 text-sky-200 border border-sky-500/30 antialiased"
                    title="The video's transcript was recovered through a governed external transcript provider after YouTube blocked our first-party captions/description path."
                  >
                    External transcript
                  </span>
                )}
              </div>

              {/*
                Packet 27 — Title-only acquisition banner. When the
                only thing we could pull from YouTube was the video
                title (no captions, no description), tell the user
                plainly what happened and point them at the paste
                path, because nothing about the imported draft is
                going to be useful until they do that.
              */}
              {imported.parsed_payload_json?.transcript_source ===
                'youtube_title_only' && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 space-y-1">
                  <p className="text-xs font-semibold text-rose-100 antialiased">
                    Only the video title was captured
                  </p>
                  <p className="text-[11px] text-rose-200/90 antialiased leading-snug">
                    YouTube blocked our automated caption fetch for this
                    Short, and its description was empty, so we could only
                    read the title. Paste the recipe body (ingredients +
                    steps) below — then save — to get a real draft. You
                    can also retry the import with the &quot;Recipe text&quot;
                    field on the Import page filled in.
                  </p>
                </div>
              )}

              {imported.parse_status === 'manual_review' &&
                imported.parsed_payload_json?.transcript_source !==
                  'youtube_title_only' && (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
                    <p className="text-xs text-amber-200 antialiased">
                      We captured your input but couldn&apos;t parse enough
                      structure automatically. Fill in the title,
                      ingredients, and steps below — then save.
                    </p>
                  </div>
                )}

              {/*
                Packet 26 §3a — Servings guardrail. Loud warning at the
                top of the draft whenever servings could not be
                extracted. Per-serving numbers downstream depend on
                this value; if it's missing, they are provisional at
                best.
              */}
              {servingsMissing && (
                <div className="rounded-xl bg-amber-500/15 border border-amber-500/35 p-3 space-y-1">
                  <p className="text-xs font-semibold text-amber-100 antialiased">
                    Servings not detected
                  </p>
                  <p className="text-[11px] text-amber-200/90 antialiased leading-snug">
                    We couldn&apos;t determine servings from the source.
                    Per-serving calories, macros, and NDS may be
                    materially off until you enter a serving count below.
                  </p>
                </div>
              )}

              <div className="rounded-2xl bg-white/[0.04] p-5 space-y-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
                    Servings{' '}
                    {servingsMissing && (
                      <span className="text-amber-300 normal-case tracking-normal">
                        · missing
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={servings}
                    onChange={(e) => setServings(e.target.value)}
                    className={`w-full rounded-xl border text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400 ${
                      servingsMissing
                        ? 'bg-amber-500/10 border-amber-500/40'
                        : 'bg-white/[0.06] border-white/10'
                    }`}
                  />
                  {servingsMissing && (
                    <p className="text-[11px] text-amber-200/80 antialiased mt-1 leading-snug">
                      Enter a serving count so the per-serving numbers
                      below reflect the actual recipe yield.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Short note about this recipe (optional)"
                    rows={2}
                    className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400 placeholder:text-white/30 resize-none"
                  />
                </div>
              </div>

              <div className="rounded-2xl bg-white/[0.04] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white antialiased">Ingredients</p>
                  <span className="text-[11px] text-white/40 antialiased">
                    {ingredients.length} item{ingredients.length === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="text-[11px] text-white/40 antialiased leading-snug">
                  Edit amount, unit, name, and prep note separately. The
                  per-item estimate shown is the last server derivation and
                  refreshes after you save.
                </p>
                {ingredients.length === 0 ? (
                  <p className="text-xs text-white/50 antialiased">
                    No ingredients captured yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {ingredients.map((ing, idx) => {
                      const deriv = derivationByIndex.get(idx);
                      // Packet 6: prefer `match_status` + `confidence` over
                      // the deprecated `match_confidence` enum. We keep a
                      // fallback so rows persisted under Packet 4 still
                      // render sensibly.
                      const status = deriv?.match?.match_status ?? null;
                      const conf =
                        deriv?.match?.confidence ??
                        deriv?.match?.match_confidence ??
                        null;
                      const matchBadge =
                        status === 'matched'
                          ? { label: 'matched', cls: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30' }
                          : status === 'partial'
                            ? { label: 'partial', cls: 'bg-amber-500/15 text-amber-200 border-amber-500/30' }
                            : status === 'guessed'
                              ? { label: 'guessed', cls: 'bg-white/[0.06] text-white/60 border-white/10' }
                              : status === 'none'
                                ? { label: 'no match', cls: 'bg-white/[0.06] text-white/50 border-white/10' }
                                // legacy rows: fall back on the old enum
                                : conf === 'high'
                                  ? { label: 'matched', cls: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30' }
                                  : conf === 'medium'
                                    ? { label: 'partial', cls: 'bg-amber-500/15 text-amber-200 border-amber-500/30' }
                                    : conf === 'low'
                                      ? { label: 'guessed', cls: 'bg-white/[0.06] text-white/60 border-white/10' }
                                      : { label: 'no match', cls: 'bg-white/[0.06] text-white/50 border-white/10' };
                      const confBadge =
                        conf === 'high'
                          ? { label: 'high confidence', cls: 'bg-emerald-500/10 text-emerald-200/80 border-emerald-500/20' }
                          : conf === 'medium'
                            ? { label: 'medium confidence', cls: 'bg-amber-500/10 text-amber-200/80 border-amber-500/20' }
                            : conf === 'low'
                              ? { label: 'low confidence', cls: 'bg-white/[0.04] text-white/50 border-white/10' }
                              : null;
                      const sourceLabel = deriv?.match?.source_label ?? null;
                      const sourceKind = deriv?.match?.source_kind ?? null;
                      const explanation = deriv?.match?.explanation ?? deriv?.match?.notes ?? null;
                      const sourceKindLabel =
                        sourceKind === 'food_object'
                          ? 'Trusted food object'
                          : sourceKind === 'heuristic_guess'
                            ? 'Heuristic rule'
                            : sourceKind === 'default_guess'
                              ? 'Default estimate'
                              : null;
                      // Packet 28 — per-row suggested-source eligibility.
                      // Drives the Apply / Review / Undo / Restore
                      // controls below and determines whether we label the
                      // row as "Suggested source" (pre-commit) or
                      // "Trusted source applied" (post-commit).
                      const verdict = classifyMatchEntry(deriv?.match ?? null);
                      const rowState: SuggestedSourceEligibility = verdict.state;
                      const isReviewing = reviewingIdx === idx;
                      const isRowBusy = sourceBusyIdx === idx;
                      const rowError =
                        sourceError && sourceError.idx === idx
                          ? sourceError.message
                          : null;
                      const sourceHeaderLabel =
                        rowState === 'applied'
                          ? 'Trusted source applied'
                          : rowState === 'rejected'
                            ? 'Suggestion dismissed'
                            : rowState === 'ineligible'
                              ? 'Suggested source (not auto-applyable)'
                              : rowState === 'review'
                                ? 'Suggested source'
                                : rowState === 'strong'
                                  ? 'Suggested source'
                                  : sourceKindLabel ?? 'Source';
                      return (
                        <li
                          key={idx}
                          className="rounded-xl bg-white/[0.03] px-3 py-2.5 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider antialiased border ${matchBadge.cls}`}
                              >
                                {matchBadge.label}
                              </span>
                              {confBadge && (
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] antialiased border ${confBadge.cls}`}
                                >
                                  {confBadge.label}
                                </span>
                              )}
                            </div>
                            <div className="shrink-0 flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleMoveIngredient(idx, -1)}
                                disabled={idx === 0}
                                aria-label="Move ingredient up"
                                className="text-[11px] text-white/50 hover:text-white/80 disabled:text-white/20 antialiased px-1"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveIngredient(idx, 1)}
                                disabled={idx === ingredients.length - 1}
                                aria-label="Move ingredient down"
                                className="text-[11px] text-white/50 hover:text-white/80 disabled:text-white/20 antialiased px-1"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveIngredient(idx)}
                                className="text-[11px] text-white/50 hover:text-red-300 antialiased px-1"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-12 gap-2">
                            <div className="col-span-3">
                              <label className="block text-[10px] uppercase tracking-wider text-white/40 antialiased mb-0.5">
                                Amount
                              </label>
                              <input
                                type="number"
                                step="any"
                                value={ing.quantity_value ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  const parsed = v === '' ? null : Number(v);
                                  updateIngredientField(idx, {
                                    quantity_value:
                                      parsed !== null && Number.isFinite(parsed)
                                        ? parsed
                                        : null,
                                  });
                                }}
                                placeholder="—"
                                className="w-full rounded-lg bg-white/[0.04] border border-white/10 text-sm text-white antialiased px-2 py-1.5 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
                              />
                            </div>
                            <div className="col-span-3">
                              <label className="block text-[10px] uppercase tracking-wider text-white/40 antialiased mb-0.5">
                                Unit
                              </label>
                              <input
                                type="text"
                                value={ing.quantity_unit ?? ''}
                                onChange={(e) =>
                                  updateIngredientField(idx, {
                                    quantity_unit:
                                      e.target.value.trim().length > 0
                                        ? e.target.value
                                        : null,
                                  })
                                }
                                placeholder="cup"
                                className="w-full rounded-lg bg-white/[0.04] border border-white/10 text-sm text-white antialiased px-2 py-1.5 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
                              />
                            </div>
                            <div className="col-span-6">
                              <label className="block text-[10px] uppercase tracking-wider text-white/40 antialiased mb-0.5">
                                Ingredient
                              </label>
                              <input
                                type="text"
                                value={ing.normalized_name ?? ''}
                                onChange={(e) =>
                                  updateIngredientField(idx, {
                                    normalized_name:
                                      e.target.value.trim().length > 0
                                        ? e.target.value
                                        : null,
                                  })
                                }
                                placeholder="e.g., greek yogurt"
                                className="w-full rounded-lg bg-white/[0.04] border border-white/10 text-sm text-white antialiased px-2 py-1.5 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
                              />
                            </div>
                            <div className="col-span-12">
                              <label className="block text-[10px] uppercase tracking-wider text-white/40 antialiased mb-0.5">
                                Prep note <span className="text-white/30 normal-case">(optional)</span>
                              </label>
                              <input
                                type="text"
                                value={ing.preparation_note ?? ''}
                                onChange={(e) =>
                                  updateIngredientField(idx, {
                                    preparation_note:
                                      e.target.value.trim().length > 0
                                        ? e.target.value
                                        : null,
                                  })
                                }
                                placeholder="chopped, drained, room temperature…"
                                className="w-full rounded-lg bg-white/[0.04] border border-white/10 text-sm text-white antialiased px-2 py-1.5 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
                              />
                            </div>
                          </div>
                          {/* Packet 29 — row-level save + source search controls. */}
                          {(() => {
                            const dirty = isRowDirty(idx);
                            const isSavingRow = savingRowIdx === idx;
                            const searchOpenHere = searchOpenIdx === idx;
                            const rowSaveMsg =
                              rowSaveError && rowSaveError.idx === idx
                                ? rowSaveError.message
                                : null;
                            return (
                              <div className="space-y-2 pt-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  {dirty && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleSaveRow(idx)}
                                        disabled={isSavingRow || savingRowIdx !== null}
                                        className="inline-flex items-center rounded-lg bg-denim-500/25 hover:bg-denim-500/35 text-denim-100 border border-denim-500/40 px-2.5 py-1 text-[11px] font-medium antialiased disabled:opacity-50"
                                        aria-label="Save changes to just this ingredient row"
                                      >
                                        {isSavingRow ? 'Saving row…' : 'Save row'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleCancelRow(idx)}
                                        disabled={isSavingRow}
                                        className="inline-flex items-center rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/70 border border-white/10 px-2.5 py-1 text-[11px] antialiased disabled:opacity-50"
                                        aria-label="Discard this row's unsaved changes"
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenSourceSearch(idx)}
                                    className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] antialiased border ${
                                      searchOpenHere
                                        ? 'bg-denim-500/20 text-denim-100 border-denim-500/40'
                                        : 'bg-white/[0.04] hover:bg-white/[0.08] text-white/70 border-white/10'
                                    }`}
                                    aria-label={
                                      rowState === 'applied'
                                        ? 'Replace the applied trusted source for this row'
                                        : 'Search for a trusted source for this row'
                                    }
                                  >
                                    {searchOpenHere
                                      ? 'Close search'
                                      : rowState === 'applied'
                                        ? 'Replace source'
                                        : 'Find source'}
                                  </button>
                                  {!dirty && !searchOpenHere && (
                                    <span className="text-[10.5px] text-white/30 antialiased">
                                      Edits save per row — page Save still works
                                    </span>
                                  )}
                                </div>
                                {rowSaveMsg && (
                                  <p className="text-[11px] text-rose-300 antialiased">
                                    {rowSaveMsg}
                                  </p>
                                )}
                                {searchOpenHere && (
                                  <div className="rounded-lg border border-denim-500/30 bg-denim-500/5 p-2.5 space-y-2">
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            void runSourceSearch(searchQuery);
                                          }
                                          if (e.key === 'Escape') {
                                            e.preventDefault();
                                            handleCloseSourceSearch();
                                          }
                                        }}
                                        placeholder="Search trusted sources (brand, product)…"
                                        autoFocus
                                        className="flex-1 rounded-md bg-white/[0.04] border border-white/10 text-sm text-white antialiased px-2 py-1.5 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => void runSourceSearch(searchQuery)}
                                        disabled={searchBusy || searchQuery.trim().length < 2}
                                        className="inline-flex items-center rounded-md bg-denim-500/25 hover:bg-denim-500/35 text-denim-100 border border-denim-500/40 px-2.5 py-1.5 text-[11px] antialiased disabled:opacity-50"
                                      >
                                        {searchBusy ? 'Searching…' : 'Search'}
                                      </button>
                                    </div>
                                    {searchError && (
                                      <p className="text-[11px] text-rose-300 antialiased">
                                        {searchError}
                                      </p>
                                    )}
                                    {!searchError && searchResults.length === 0 && !searchBusy && (
                                      <p className="text-[11px] text-white/40 antialiased">
                                        {searchQuery.trim().length < 2
                                          ? 'Type at least 2 characters to search.'
                                          : 'No trusted sources matched that query. Try a brand or product name.'}
                                      </p>
                                    )}
                                    {searchResults.length > 0 && (
                                      <ul className="space-y-1.5">
                                        {searchResults.map((cand) => {
                                          const isCurrent =
                                            rowState === 'applied' &&
                                            deriv?.match?.source_kind === 'food_object' &&
                                            deriv?.match?.source_id === cand.id;
                                          return (
                                            <li
                                              key={cand.id}
                                              className="rounded-md bg-white/[0.03] border border-white/[0.06] px-2 py-1.5 flex items-start justify-between gap-2"
                                            >
                                              <div className="min-w-0 flex-1">
                                                <p className="text-[12px] text-white antialiased truncate">
                                                  {cand.canonical_name}
                                                  {cand.brand_name && (
                                                    <span className="text-white/50">
                                                      {' '}· {cand.brand_name}
                                                    </span>
                                                  )}
                                                  {cand.is_verified && (
                                                    <span
                                                      className="ml-1.5 inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-500/25 px-1.5 py-0 text-[9px] align-middle"
                                                      title="Verified trusted source"
                                                    >
                                                      verified
                                                    </span>
                                                  )}
                                                </p>
                                                <p className="text-[10.5px] text-white/50 antialiased">
                                                  {cand.calories != null
                                                    ? `${cand.calories} cal`
                                                    : '— cal'}
                                                  {cand.protein_g != null &&
                                                    ` · ${cand.protein_g}g protein`}
                                                  {cand.serving_size_g != null &&
                                                    ` · per ${cand.serving_size_g}g serving`}
                                                  {cand.source_provider && (
                                                    <span className="text-white/30">
                                                      {' '}· {cand.source_provider}
                                                    </span>
                                                  )}
                                                </p>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleApplyFromSearch(idx, cand.id)
                                                }
                                                disabled={
                                                  isCurrent ||
                                                  sourceBusyIdx === idx ||
                                                  sourceBusyIdx !== null
                                                }
                                                className="shrink-0 inline-flex items-center rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-100 border border-emerald-500/30 px-2 py-1 text-[11px] antialiased disabled:opacity-50"
                                                aria-label={
                                                  isCurrent
                                                    ? 'This source is already applied to this row'
                                                    : `Apply ${cand.canonical_name} as this row's trusted source`
                                                }
                                              >
                                                {isCurrent
                                                  ? 'Applied'
                                                  : sourceBusyIdx === idx
                                                    ? 'Applying…'
                                                    : 'Apply'}
                                              </button>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    )}
                                    <p className="text-[10px] text-white/30 antialiased pt-0.5">
                                      Searches the trusted food-object layer only — Packet 28 guardrails apply to auto-suggestions, not manual selections.
                                    </p>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                          {(deriv?.calories != null ||
                            deriv?.protein_g != null ||
                            sourceLabel ||
                            explanation) && (
                            <div className="space-y-1.5 text-[11px] text-white/50 antialiased pt-1 border-t border-white/[0.04]">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span>
                                  per serving:{' '}
                                  <span className="text-white/70">
                                    {deriv?.calories ?? 0} cal
                                  </span>
                                  {deriv?.protein_g != null && (
                                    <>
                                      {' · '}
                                      <span className="text-white/70">
                                        {deriv.protein_g}g protein
                                      </span>
                                    </>
                                  )}
                                </span>
                                {ing.raw_text && (
                                  <span className="text-white/30 truncate">
                                    (from: {ing.raw_text})
                                  </span>
                                )}
                              </div>
                              {sourceLabel && (
                                <div className="flex items-baseline gap-1.5">
                                  <span
                                    className={`uppercase tracking-wider text-[9.5px] ${
                                      rowState === 'applied'
                                        ? 'text-emerald-300/80'
                                        : rowState === 'rejected'
                                          ? 'text-white/40'
                                          : rowState === 'ineligible'
                                            ? 'text-rose-300/70'
                                            : 'text-white/40'
                                    }`}
                                  >
                                    {sourceHeaderLabel}:
                                  </span>
                                  <span
                                    className={`truncate ${
                                      rowState === 'rejected'
                                        ? 'text-white/40 line-through'
                                        : 'text-white/70'
                                    }`}
                                  >
                                    {sourceLabel}
                                  </span>
                                </div>
                              )}
                              {explanation && (
                                <p className="text-white/40 leading-snug">
                                  {explanation}
                                </p>
                              )}
                              {/* Packet 28 — row-level source adoption controls. */}
                              {(rowState === 'strong' ||
                                rowState === 'review' ||
                                rowState === 'applied' ||
                                rowState === 'rejected' ||
                                rowState === 'ineligible') && (
                                <div className="pt-1.5 space-y-1.5">
                                  {rowState === 'strong' && (
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleIngredientSourceAction(idx, 'apply')
                                        }
                                        disabled={isRowBusy || sourceBusyIdx !== null}
                                        className="inline-flex items-center rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-100 border border-emerald-500/30 px-2.5 py-1 text-[11px] antialiased disabled:opacity-50"
                                        aria-label="Apply this trusted source to this ingredient row"
                                      >
                                        {isRowBusy ? 'Applying…' : 'Use as this row\u2019s source'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleIngredientSourceAction(idx, 'reject')
                                        }
                                        disabled={isRowBusy || sourceBusyIdx !== null}
                                        className="inline-flex items-center rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/60 border border-white/10 px-2.5 py-1 text-[11px] antialiased disabled:opacity-50"
                                        aria-label="Dismiss this suggested source for this ingredient row"
                                      >
                                        Not this source
                                      </button>
                                    </div>
                                  )}
                                  {rowState === 'review' && !isReviewing && (
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setReviewingIdx(idx)}
                                        className="inline-flex items-center rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-100 border border-amber-500/30 px-2.5 py-1 text-[11px] antialiased"
                                        aria-label="Review this partial suggestion before applying"
                                      >
                                        Review source
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleIngredientSourceAction(idx, 'reject')
                                        }
                                        disabled={isRowBusy || sourceBusyIdx !== null}
                                        className="inline-flex items-center rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/60 border border-white/10 px-2.5 py-1 text-[11px] antialiased disabled:opacity-50"
                                        aria-label="Dismiss this suggested source for this ingredient row"
                                      >
                                        Not this source
                                      </button>
                                    </div>
                                  )}
                                  {rowState === 'review' && isReviewing && (
                                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 space-y-1.5">
                                      <p className="text-[11px] text-amber-100 antialiased">
                                        This is a partial suggestion. Confirm it matches
                                        the ingredient before applying.
                                      </p>
                                      <div className="text-[11px] text-amber-100/80 antialiased space-y-0.5">
                                        <p>
                                          <span className="text-amber-200/60 uppercase tracking-wider text-[9.5px]">
                                            Source:
                                          </span>{' '}
                                          {sourceLabel}
                                        </p>
                                        <p>
                                          <span className="text-amber-200/60 uppercase tracking-wider text-[9.5px]">
                                            Why matched:
                                          </span>{' '}
                                          {explanation ?? '—'}
                                        </p>
                                        {deriv?.match?.per_serving_estimate && (
                                          <p>
                                            <span className="text-amber-200/60 uppercase tracking-wider text-[9.5px]">
                                              Estimate if applied:
                                            </span>{' '}
                                            {deriv.match.per_serving_estimate.calories ?? 0} cal
                                            {deriv.match.per_serving_estimate.protein_g != null
                                              ? ` · ${deriv.match.per_serving_estimate.protein_g}g protein`
                                              : ''}
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleIngredientSourceAction(idx, 'apply')
                                          }
                                          disabled={isRowBusy || sourceBusyIdx !== null}
                                          className="inline-flex items-center rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 border border-emerald-500/40 px-2.5 py-1 text-[11px] antialiased disabled:opacity-50"
                                        >
                                          {isRowBusy ? 'Applying…' : 'Apply to this row'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleIngredientSourceAction(idx, 'reject')
                                          }
                                          disabled={isRowBusy || sourceBusyIdx !== null}
                                          className="inline-flex items-center rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/60 border border-white/10 px-2.5 py-1 text-[11px] antialiased disabled:opacity-50"
                                        >
                                          Not this source
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setReviewingIdx(null)}
                                          className="text-[11px] text-white/40 hover:text-white/70 antialiased ml-auto"
                                        >
                                          Close
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                  {rowState === 'applied' && (
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span
                                        className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-500/30 px-2 py-0.5 text-[10.5px] antialiased"
                                        title="You explicitly applied this source to this ingredient row."
                                      >
                                        Trusted source applied
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleIngredientSourceAction(idx, 'undo')
                                        }
                                        disabled={isRowBusy || sourceBusyIdx !== null}
                                        className="inline-flex items-center rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/70 border border-white/10 px-2.5 py-1 text-[11px] antialiased disabled:opacity-50"
                                        aria-label="Undo the applied source and return this row to suggestion mode"
                                      >
                                        {isRowBusy ? 'Undoing…' : 'Undo'}
                                      </button>
                                    </div>
                                  )}
                                  {rowState === 'rejected' && (
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span
                                        className="inline-flex items-center rounded-full bg-white/[0.06] text-white/50 border border-white/10 px-2 py-0.5 text-[10.5px] antialiased"
                                        title="You dismissed this suggestion. The row uses a heuristic estimate until restored."
                                      >
                                        Suggestion dismissed
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleIngredientSourceAction(idx, 'undo')
                                        }
                                        disabled={isRowBusy || sourceBusyIdx !== null}
                                        className="inline-flex items-center rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/70 border border-white/10 px-2.5 py-1 text-[11px] antialiased disabled:opacity-50"
                                        aria-label="Restore the dismissed suggestion"
                                      >
                                        {isRowBusy ? 'Restoring…' : 'Restore suggestion'}
                                      </button>
                                    </div>
                                  )}
                                  {rowState === 'ineligible' && (
                                    <p
                                      className="text-[11px] text-rose-200/80 antialiased"
                                      title={verdict.reason}
                                    >
                                      Source not auto-applyable — rename or retype the
                                      ingredient to find a closer match.
                                    </p>
                                  )}
                                  {rowError && (
                                    <p className="text-[11px] text-rose-300 antialiased">
                                      {rowError}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newIngredient}
                    onChange={(e) => setNewIngredient(e.target.value)}
                    placeholder="e.g., 1 cup Greek yogurt"
                    className="flex-1 rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddIngredient();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddIngredient}
                    className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] transition-colors text-xs text-white/80 antialiased"
                  >
                    Add
                  </button>
                </div>
                <p className="text-[11px] text-white/30 antialiased">
                  Edit an ingredient&apos;s text to re-parse its quantity,
                  unit, and name. Used by the nutrition estimate below.
                </p>
              </div>

              <div className="rounded-2xl bg-white/[0.04] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white antialiased">Steps</p>
                  <span className="text-[11px] text-white/40 antialiased">
                    {steps.length} step{steps.length === 1 ? '' : 's'}
                  </span>
                </div>
                {steps.length === 0 ? (
                  <p className="text-xs text-white/50 antialiased">
                    No steps captured yet.
                  </p>
                ) : (
                  <ol className="space-y-1.5">
                    {steps.map((s, idx) => (
                      <li
                        key={idx}
                        className="rounded-xl bg-white/[0.03] px-3 py-2 flex items-start gap-2"
                      >
                        <span className="shrink-0 text-[11px] text-white/40 antialiased pt-2 w-5 text-right">
                          {idx + 1}.
                        </span>
                        <textarea
                          value={s.instruction}
                          onChange={(e) => handleEditStep(idx, e.target.value)}
                          rows={2}
                          className="flex-1 min-w-0 rounded-lg bg-white/[0.04] border border-white/10 text-sm text-white antialiased px-2 py-1.5 focus:outline-none focus:border-denim-400 resize-none"
                        />
                        <div className="shrink-0 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveStep(idx, -1)}
                            disabled={idx === 0}
                            aria-label="Move step up"
                            className="text-[11px] text-white/50 hover:text-white/80 disabled:text-white/20 antialiased px-1"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveStep(idx, 1)}
                            disabled={idx === steps.length - 1}
                            aria-label="Move step down"
                            className="text-[11px] text-white/50 hover:text-white/80 disabled:text-white/20 antialiased px-1"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveStep(idx)}
                            className="text-[11px] text-white/50 hover:text-red-300 antialiased px-1"
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newStep}
                    onChange={(e) => setNewStep(e.target.value)}
                    placeholder="Add a step…"
                    className="flex-1 rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddStep();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] transition-colors text-xs text-white/80 antialiased"
                  >
                    Add
                  </button>
                </div>
                <p className="text-[11px] text-white/30 antialiased">
                  Steps are kept on the draft only. They do not flow
                  into the attached meal payload or NDS scoring.
                </p>
              </div>

              {nutrition && (
                <div className="rounded-2xl bg-white/[0.04] p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white antialiased">
                      Nutrition estimate (per serving)
                    </p>
                    <span className="text-[11px] text-white/50 antialiased">
                      {confidenceLabel(nutrition.confidence)}
                    </span>
                  </div>
                  {/*
                    Packet 26 §3a — if the source did not yield a
                    serving count, the per-serving numbers below are
                    provisional. Keep them visible so the user can see
                    the shape, but mark them clearly so they aren't
                    mistaken for a settled estimate.
                  */}
                  {servingsMissing && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2">
                      <p className="text-[11px] text-amber-200 antialiased leading-snug">
                        <span className="font-semibold">Provisional</span> —
                        servings is blank, so these numbers may be materially
                        off. Enter servings and save to re-derive.
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'cal', value: nutrition.per_serving.calories },
                      { label: 'protein g', value: nutrition.per_serving.protein_g },
                      { label: 'carbs g', value: nutrition.per_serving.carbs_g },
                      { label: 'fat g', value: nutrition.per_serving.fat_g },
                    ].map((x) => (
                      <div
                        key={x.label}
                        className="rounded-xl bg-white/[0.03] px-3 py-2"
                      >
                        <p className="text-[11px] uppercase tracking-wider text-white/40 antialiased">
                          {x.label}
                        </p>
                        <p className="text-sm text-white antialiased">{x.value}</p>
                      </div>
                    ))}
                  </div>
                  {nutrition.notes && (
                    <p className="text-[11px] text-white/40 antialiased">
                      {nutrition.notes}
                    </p>
                  )}
                  <details className="pt-2">
                    <summary className="text-[11px] text-white/60 hover:text-white/80 antialiased cursor-pointer">
                      How we estimated this
                    </summary>
                    <div className="mt-2 space-y-2 text-[11px] text-white/60 antialiased leading-relaxed">
                      <p>
                        Each ingredient is tokenized into amount, unit, and
                        name, then matched against a small built-in food
                        heuristic table. A matched ingredient uses that row
                        (scaled by quantity and unit); an unmatched ingredient
                        falls back to a conservative default. The final
                        per-serving numbers divide the summed contributions by
                        the recipe's serving count.
                      </p>
                      <p>
                        Why this may differ from the source site's published
                        nutrition:
                      </p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        <li>
                          Brand-specific ingredients, sauces, and packaged
                          foods are not in the local table and fall back to a
                          conservative estimate.
                        </li>
                        <li>
                          Unit qualifiers like <em>handful</em>, <em>medium</em>,{' '}
                          <em>large</em>, or quoted weights on the source site
                          may not round-trip exactly through the local unit
                          converter.
                        </li>
                        <li>
                          If the source's serving count differs from what the
                          parser extracted, the per-serving calories will
                          differ proportionally — adjust the Servings field
                          and save to re-derive.
                        </li>
                        <li>
                          Imported estimates are never promoted to curated
                          food-object truth, so they don't claim to match the
                          source site's published nutrition.
                        </li>
                      </ul>
                      <p className="text-white/50">
                        Ingredient-level estimates are shown on each line
                        above. Edit amount / unit / name and save to refresh
                        the totals.
                      </p>
                    </div>
                  </details>
                </div>
              )}

              <div className="rounded-2xl bg-white/[0.04] p-5 space-y-1">
                <p className="text-sm font-semibold text-white antialiased">
                  Meal-level NDS
                </p>
                <p className="text-[11px] text-white/50 antialiased">
                  NDS confidence: {imported.nds_confidence}. This is the
                  projection confidence for the meal when attached to a
                  slot — distinct from the ingredient-match and
                  nutrition-estimate confidence above.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wider text-white/40 antialiased">
                      Protein score (0–10)
                    </p>
                    <p className="text-sm text-white antialiased">
                      {imported.protein_score_10 ?? '—'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wider text-white/40 antialiased">
                      Main meal
                    </p>
                    <p className="text-sm text-white antialiased">
                      {imported.is_main_meal ? 'Yes' : 'No'}
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
                  <p className="text-xs text-red-200 antialiased">{error}</p>
                </div>
              )}
              {promoteMsg && (
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
                  <p className="text-xs text-emerald-200 antialiased">{promoteMsg}</p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={busy}
                  className="flex-1 py-3 rounded-full bg-white/[0.06] hover:bg-white/[0.10] disabled:bg-white/[0.04] disabled:text-white/40 transition-colors text-sm font-semibold text-white antialiased"
                >
                  {busy ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  type="button"
                  onClick={handlePromote}
                  disabled={busy}
                  className="flex-1 py-3 rounded-full bg-denim-500/20 hover:bg-denim-500/30 disabled:bg-white/[0.04] disabled:text-white/40 transition-colors text-sm font-semibold text-denim-200 antialiased"
                >
                  {busy ? 'Working…' : `Save as ${saveTypeNoun}`}
                </button>
              </div>
              <p className="text-[11px] text-white/40 antialiased">
                {isRecipeLike
                  ? 'Recipes keep their ingredients, steps, and yield in your Meals & Recipes library. ' +
                    'A recipe can make several servings — a meal or log entry uses a portion of it.'
                  : 'Meals are saved to your Meals & Recipes library and stay available in the slot picker when you add to a plan.'}
              </p>

              {/* Packet 35 — Attach to Plan CTA + inline panel */}
              {!attachOpen ? (
                <button
                  type="button"
                  onClick={() => void handleOpenAttach()}
                  disabled={busy}
                  className="w-full py-3 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 transition-colors text-sm font-semibold text-emerald-200 antialiased border border-emerald-500/20"
                >
                  Add to Plan
                </button>
              ) : (
                <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-4 space-y-4">
                  <div className="flex items-baseline justify-between">
                    <p className="text-[11px] uppercase tracking-wider text-white/40 antialiased">
                      Add to plan slot
                    </p>
                    <button
                      type="button"
                      onClick={() => { setAttachOpen(false); setAttachDone(null); setAttachError(null); }}
                      className="text-[11px] text-white/40 hover:text-white/70 antialiased transition-colors"
                    >
                      Cancel
                    </button>
                  </div>

                  {/* Success state */}
                  {attachDone ? (
                    <div className="space-y-2">
                      <p className="text-sm text-emerald-200 antialiased">
                        Added to your plan.
                      </p>
                      <Link
                        href={`${APP_ROUTE_BUILDERS.planDay(attachDone.date)}?planId=${attachDone.planId}`}
                        className="inline-block text-[11px] text-denim-300 hover:text-denim-200 antialiased"
                      >
                        View plan day →
                      </Link>
                    </div>
                  ) : (
                    <>
                      {/* Plan selector — only shown when user has multiple plans */}
                      {attachPlans === null ? (
                        <p className="text-xs text-white/50 antialiased">Loading plans…</p>
                      ) : attachPlans.length === 0 ? (
                        <div className="rounded-xl bg-white/[0.03] p-3 space-y-2">
                          <p className="text-xs text-white/60 antialiased">
                            No active plans found. Generate a plan first.
                          </p>
                          <Link
                            href={APP_ROUTES.plans}
                            className="inline-block text-[11px] text-denim-300 hover:text-denim-200 antialiased"
                          >
                            Go to Plans →
                          </Link>
                        </div>
                      ) : (
                        <>
                          {attachPlans.length > 1 && (
                            <div>
                              <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
                                Plan
                              </label>
                              <select
                                value={attachPlanId ?? ''}
                                onChange={(e) => setAttachPlanId(e.target.value)}
                                className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400"
                              >
                                {attachPlans.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.title ?? `Plan (${p.start_date})`}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          <div>
                            <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
                              Day
                            </label>
                            <input
                              type="date"
                              value={attachDate}
                              onChange={(e) => setAttachDate(e.target.value)}
                              className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
                              Meal type
                            </label>
                            <select
                              value={attachMealType}
                              onChange={(e) => setAttachMealType(e.target.value as PlannedMealType)}
                              className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400"
                            >
                              <option value="breakfast">Breakfast</option>
                              <option value="lunch">Lunch</option>
                              <option value="dinner">Dinner</option>
                              <option value="snack">Snack</option>
                              <option value="other">Other</option>
                            </select>
                          </div>

                          {/* Slot picker */}
                          {attachDayLoading ? (
                            <p className="text-xs text-white/50 antialiased">Loading slots…</p>
                          ) : attachDayError ? (
                            <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-3">
                              <p className="text-xs text-amber-200 antialiased">{attachDayError}</p>
                            </div>
                          ) : attachDayData ? (
                            <div>
                              <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1.5">
                                Slot
                              </label>
                              <div className="space-y-1.5">
                                {attachDayData.slots.length === 0 ? (
                                  <p className="text-xs text-white/50 antialiased">
                                    No slots on this day.
                                  </p>
                                ) : (
                                  attachDayData.slots.map((slot) => {
                                    const occupyingMeal = attachDayData.meals.find(
                                      (m) => m.plan_slot_id === slot.id,
                                    );
                                    return (
                                      <button
                                        key={slot.id}
                                        type="button"
                                        onClick={() => setAttachSlotId(slot.id)}
                                        className={`w-full text-left rounded-xl p-3 transition-colors ${
                                          attachSlotId === slot.id
                                            ? 'bg-denim-500/20 border border-denim-500/30'
                                            : 'bg-white/[0.03] hover:bg-white/[0.06] border border-transparent'
                                        }`}
                                      >
                                        <p className="text-sm font-medium text-white antialiased">
                                          {slotLabel(slot)}
                                          {slot.target_time && (
                                            <span className="ml-2 text-[11px] text-white/40 font-normal">
                                              {slot.target_time}
                                            </span>
                                          )}
                                        </p>
                                        {occupyingMeal && (
                                          <p className="text-[11px] text-amber-200/70 antialiased mt-0.5">
                                            Has a meal: {occupyingMeal.name ?? 'Unnamed'} — will add alongside it
                                          </p>
                                        )}
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          ) : null}

                          {/* Servings scaling — shown when draft has a known yield */}
                          {(() => {
                            const draftServings = imported?.parsed_payload_json?.servings;
                            if (!draftServings || draftServings <= 0) return null;
                            return (
                              <div className="space-y-1.5">
                                <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased">
                                  Servings for this slot
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min="0.5"
                                    step="0.5"
                                    value={attachTargetServings}
                                    onChange={(e) => setAttachTargetServings(e.target.value)}
                                    placeholder={String(draftServings)}
                                    className="w-24 rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-1.5 focus:outline-none focus:border-denim-400"
                                  />
                                  <p className="text-[11px] text-white/40 antialiased">
                                    Recipe makes {draftServings}
                                    {draftServings === 1 ? ' serving' : ' servings'}.
                                    Nutrition scales proportionally.
                                  </p>
                                </div>
                              </div>
                            );
                          })()}

                          {attachError && (
                            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
                              <p className="text-xs text-red-200 antialiased">{attachError}</p>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => void handleAttachToPlan()}
                            disabled={attachBusy || !attachSlotId}
                            className="w-full py-3 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-40 transition-colors text-sm font-semibold text-emerald-200 antialiased"
                          >
                            {attachBusy ? 'Adding…' : 'Add to slot'}
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <JournalFooterNav />
    </div>
  );
}
