'use client';

import { useEffect, useMemo, useState } from 'react';

import { MealComposer } from '@/components/meals/composer/MealComposer';
import {
  buildMealScheduleContext,
  getEnabledMealSlots,
  getMealSlotForEntry,
  isMealSlotKey,
} from '@/lib/journal/mealScheduleAssignment';
import {
  buildCommittedSingleItemPayload,
  convertCommittedSingleItemQuantity,
  getCommittedSingleItemValidUnits,
} from '@/lib/journal/committedNutritionEdit';
import {
  formatTime,
  journalService,
  parseLocalDate,
  setTimeOnDate,
  toDateKey,
  type JournalEntry,
} from '@/lib/journal';
import {
  singleItemDraftEntryFromFoodResult,
  singleItemDraftEntryFromRecent,
  type LogNutritionSingleItemDraftEntryV1,
} from '@/lib/logDraft/logNutritionDraft';
import { logSearchService } from '@/lib/logSearch/logSearchService';
import type { LogSearchResult } from '@/lib/logSearch/types';
import { buildStructuralEditPatch } from '@/lib/meals/composer/submission';
import { useMealComposer } from '@/components/meals/composer/useMealComposer';
import { hasMealGroupPayload } from '@/lib/meals/loggedMealGroup';
import { mealDocumentFromLoggedGroup } from '@/lib/meals/loggedMealGroupDocument';
import { scaleTopLevelMealNutrition } from '@/lib/meals/recompute';
import type {
  GroupedMealEntryPayload,
  LoggedMealGroup,
} from '@/lib/meals/types';
import type { MealSchedule } from '@/lib/plans/types';
import {
  computeQuantities,
  normalizeUnit,
} from '@/lib/units/convert';

type Presentation = 'modal' | 'page';

function entryDisplayQuantity(entry: JournalEntry): string {
  const payload = entry.payload as {
    quantity?: number;
    unit?: string;
    measures?: Array<{ unit: string; grams: number }>;
  };
  const unit = payload.unit ?? 'serving';
  if (unit === 'g' && entry.quantityG != null) return String(entry.quantityG);
  if (unit !== 'serving' && entry.quantityG != null) {
    const measure = payload.measures?.find(
      (candidate) => candidate.unit.toLowerCase() === unit.toLowerCase(),
    );
    if (measure?.grams) return String(entry.quantityG / measure.grams);
  }
  return String(payload.quantity ?? 1);
}

