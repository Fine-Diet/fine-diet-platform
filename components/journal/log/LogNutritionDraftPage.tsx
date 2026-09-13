'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { SIGNED_IN_DESKTOP_DRAWER_LEFT_CLASS } from '@/components/layout/SignedInPageShell';
import { CommittedNutritionEditor } from '@/components/journal/log/CommittedNutritionEditor';
import { PlannedMealContextCard } from '@/components/journal/log/PlannedMealContextCard';
import { isSupportedMealResult } from '@/components/journal/log/AddToLogPanel';
import {
  foodService,
  type CreateCustomFoodInput,
  type FoodObject,
} from '@/lib/food';
import {
  buildMealScheduleContext,
  getEnabledMealSlots,
  isMealSlotKey,
  resolveMealSlotQueryParam,
} from '@/lib/journal/mealScheduleAssignment';
import {
  journalService,
  parseLocalDate,
  setTimeOnDate,
  toDateKey,
  type JournalEntry,
  type MealScheduleContext,
  type TimeBlock,
} from '@/lib/journal';
import { selectCommittedNutritionEntries } from '@/lib/journal/committedNutritionContext';
import {
  addLogNutritionDraftEntry,
  buildJournalPayloadForDraftEntry,
  buildMealDocumentFromLogDraft,
  createLogNutritionDraft,
  getDraftEntryNutrition,
  getLogNutritionDraftStorageKey,
  isCommitReadyLogNutritionDraft,
  isSameLogDraftContext,
  mealDraftEntryFromSearchResult,
  parseLogNutritionDraft,
  removeLogNutritionDraftEntry,
  serializeLogNutritionDraft,
  singleItemDraftEntryFromFood,
  singleItemDraftEntryFromFoodResult,
  singleItemDraftEntryFromRecent,
  updateLogNutritionDraftEntry,
  type LogNutritionDraftContextV1,
  type LogNutritionDraftEntryV1,
  type LogNutritionDraftV1,
} from '@/lib/logDraft/logNutritionDraft';
import {
  exactPendingPlannedMealDraftEntry,
  retireConsumedPlannedMealDraftContext,
} from '@/lib/logDraft/plannedMealDraftStaging';
import { logSearchService } from '@/lib/logSearch/logSearchService';
import type { LogSearchResult } from '@/lib/logSearch/types';
import {
  buildOrdinaryLogHref,
  isPlannedMealAdjustLogContext,
  parsePlannedMealLogQuery,
} from '@/lib/plans/plannedMealLogRoute';
import type { PlannedMeal } from '@/lib/plans';
import { defaultMealSchedule, normalizeMealSchedule } from '@/lib/plans/scheduleResolver';
import type { MealSchedule, MealSlotKey } from '@/lib/plans/types';
import { buildGroupedMealView, hasMealGroupPayload } from '@/lib/meals/loggedMealGroup';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

const BarcodeScanner = dynamic(() => import('@/components/journal/BarcodeScanner'), {
  ssr: false,
});

function formatTime(time: string): string {
  const [hour, minute] = time.split(':').map(Number);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function formatNutrition(entry: LogNutritionDraftEntryV1): string {
  const nutrition = getDraftEntryNutrition(entry);
  if (!nutrition) return 'Nutrition unavailable';
  const values = [
    nutrition.calories == null ? null : `${Math.round(nutrition.calories)} kcal`,
    nutrition.macros.protein_g == null
      ? null
      : `P ${Math.round(nutrition.macros.protein_g)} g`,
    nutrition.macros.carbs_g == null
      ? null
      : `C ${Math.round(nutrition.macros.carbs_g)} g`,
    nutrition.macros.fat_g == null
      ? null
      : `F ${Math.round(nutrition.macros.fat_g)} g`,
  ].filter(Boolean);
  return values.length > 0 ? values.join('   ') : 'Nutrition unavailable';
}

function CommittedEntryRow({
  entry,
  onEdit,
}: {
  entry: JournalEntry;
  onEdit: () => void;
}) {
  const payload = entry.payload as {
    name?: string;
    quantity?: number;
    unit?: string;
    calories?: number;
    macros?: { protein?: number; carbs?: number; fat?: number };
  };
  const grouped = buildGroupedMealView(entry.payload);
  const quantity = payload.quantity ?? 1;
  const values = grouped
    ? [
        grouped.calories == null ? null : `${Math.round(grouped.calories)} kcal`,
        grouped.macros?.protein == null ? null : `P ${Math.round(grouped.macros.protein)} g`,
        grouped.macros?.carbs == null ? null : `C ${Math.round(grouped.macros.carbs)} g`,
        grouped.macros?.fat == null ? null : `F ${Math.round(grouped.macros.fat)} g`,
      ]
    : [
        payload.calories == null ? null : `${Math.round(payload.calories * quantity)} kcal`,
        payload.macros?.protein == null ? null : `P ${Math.round(payload.macros.protein * quantity)} g`,
        payload.macros?.carbs == null ? null : `C ${Math.round(payload.macros.carbs * quantity)} g`,
        payload.macros?.fat == null ? null : `F ${Math.round(payload.macros.fat * quantity)} g`,
      ];
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center gap-4 rounded-sm px-4 py-3 text-left transition-colors hover:bg-white/[0.045]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] leading-4 text-emerald-200/55">
          {hasMealGroupPayload(entry.payload) ? 'Meal · Logged' : 'Single Item · Logged'}
        </span>
        <span className="block truncate text-[15px] font-medium leading-5 text-white/90">
          {grouped?.name ?? payload.name ?? 'Item'}
        </span>
        <span className="mt-0.5 block truncate text-xs leading-5 text-white/42">
          {values.filter(Boolean).join('   ') || 'Nutrition unavailable'}
        </span>
      </span>
      <span className="text-xs text-white/35">Edit</span>
    </button>
  );
}