function SingleItemEditor({
  entry,
  mealSchedule,
  dateKey,
  time,
  mealSlotKey,
  contextDirty,
  onDirtyChange,
  onSaved,
}: {
  entry: JournalEntry;
  mealSchedule: MealSchedule;
  dateKey: string;
  time: string;
  mealSlotKey: string | null;
  contextDirty: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (entry: JournalEntry) => void;
}) {
  const payload = entry.payload as {
    name?: string;
    unit?: string;
    servingSizeG?: number;
    measures?: Array<{ unit: string; grams: number; label?: string }>;
  };
  const [quantity, setQuantity] = useState(entryDisplayQuantity(entry));
  const [unit, setUnit] = useState(payload.unit ?? 'serving');
  const [replacement, setReplacement] =
    useState<LogNutritionSingleItemDraftEntryV1 | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LogSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const servingSizeG = replacement?.servingSizeG ?? payload.servingSizeG ?? null;
  const measures = replacement?.measures ?? payload.measures ?? null;
  const units = useMemo(
    () =>
      Array.from(
        new Set([
          unit,
          replacement?.unit ?? payload.unit ?? 'serving',
          ...getCommittedSingleItemValidUnits(servingSizeG, measures),
        ]),
      ),
    [unit, replacement?.unit, payload.unit, servingSizeG, measures],
  );
  const canonicalUnits = useMemo(
    () => getCommittedSingleItemValidUnits(servingSizeG, measures),
    [servingSizeG, measures],
  );
  const nutritionPreview = useMemo(() => {
    const amount = Number(quantity);
    const normalizedUnit = normalizeUnit(unit);
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !canonicalUnits.includes(normalizedUnit)
    ) {
      return 'Nutrition unavailable';
    }
    const servingQuantity = computeQuantities(
      normalizedUnit,
      amount,
      servingSizeG,
      measures,
    ).servingQty;
    const calories = replacement?.calories ?? (
      entry.payload as { calories?: number }
    ).calories;
    const macros = replacement?.macros ?? (
      entry.payload as {
        macros?: { protein?: number | null; carbs?: number | null; fat?: number | null };
      }
    ).macros;
    const values = [
      calories == null ? null : `${Math.round(calories * servingQuantity)} kcal`,
      macros?.protein == null
        ? null
        : `P ${Math.round(macros.protein * servingQuantity)} g`,
      macros?.carbs == null
        ? null
        : `C ${Math.round(macros.carbs * servingQuantity)} g`,
      macros?.fat == null
        ? null
        : `F ${Math.round(macros.fat * servingQuantity)} g`,
    ].filter(Boolean);
    return values.length ? values.join('   ') : 'Nutrition unavailable';
  }, [
    canonicalUnits,
    entry.payload,
    measures,
    quantity,
    replacement,
    servingSizeG,
    unit,
  ]);
  const dirty =
    contextDirty ||
    replacement !== null ||
    quantity !== entryDisplayQuantity(entry) ||
    unit !== (payload.unit ?? 'serving');

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    if (!replacing || query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await logSearchService.search(query.trim(), {
          banks: ['foods', 'recent'],
          sectionLimit: 6,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setResults(
            response.results.filter(
              (result) => result.kind === 'food' || result.kind === 'recent_entry',
            ),
          );
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [query, replacing]);

  const selectReplacement = (result: LogSearchResult) => {
    const next =
      result.kind === 'food'
        ? singleItemDraftEntryFromFoodResult(result.food)
        : result.kind === 'recent_entry'
          ? singleItemDraftEntryFromRecent(result.recent)
          : null;
    if (!next) return;
    setReplacement(next);
    setQuantity(String(next.quantity));
    setUnit(next.unit);
    setReplacing(false);
    setQuery('');
    setResults([]);
  };

  const changeUnit = (nextUnit: string) => {
    const converted = convertCommittedSingleItemQuantity({
      quantity: Number(quantity),
      fromUnit: unit,
      toUnit: nextUnit,
      servingSizeG,
      measures,
    });
    if (!converted) {
      setError('That unit cannot be converted for this item.');
      return;
    }
    setQuantity(String(converted.quantity));
    setUnit(converted.unit);
    setError(null);
  };

  const save = async () => {
    const amount = Number(quantity);
    const normalizedUnit = normalizeUnit(unit);
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !canonicalUnits.includes(normalizedUnit)
    ) {
      setError('Enter a quantity greater than 0 and a valid unit.');
      return;
    }
    const slots = getEnabledMealSlots(mealSchedule);
    const slot = slots.find((candidate) => candidate.key === mealSlotKey) ?? null;
    const context = slot
      ? buildMealScheduleContext(slot, 'manual', mealSchedule)
      : null;
    const nextPayload = buildCommittedSingleItemPayload({
      current: entry.payload,
      replacement,
      quantity: amount,
      unit: normalizedUnit,
      mealScheduleContext: context,
    });
    setSaving(true);
    setError(null);
    try {
      const updated = await journalService.updateEntry(entry.id, {
        payload: nextPayload,
        replacePayload: true,
        timestamp: setTimeOnDate(parseLocalDate(dateKey), time),
        ...(normalizedUnit === 'g' ? { quantityG: amount } : {}),
      });
      if (!updated) throw new Error('Unable to save this entry.');
      onSaved(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this entry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">
          Single Item
        </p>
        <h2 className="mt-1 text-lg font-medium text-white">
          {replacement?.title ?? payload.name ?? 'Item'}
        </h2>
        <p className="mt-1 text-xs text-white/42">{nutritionPreview}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-[11px] text-white/45">Quantity</span>
          <input
            type="number"
            min="0"
            step="any"
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value);
              setError(null);
            }}
            className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2.5 text-sm outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-white/45">Unit</span>
          <select
            value={unit}
            onChange={(event) => changeUnit(event.target.value)}
            className="w-full rounded-xl border border-white/15 bg-[#181711] px-3 py-2.5 text-sm outline-none"
          >
            {units.map((option) => (
              <option
                key={option}
                value={option}
                disabled={
                  option !== unit &&
                  convertCommittedSingleItemQuantity({
                    quantity: Number(quantity),
                    fromUnit: unit,
                    toUnit: option,
                    servingSizeG,
                    measures,
                  }) === null
                }
              >
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        onClick={() => setReplacing((value) => !value)}
        className="rounded-full border border-white/20 px-4 py-2 text-xs text-white/70"
      >
        Replace item
      </button>

      {replacing && (
        <div className="rounded-xl border border-white/10 bg-black/15 p-3">
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search foods"
            className="w-full rounded-full border border-white/20 bg-transparent px-4 py-2 text-sm outline-none"
          />
          {searching && <p className="px-2 py-3 text-xs text-white/35">Searching…</p>}
          <div className="mt-2 max-h-52 overflow-y-auto">
            {results.map((result) => (
              <button
                key={`${result.kind}:${result.id}`}
                type="button"
                onClick={() => selectReplacement(result)}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/[0.06]"
              >
                {result.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void save()}
          className="rounded-full bg-white px-5 py-2 text-sm font-medium text-black disabled:opacity-35"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

function GroupedMealEditor({
  entry,
  mealSchedule,
  dateKey,
  time,
  mealSlotKey,
  contextDirty,
  onDirtyChange,
  onSaved,
}: {
  entry: JournalEntry;
  mealSchedule: MealSchedule;
  dateKey: string;
  time: string;
  mealSlotKey: string | null;
  contextDirty: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (entry: JournalEntry) => void;
}) {
  const groupedPayload = entry.payload as GroupedMealEntryPayload & {
    meal_group: LoggedMealGroup;
  };
  const original = useMemo(
    () => mealDocumentFromLoggedGroup(groupedPayload),
    [groupedPayload],
  );
  const [state, dispatch] = useMealComposer('log-edit', original, {
    consumedServingsInput: String(groupedPayload.meal_group.consumed_servings),
    instanceNote: groupedPayload.meal_group.instance_notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const structuralPatch = useMemo(
    () => buildStructuralEditPatch(original, state.document),
    [original, state.document],
  );
  const consumed = Number(state.consumedServingsInput);
  const dirty =
    contextDirty ||
    Object.keys(structuralPatch).length > 0 ||
    consumed !== groupedPayload.meal_group.consumed_servings ||
    state.instanceNote.trim() !== (groupedPayload.meal_group.instance_notes ?? '');
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const preview =
    Number.isFinite(consumed) && consumed > 0
      ? scaleTopLevelMealNutrition(state.document, consumed)
      : null;
  const previewText = preview
    ? [
        preview.calories == null ? null : `${Math.round(preview.calories)} kcal`,
        preview.macros.protein_g == null
          ? null
          : `P ${Math.round(preview.macros.protein_g)} g`,
        preview.macros.carbs_g == null
          ? null
          : `C ${Math.round(preview.macros.carbs_g)} g`,
        preview.macros.fat_g == null
          ? null
          : `F ${Math.round(preview.macros.fat_g)} g`,
      ].filter(Boolean).join('   ')
    : undefined;

  const save = async () => {
    if (!Number.isFinite(consumed) || consumed <= 0) {
      setError('Servings must be greater than 0.');
      return;
    }
    const slots = getEnabledMealSlots(mealSchedule);
    const slot = slots.find((candidate) => candidate.key === mealSlotKey) ?? null;
    setSaving(true);
    setError(null);
    try {
      const updated = await journalService.updateGroupedMealInstance(entry.id, {
        ...(Object.keys(structuralPatch).length
          ? { document_patch: structuralPatch }
          : {}),
        consumed_servings: consumed,
        instance_note: state.instanceNote.trim() || null,
        occurred_at: setTimeOnDate(parseLocalDate(dateKey), time).toISOString(),
        meal_schedule_context: slot
          ? buildMealScheduleContext(slot, 'manual', mealSchedule)
          : null,
      });
      if (!updated) throw new Error('Unable to save this Meal.');
      onSaved(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this Meal.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MealComposer
      state={state}
      dispatch={dispatch}
      headerTitle="Grouped Meal"
      helperText="Changes apply only to this logged instance, never the source Meal or Plan."
      nutritionPreview={previewText}
      error={error}
      submitting={saving}
      actions={{
        save_logged_changes: {
          disabled: !dirty || !Number.isFinite(consumed) || consumed <= 0,
          onRun: save,
        },
      }}
    />
  );
}

export function CommittedNutritionEditor({
  entry,
  mealSchedule,
  presentation,
  onClose,
  onSaved,
  onDeleted,
}: {
  entry: JournalEntry;
  mealSchedule: MealSchedule;
  presentation: Presentation;
  onClose: () => void;
  onSaved: (entry: JournalEntry) => void;
  onDeleted: (entryId: string) => void;
}) {
  const slots = useMemo(() => getEnabledMealSlots(mealSchedule), [mealSchedule]);
  const initialSlot = getMealSlotForEntry(entry, slots);
  const [dateKey, setDateKey] = useState(toDateKey(entry.timestamp));
  const [time, setTime] = useState(formatTime(entry.timestamp));
  const [mealSlotKey, setMealSlotKey] = useState<string | null>(
    initialSlot?.key ?? null,
  );
  const [contentDirty, setContentDirty] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const contextDirty =
    dateKey !== toDateKey(entry.timestamp) ||
    time !== formatTime(entry.timestamp) ||
    mealSlotKey !== (initialSlot?.key ?? null);
  const dirty = contextDirty || contentDirty;

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const requestClose = () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    onClose();
  };

  const remove = async () => {
    if (!window.confirm('Delete this logged entry? This cannot be undone.')) return;
    setDeleting(true);
    const deleted = await journalService.deleteEntry(entry.id);
    setDeleting(false);
    if (deleted) onDeleted(entry.id);
  };

  const content = (
    <div className="flex max-h-[94vh] w-full max-w-[650px] flex-col overflow-hidden bg-[#181711] text-white">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-white/[0.06] px-6 py-5 text-xs text-white/75">
        <button
          type="button"
          onClick={requestClose}
          className="justify-self-start p-1 text-2xl font-light"
          aria-label="Back"
        >
          ←
        </button>
        <span>Logged</span>
        <span className="justify-self-end">Meals</span>
      </header>

      <div className="grid grid-cols-3 gap-3 border-b border-white/[0.06] px-6 py-4">
        <label className="text-[10px] text-white/40">
          Date
          <input
            type="date"
            value={dateKey}
            onChange={(event) => setDateKey(event.target.value)}
            className="mt-1 block w-full bg-transparent text-xs text-white outline-none"
          />
        </label>
        <label className="text-[10px] text-white/40">
          Time
          <input
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="mt-1 block w-full bg-transparent text-xs text-white outline-none"
          />
        </label>
        <label className="text-[10px] text-white/40">
          Meal Rhythm
          <select
            value={mealSlotKey ?? ''}
            onChange={(event) => {
              if (!event.target.value) {
                setMealSlotKey(null);
                return;
              }
              if (!isMealSlotKey(event.target.value)) return;
              const slot = slots.find(
                (candidate) => candidate.key === event.target.value,
              );
              setMealSlotKey(event.target.value);
              if (slot) setTime(slot.target_time);
            }}
            className="mt-1 block w-full bg-[#181711] text-xs text-white outline-none"
          >
            <option value="">Unassigned</option>
            {slots.map((slot) => (
              <option key={slot.key} value={slot.key}>{slot.label}</option>
            ))}
          </select>
        </label>
      </div>

      <main className="flex-1 overflow-y-auto px-6 py-6">
        {hasMealGroupPayload(entry.payload) ? (
          <GroupedMealEditor
            entry={entry}
            mealSchedule={mealSchedule}
            dateKey={dateKey}
            time={time}
            mealSlotKey={mealSlotKey}
            contextDirty={contextDirty}
            onDirtyChange={setContentDirty}
            onSaved={onSaved}
          />
        ) : (
          <SingleItemEditor
            entry={entry}
            mealSchedule={mealSchedule}
            dateKey={dateKey}
            time={time}
            mealSlotKey={mealSlotKey}
            contextDirty={contextDirty}
            onDirtyChange={setContentDirty}
            onSaved={onSaved}
          />
        )}

        <div className="mt-8 border-t border-white/[0.08] pt-5">
          <button
            type="button"
            disabled={deleting}
            onClick={() => void remove()}
            className="text-xs font-medium text-red-300 disabled:opacity-40"
          >
            {deleting ? 'Deleting…' : 'Delete entry'}
          </button>
        </div>
      </main>
    </div>
  );

  if (presentation === 'page') {
    return <div className="min-h-screen bg-[#181711]">{content}</div>;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div className="w-full max-w-[650px] sm:overflow-hidden sm:rounded-2xl sm:border sm:border-white/15">
        {content}
      </div>
    </div>
  );
}