function DraftEntryRow({
  entry,
  active,
  readOnly,
  onActivate,
  onChange,
  onRemove,
}: {
  entry: LogNutritionDraftEntryV1;
  active: boolean;
  readOnly?: boolean;
  onActivate: () => void;
  onChange: (patch: { quantity?: number; unit?: string }) => void;
  onRemove: () => void;
}) {
  const unitOptions =
    entry.kind === 'meal'
      ? ['serving']
      : Array.from(
          new Set([
            entry.unit,
            'serving',
            ...(entry.servingSizeG ? ['g'] : []),
            ...(entry.measures ?? []).map((measure) => measure.unit),
          ]),
        );
  return (
    <article
      id={`log-draft-entry-${entry.id}`}
      onClick={onActivate}
      className={`group rounded-sm px-4 py-3 transition-colors ${
        active && !readOnly ? 'bg-white/[0.07]' : 'hover:bg-white/[0.045]'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] leading-4 text-white/35">
            {entry.kind === 'meal' ? 'Meal' : 'Single Item'}
          </p>
          <h2 className="truncate text-[15px] font-medium leading-5 text-white/90">
            {entry.title}
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-white/42">
            {formatNutrition(entry)}
          </p>
          {!readOnly && (
            <div
              className={`mt-1.5 flex flex-wrap items-center gap-2 transition-opacity ${
                active
                  ? 'opacity-100'
                  : 'opacity-65 group-hover:opacity-100 group-focus-within:opacity-100'
              }`}
              onClick={(event) => event.stopPropagation()}
            >
              <label className="flex items-center gap-1.5 text-xs text-white/48">
                Qty
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={entry.quantity}
                  onFocus={onActivate}
                  onChange={(event) =>
                    onChange({ quantity: Number(event.target.value) })
                  }
                  className="w-[54px] rounded-full border border-white/25 bg-transparent px-2 py-1 text-center text-xs text-white outline-none focus:border-white/60"
                  aria-label={`Quantity for ${entry.title}`}
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-white/48">
                Unit
                <select
                  value={entry.unit}
                  onFocus={onActivate}
                  onChange={(event) => onChange({ unit: event.target.value })}
                  disabled={entry.kind === 'meal'}
                  className="max-w-[150px] rounded-full border border-white/25 bg-[#181711] px-3 py-1 text-xs text-white/70 outline-none focus:border-white/60 disabled:opacity-80"
                  aria-label={`Unit for ${entry.title}`}
                >
                  {unitOptions.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            className={`mt-3 p-1 text-lg leading-none text-white/25 transition-all hover:text-white/75 ${
              active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
            }`}
            aria-label={`Remove ${entry.title}`}
          >
            ×
          </button>
        )}
      </div>
    </article>
  );
}

function SearchResultRow({
  result,
  onAdd,
}: {
  result: LogSearchResult;
  onAdd: () => void;
}) {
  const disabled =
    (result.kind === 'meal' || result.kind === 'recipe') &&
    !isSupportedMealResult(result);
  const subtitle =
    result.kind === 'food'
      ? [
          result.food.food.calories == null
            ? null
            : `${Math.round(result.food.food.calories)} kcal`,
          result.food.food.proteinG == null
            ? null
            : `P ${Math.round(result.food.food.proteinG)} g`,
        ]
          .filter(Boolean)
          .join('   ')
      : result.kind === 'recent_entry'
        ? result.recent.calories == null
          ? 'Recently logged'
          : `${Math.round(result.recent.calories)} kcal`
        : result.kind === 'meal' || result.kind === 'recipe'
          ? `${result.kind === 'meal' ? 'Meal' : 'Recipe'} · ${result.kind === 'meal' ? result.meal.components.length : result.recipe.components.length} items`
          : '';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onAdd}
      className="flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-white/[0.055] disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-white/90">
          {result.title}
        </span>
        <span className="block truncate text-xs text-white/42">{subtitle}</span>
      </span>
      <span className="text-xl font-light text-white/38">{disabled ? 'Review' : '+'}</span>
    </button>
  );
}

function QuickAddModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (food: FoodObject) => void;
}) {
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [servingSizeG, setServingSizeG] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input: CreateCustomFoodInput = {
        name: name.trim(),
        saveToFavorites: true,
        servingUnit: 'serving',
      };
      if (calories) input.calories = Number(calories);
      if (protein) input.proteinG = Number(protein);
      if (carbs) input.carbsG = Number(carbs);
      if (fat) input.fatG = Number(fat);
      if (servingSizeG) input.servingSizeG = Number(servingSizeG);
      const food = await foodService.createCustomFood(input);
      onAdd(food);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to add this item.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/65 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#211f18] p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">Quick Add</p>
            <h2 className="text-lg font-medium text-white">Review item</h2>
          </div>
          <button onClick={onClose} className="p-2 text-white/45 hover:text-white" aria-label="Close">
            ×
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Item name"
            className="col-span-2 rounded-xl border border-white/15 bg-transparent px-3 py-2.5 text-sm text-white outline-none"
          />
          {[
            ['Calories', calories, setCalories],
            ['Protein g', protein, setProtein],
            ['Carbs g', carbs, setCarbs],
            ['Fat g', fat, setFat],
            ['Serving grams', servingSizeG, setServingSizeG],
          ].map(([label, value, setter]) => (
            <input
              key={label as string}
              type="number"
              min="0"
              step="any"
              value={value as string}
              onChange={(event) =>
                (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value)
              }
              placeholder={label as string}
              className="rounded-xl border border-white/15 bg-transparent px-3 py-2.5 text-sm text-white outline-none"
            />
          ))}
        </div>
        {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-white/50">Cancel</button>
          <button
            onClick={() => void submit()}
            disabled={saving}
            className="rounded-full bg-white px-5 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add to Draft'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LogNutritionDraftPage() {
  const router = useRouter();
  const query = (router.query ?? {}) as Record<string, string | string[] | undefined>;
  const plannedQuery = useMemo(() => parsePlannedMealLogQuery(query), [query]);
  const quickLogMode = isPlannedMealAdjustLogContext(plannedQuery);
  const date = useMemo(() => parseLocalDate(plannedQuery.date ?? undefined), [plannedQuery.date]);
  const dateKey = toDateKey(date);
  const rawTime = typeof query.time === 'string' ? query.time : null;
  const hasExplicitTime = Boolean(plannedQuery.time ?? rawTime);
  const initialTime =
    plannedQuery.time ??
    rawTime ??
    '08:00';
  const queryBlock: TimeBlock | null =
    query.block === 'morning' || query.block === 'midday' || query.block === 'evening'
      ? query.block
      : null;
  const queryMealSlot = resolveMealSlotQueryParam(
    plannedQuery.mealSlot ?? (typeof query.mealSlot === 'string' ? query.mealSlot : null),
  );

  const [personId, setPersonId] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState(initialTime);
  const [mealSchedule, setMealSchedule] = useState<MealSchedule>(() => defaultMealSchedule());
  const [selectedMealSlotKey, setSelectedMealSlotKey] =
    useState<MealSlotKey | null>(queryMealSlot);
  const [allowAutoAssignment, setAllowAutoAssignment] = useState(hasExplicitTime);
  const [assignmentSource, setAssignmentSource] =
    useState<MealScheduleContext['assignment_source']>('auto');
  const [draft, setDraft] = useState<LogNutritionDraftV1 | null>(null);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [committedEntries, setCommittedEntries] = useState<JournalEntry[]>([]);
  const [committedLoading, setCommittedLoading] = useState(false);
  const [editingCommitted, setEditingCommitted] = useState<JournalEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LogSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [showSaveMeal, setShowSaveMeal] = useState(false);
  const [mealName, setMealName] = useState('');
  const [savingMeal, setSavingMeal] = useState(false);
  const [saveMealFeedback, setSaveMealFeedback] = useState<string | null>(null);
  const [resolvedPlannedContext, setResolvedPlannedContext] = useState<{
    dateKey: string;
    plannedMealId: string | null;
    meals: PlannedMeal[];
  } | null>(null);
  const postCommitContinuationStorageKeyRef = useRef<string | null>(null);
  const committedFetchIdRef = useRef(0);

  const enabledSlots = useMemo(() => getEnabledMealSlots(mealSchedule), [mealSchedule]);
  const selectedMealSlot = useMemo(
    () => enabledSlots.find((slot) => slot.key === selectedMealSlotKey) ?? null,
    [enabledSlots, selectedMealSlotKey],
  );

  const refreshCommittedEntries = useCallback(async () => {
    if (!personId) return;
    const requestId = ++committedFetchIdRef.current;
    setCommittedEntries([]);
    setCommittedLoading(true);
    const listed = await journalService.listEntriesByDay(date);
    if (requestId !== committedFetchIdRef.current) return;
    setCommittedEntries(
      selectCommittedNutritionEntries(
        listed,
        {
          dateKey,
          mealSlotKey: selectedMealSlot?.key ?? null,
          block: selectedMealSlot ? null : queryBlock,
        },
        enabledSlots,
      ),
    );
    setCommittedLoading(false);
  }, [
    personId,
    date,
    dateKey,
    selectedMealSlot,
    queryBlock,
    enabledSlots,
  ]);

  useEffect(() => {
    if (!router.isReady || !personId) return;
    void refreshCommittedEntries();
  }, [router.isReady, personId, refreshCommittedEntries]);

  useEffect(() => {
    if (!router.isReady) return;
    setSelectedTime(initialTime);
    setSelectedMealSlotKey(queryMealSlot);
    setAllowAutoAssignment(hasExplicitTime);
    setAssignmentSource('auto');
  }, [router.isReady, initialTime, queryMealSlot, hasExplicitTime]);

  useEffect(() => {
    if (!router.isReady) return;
    let cancelled = false;
    void fetch('/api/journal/profile')
      .then(async (response) => {
        if (!response.ok) throw new Error('Profile unavailable');
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        setPersonId(typeof data.profile?.person_id === 'string' ? data.profile.person_id : null);
        setMealSchedule(normalizeMealSchedule(data.profile?.meal_schedule));
      })
      .catch(() => {
        if (!cancelled) setMealSchedule(defaultMealSchedule());
      });
    return () => {
      cancelled = true;
    };
  }, [router.isReady]);

  useEffect(() => {
    if (
      enabledSlots.length === 0 ||
      selectedMealSlotKey ||
      !allowAutoAssignment
    ) return;
    const selected = enabledSlots.reduce<(typeof enabledSlots)[number] | null>(
      (nearest, slot) => {
        if (!nearest) return slot;
        const toMinutes = (value: string) => {
          const [hours, minutes] = value.split(':').map(Number);
          return hours * 60 + minutes;
        };
        return Math.abs(toMinutes(slot.target_time) - toMinutes(selectedTime)) <
          Math.abs(toMinutes(nearest.target_time) - toMinutes(selectedTime))
          ? slot
          : nearest;
      },
      null,
    );
    setSelectedMealSlotKey(selected?.key ?? null);
  }, [enabledSlots, selectedMealSlotKey, selectedTime, allowAutoAssignment]);

  const draftContext = useMemo<LogNutritionDraftContextV1 | null>(() => {
    if (!personId) return null;
    const structuralOccasion = selectedMealSlot
      ? `${selectedMealSlot.key}@${selectedMealSlot.target_time}`
      : `time@${selectedTime}`;
    return {
      personId,
      date: dateKey,
      time: selectedTime,
      occasionKey: structuralOccasion,
      mealSlot: selectedMealSlot?.key ?? null,
      plannedMealId: quickLogMode ? plannedQuery.plannedMealId : null,
      redirect: plannedQuery.redirect ?? null,
    };
  }, [
    personId,
    dateKey,
    selectedTime,
    selectedMealSlot,
    quickLogMode,
    plannedQuery.plannedMealId,
    plannedQuery.redirect,
  ]);

  const storageKey = useMemo(
    () => (draftContext ? getLogNutritionDraftStorageKey(draftContext) : null),
    [draftContext],
  );

  useEffect(() => {
    if (!draftContext || !storageKey || typeof window === 'undefined') return;
    if (postCommitContinuationStorageKeyRef.current === storageKey) {
      postCommitContinuationStorageKeyRef.current = null;
      return;
    }
    const restored = parseLogNutritionDraft(localStorage.getItem(storageKey), draftContext);
    setDraft(restored ?? createLogNutritionDraft(draftContext));
    setActiveEntryId(restored?.entries[0]?.id ?? null);
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      !draft ||
      !draftContext ||
      typeof window === 'undefined' ||
      !isSameLogDraftContext(draft.context, draftContext)
    ) {
      return;
    }
    const key = getLogNutritionDraftStorageKey(draft.context);
    if (draft.entries.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, serializeLogNutritionDraft(draft));
  }, [draft, draftContext]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      setSearching(true);
      const response = await logSearchService.search(trimmed, {
        banks: ['foods', 'meals', 'recent'],
        sectionLimit: 6,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setSearchResults(response.results);
        setSearching(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [searchQuery]);

  const addEntry = useCallback((entry: LogNutritionDraftEntryV1) => {
    setCommitError(null);
    setDraft((current) => {
      if (!current) return current;
      const result = addLogNutritionDraftEntry(current, entry);
      setActiveEntryId(result.entryId);
      requestAnimationFrame(() => {
        document
          .getElementById(`log-draft-entry-${result.entryId}`)
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
      return result.draft;
    });
    setSearchQuery('');
    setSearchResults([]);
  }, []);

  const addSearchResult = (result: LogSearchResult) => {
    if (result.kind === 'food') {
      addEntry(singleItemDraftEntryFromFoodResult(result.food));
      return;
    }
    if (result.kind === 'recent_entry') {
      addEntry(singleItemDraftEntryFromRecent(result.recent));
      return;
    }
    const entry = mealDraftEntryFromSearchResult(result);
    if (entry && isSupportedMealResult(result)) addEntry(entry);
  };

  const handlePlannedResolved = useCallback(
    (meals: PlannedMeal[]) => {
      setResolvedPlannedContext({
        dateKey,
        plannedMealId: plannedQuery.plannedMealId,
        meals,
      });
    },
    [dateKey, plannedQuery.plannedMealId],
  );

  const draftSessionId = draft?.sessionId ?? null;
  useEffect(() => {
    if (
      !quickLogMode ||
      !plannedQuery.plannedMealId ||
      !resolvedPlannedContext ||
      resolvedPlannedContext.dateKey !== dateKey ||
      resolvedPlannedContext.plannedMealId !== plannedQuery.plannedMealId
    ) {
      return;
    }
    const entry = exactPendingPlannedMealDraftEntry(
      resolvedPlannedContext.meals,
      plannedQuery.plannedMealId,
    );
    if (!entry) return;
    setDraft((current) => {
      if (!current) return current;
      const result = addLogNutritionDraftEntry(current, entry);
      setActiveEntryId(result.entryId);
      return result.draft;
    });
  }, [
    quickLogMode,
    plannedQuery.plannedMealId,
    resolvedPlannedContext,
    dateKey,
    draftSessionId,
  ]);

  const mealScheduleContext = useMemo(
    () =>
      selectedMealSlot
        ? buildMealScheduleContext(selectedMealSlot, assignmentSource, mealSchedule)
        : undefined,
    [selectedMealSlot, assignmentSource, mealSchedule],
  );

  const commitReady = draft ? isCommitReadyLogNutritionDraft(draft) : false;

  const commitDraft = async () => {
    if (!draft || !commitReady || committing) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const occurredAt = setTimeOnDate(new Date(date.getTime()), selectedTime);
      await journalService.commitNutritionDraft({
        sessionId: draft.sessionId,
        occurredAt: occurredAt.toISOString(),
        entries: draft.entries.map((entry) => ({
          draftEntryId: entry.id,
          payload: buildJournalPayloadForDraftEntry(entry, mealScheduleContext),
          ...(entry.kind === 'meal' && entry.plannedMealId
            ? {
                plannedMealId: entry.plannedMealId,
                plannedMode: entry.plannedMode ?? 'adjusted',
              }
            : {}),
        })),
      });
      if (typeof window !== 'undefined') {
        localStorage.removeItem(getLogNutritionDraftStorageKey(draft.context));
      }
      const committedPlannedMealId =
        quickLogMode && plannedQuery.plannedMealId
          ? plannedQuery.plannedMealId
          : null;
      const nextContext = committedPlannedMealId
        ? retireConsumedPlannedMealDraftContext(draft.context)
        : draft.context;
      if (committedPlannedMealId) {
        // Retire both resolved state and the URL intent before opening the next
        // draft. The URL transition makes the consumed Quick Log refresh-safe.
        setResolvedPlannedContext(null);
        postCommitContinuationStorageKeyRef.current =
          getLogNutritionDraftStorageKey(nextContext);
        const ordinaryHref = buildOrdinaryLogHref({
          date: nextContext.date,
          time: nextContext.time,
          mealSlot: nextContext.mealSlot,
          redirect: nextContext.redirect,
        });
        try {
          await router.replace(ordinaryHref, undefined, { shallow: true });
        } catch {
          // A successful journal commit must not be reported as failed because
          // client navigation failed. A hard ordinary-mode transition still
          // guarantees refresh cannot replay the consumed execution intent.
          if (typeof window !== 'undefined') {
            window.location.replace(ordinaryHref);
            return;
          }
        }
      }
      setDraft(createLogNutritionDraft(nextContext));
      setActiveEntryId(null);
      await refreshCommittedEntries();
    } catch (cause) {
      setCommitError(cause instanceof Error ? cause.message : 'Unable to log this draft.');
    } finally {
      setCommitting(false);
    }
  };

  const saveAsMeal = async () => {
    if (!draft || !mealName.trim() || savingMeal) return;
    setSavingMeal(true);
    setSaveMealFeedback(null);
    try {
      const document = buildMealDocumentFromLogDraft(draft, mealName);
      const response = await fetch('/api/journal/meals/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(document),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Unable to save this Meal.');
      setShowSaveMeal(false);
      setMealName('');
      setSaveMealFeedback('Meal saved. Your Log Draft is unchanged.');
      window.setTimeout(() => setSaveMealFeedback(null), 3000);
    } catch (cause) {
      setSaveMealFeedback(cause instanceof Error ? cause.message : 'Unable to save this Meal.');
    } finally {
      setSavingMeal(false);
    }
  };

  const handleScan = async (code: string) => {
    const result = await foodService.lookupUpc(code.replace(/\D/g, ''));
    if (!result.found || !result.food) throw new Error('Product not found.');
    addEntry(singleItemDraftEntryFromFood(result.food));
    setShowScanner(false);
  };

  const visibleEntries = draft?.entries ?? [];
  const entryCount = visibleEntries.length;
  const isDraftVisible = Boolean(draft?.entries.length);

  return (
    <div className="min-h-screen bg-[#181711] text-white">
      <main className="mx-auto min-h-screen w-full max-w-[650px] px-6 pb-44 pt-6 sm:pt-10">
        <header className="grid grid-cols-[1fr_auto_1fr] items-center text-xs text-white/75">
          <button
            type="button"
            onClick={() => void router.push(plannedQuery.redirect || APP_ROUTES.log)}
            className="justify-self-start p-1 text-2xl font-light text-white/80"
            aria-label="Back"
          >
            ←
          </button>
          <div className="flex items-center gap-3">
            <label className="relative cursor-pointer">
              <input
                type="date"
                value={dateKey}
                onChange={(event) => {
                  const next = new URLSearchParams();
                  Object.entries(query).forEach(([key, value]) => {
                    const item = Array.isArray(value) ? value[0] : value;
                    if (item) next.set(key, item);
                  });
                  next.set('date', event.target.value);
                  void router.replace(`${APP_ROUTES.logNew}?${next.toString()}`);
                }}
                className="absolute inset-0 opacity-0"
                aria-label="Log date"
              />
              {date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </label>
            <label className="relative cursor-pointer">
              <input
                type="time"
                value={selectedTime}
                onChange={(event) => {
                  setSelectedTime(event.target.value);
                  setAssignmentSource('auto');
                  setSelectedMealSlotKey(null);
                  setAllowAutoAssignment(true);
                }}
                className="absolute inset-0 opacity-0"
                aria-label="Log time"
              />
              {formatTime(selectedTime)}
            </label>
          </div>
          <span className="justify-self-end text-white/90">Meals</span>
        </header>

        {enabledSlots.length > 0 && (
          <div className="mt-5 flex justify-end">
            <select
              value={selectedMealSlot?.key ?? ''}
              onChange={(event) => {
                if (!isMealSlotKey(event.target.value)) return;
                const slot = enabledSlots.find((candidate) => candidate.key === event.target.value);
                setSelectedMealSlotKey(event.target.value);
                setAssignmentSource('manual');
                setAllowAutoAssignment(true);
                if (slot) setSelectedTime(slot.target_time);
              }}
              className="bg-transparent text-[11px] text-white/35 outline-none"
              aria-label="Meal Rhythm occasion"
            >
              {enabledSlots.map((slot) => (
                <option key={slot.key} value={slot.key} className="bg-[#181711]">
                  {slot.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <PlannedMealContextCard
          mealSlot={selectedMealSlot}
          scheduleSlots={enabledSlots}
          date={date}
          time={selectedTime}
          explicitPlannedMealId={plannedQuery.plannedMealId}
          adjustMode={quickLogMode}
          redirectTarget={plannedQuery.redirect}
          contextOnly
          onResolved={handlePlannedResolved}
        />

        <section className="relative mt-7">
          <div
            className={`relative flex items-center rounded-[26px] border border-white/20 ${
              searchQuery.trim().length >= 2 ? 'rounded-b-none' : ''
            }`}
          >
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search"
              className="h-11 min-w-0 flex-1 bg-transparent px-7 text-sm text-white/85 placeholder:text-white/35 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="p-3 text-lg text-white/55 hover:text-white"
              aria-label="Scan barcode"
            >
              ⛶
            </button>
            <button
              type="button"
              onClick={() => setShowAddMenu((open) => !open)}
              className="py-3 pl-1 pr-5 text-xl font-light text-white/55 hover:text-white"
              aria-label="More ways to add"
              aria-expanded={showAddMenu}
            >
              +
            </button>
          </div>
          {showAddMenu && (
            <div className="absolute right-1 top-12 z-30 w-36 rounded-xl border border-white/15 bg-[#211f18] p-1 shadow-xl">
              <button
                type="button"
                onClick={() => {
                  setShowAddMenu(false);
                  setShowQuickAdd(true);
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-xs text-white/75 hover:bg-white/[0.06]"
              >
                Quick Add
              </button>
            </div>
          )}
          {searchQuery.trim().length >= 2 && (
            <div className="absolute left-0 right-0 z-20 max-h-[360px] overflow-y-auto rounded-b-2xl border border-t-0 border-white/20 bg-[#181711] shadow-2xl">
              {searching ? (
                <p className="px-5 py-4 text-xs text-white/35">Searching…</p>
              ) : searchResults.length > 0 ? (
                searchResults.map((result) => (
                  <SearchResultRow
                    key={`${result.kind}:${result.id}`}
                    result={result}
                    onAdd={() => addSearchResult(result)}
                  />
                ))
              ) : (
                <p className="px-5 py-4 text-xs text-white/35">No results found.</p>
              )}
            </div>
          )}
        </section>

        <section className="mt-4 space-y-0.5" aria-label="Logged entries">
          {committedLoading && (
            <p className="px-4 py-3 text-xs text-white/35">Loading logged entries…</p>
          )}
          {committedEntries.map((entry) => (
            <CommittedEntryRow
              key={entry.id}
              entry={entry}
              onEdit={() => setEditingCommitted(entry)}
            />
          ))}
        </section>

        <section className="mt-1 space-y-0.5" aria-label="New Log Draft entries">
          {visibleEntries.map((entry) => (
            <DraftEntryRow
              key={entry.id}
              entry={entry}
              active={activeEntryId === entry.id}
              onActivate={() => setActiveEntryId(entry.id)}
              onChange={(patch) =>
                setDraft((current) =>
                  current
                    ? updateLogNutritionDraftEntry(current, entry.id, patch)
                    : current,
                )
              }
              onRemove={() =>
                setDraft((current) =>
                  current ? removeLogNutritionDraftEntry(current, entry.id) : current,
                )
              }
            />
          ))}
        </section>

        {commitError && (
          <p className="mt-5 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-xs text-red-200">
            {commitError}
          </p>
        )}
        {saveMealFeedback && (
          <p className="mt-5 text-center text-xs text-white/45">{saveMealFeedback}</p>
        )}
      </main>

      <footer
        className={`fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-[#181711] via-[#181711] to-transparent pt-7 ${SIGNED_IN_DESKTOP_DRAWER_LEFT_CLASS}`}
      >
        <div className="mx-auto w-full max-w-[650px] px-6">
          <div className="flex items-center justify-between px-4 pb-3 text-[10px] text-white/55">
            <span>
              {committedEntries.length} Logged
            </span>
            <span>
              {entryCount} Draft {entryCount === 1 ? 'Entry' : 'Entries'}
            </span>
          </div>
          <div className="flex min-h-[84px] items-start justify-between rounded-t-2xl border border-b-0 border-white/30 px-9 py-5">
            <button
              type="button"
              onClick={() => void commitDraft()}
              disabled={!commitReady || committing}
              className="min-w-[74px] rounded-full bg-white px-5 py-2 text-xs font-medium text-black transition-colors disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/25"
            >
              {!isDraftVisible && committedEntries.length > 0
                ? 'Logged'
                : committing
                  ? 'Logging…'
                  : 'Log'}
            </button>
            <button
              type="button"
              onClick={() => setShowSaveMeal(true)}
              disabled={!draft?.entries.length}
              className="px-2 py-2 text-xs text-white/35 transition-colors hover:text-white/70 disabled:opacity-25"
            >
              Save as Meal
            </button>
          </div>
        </div>
      </footer>

      {editingCommitted && (
        <CommittedNutritionEditor
          key={`${editingCommitted.id}:${editingCommitted.updated_at.getTime()}`}
          entry={editingCommitted}
          mealSchedule={mealSchedule}
          presentation="modal"
          onClose={() => setEditingCommitted(null)}
          onSaved={() => {
            setEditingCommitted(null);
            void refreshCommittedEntries();
          }}
          onDeleted={() => {
            setEditingCommitted(null);
            void refreshCommittedEntries();
          }}
        />
      )}
      {showScanner && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
      {showQuickAdd && (
        <QuickAddModal
          onClose={() => setShowQuickAdd(false)}
          onAdd={(food) => addEntry(singleItemDraftEntryFromFood(food))}
        />
      )}
      {showSaveMeal && draft && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/65 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#211f18] p-5">
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">Save as Meal</p>
            <h2 className="mt-1 text-lg font-medium">Name this reusable Meal</h2>
            <input
              autoFocus
              value={mealName}
              onChange={(event) => setMealName(event.target.value)}
              placeholder="Meal name"
              className="mt-4 w-full rounded-xl border border-white/15 bg-transparent px-3 py-2.5 text-sm outline-none"
            />
            <p className="mt-2 text-xs text-white/35">
              This does not log anything. Your active draft will remain here.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setShowSaveMeal(false)} className="px-4 py-2 text-sm text-white/50">
                Cancel
              </button>
              <button
                onClick={() => void saveAsMeal()}
                disabled={!mealName.trim() || savingMeal}
                className="rounded-full bg-white px-5 py-2 text-sm font-medium text-black disabled:opacity-40"
              >
                {savingMeal ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
