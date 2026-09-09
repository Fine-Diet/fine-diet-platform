'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
} from 'react';

import BarcodeScanner from '@/components/journal/BarcodeScanner';
import { MealComposerRecipeSearch } from '@/components/meals/MealComposerRecipeSearch';
import { foodService } from '@/lib/food/foodService';
import {
  formatCalories,
  formatFoodName,
  formatMacros,
  formatServing,
  type FoodObject,
} from '@/lib/food/types';
import { logSearchService } from '@/lib/logSearch/logSearchService';
import {
  plansCaptureSearchBanks,
  rankPlansCaptureSearchResults,
  type PlansCaptureSearchFilter,
} from '@/lib/logSearch/plansCaptureSearch';
import type {
  LogSearchFoodResult,
  LogSearchMealResult,
} from '@/lib/logSearch/types';
import type {
  MealComposerAction,
  MealComposerState,
} from '@/lib/meals/composer/types';

export interface NutritionCaptureDraftCommit {
  label: string;
  onCommit: () => void | Promise<void>;
}

/**
 * Shared capture-first Meal Composer surface.
 *
 * Search, barcode, Quick Add, and saved Recipe selection only dispatch into
 * the caller's canonical MealComposer draft. Persistence remains an injected
 * edge action so Plans can Save while a future Log caller can inject Log.
 */
export function NutritionCaptureDraft({
  state,
  dispatch,
  commit,
  submitting = false,
  error,
  dirty = true,
  allowEmptyCommit = false,
  density = 'comfortable',
  occasionLabel = 'meal',
}: {
  state: MealComposerState;
  dispatch: Dispatch<MealComposerAction>;
  commit: NutritionCaptureDraftCommit;
  submitting?: boolean;
  error?: string | null;
  dirty?: boolean;
  allowEmptyCommit?: boolean;
  density?: 'compact' | 'comfortable';
  occasionLabel?: string;
}) {
  const searchId = useId();
  const sequence = useRef(0);
  const searchRequest = useRef(0);
  const [query, setQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<PlansCaptureSearchFilter>('all');
  const [savedMealResults, setSavedMealResults] = useState<LogSearchMealResult[]>([]);
  const [foodResults, setFoodResults] = useState<LogSearchFoodResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchTouched, setSearchTouched] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [captureMenuOpen, setCaptureMenuOpen] = useState(false);
  const [recipeSearchOpen, setRecipeSearchOpen] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const [openOverflowId, setOpenOverflowId] = useState<string | null>(null);

  const components = state.document.components;
  const compact = density === 'compact';
  const initialComponentIds = useRef(new Set(components.map((component) => component.component_id)));
  const savedMealSource = state.document.source.source_type === 'saved_meal';
  const savedMealRootId = savedMealSource
    ? components.find((component) => !component.component_id.startsWith('capture-'))?.component_id ?? null
    : null;
  const visibleComponents = compact && savedMealRootId
    ? components.filter(
        (component) =>
          component.component_id === savedMealRootId ||
          component.component_id.startsWith('capture-'),
      )
    : components;
  const showSearchFilters =
    !compact ||
    query.trim().length >= 2 ||
    savedMealResults.length > 0 ||
    foodResults.length > 0;
  const totalCalories = state.document.totals?.calories ?? null;

  function nextComponentId(source: string): string {
    sequence.current += 1;
    return `capture-${source}-${sequence.current}`;
  }

  function defaultTitle(name: string) {
    if (!state.document.title.trim()) {
      dispatch({ type: 'SET_TITLE', title: name.trim() });
    }
  }

  function focusExisting(componentId: string) {
    setDraftNotice('Already in your draft — review or update it below.');
    window.requestAnimationFrame(() => {
      document.getElementById(`draft-${componentId}`)?.focus();
    });
  }

  function addFood(food: FoodObject) {
    const existing = components.find((component) => component.food_object_id === food.id);
    if (existing) {
      focusExisting(existing.component_id);
      return;
    }
    dispatch({
      type: 'ADD_COMPONENT_FROM_SELECTION',
      componentId: nextComponentId('food'),
      selection: {
        food_object_id: food.id,
        name: formatFoodName(food),
        food,
      },
    });
    defaultTitle(formatFoodName(food));
    setDraftNotice(`${formatFoodName(food)} added to your draft.`);
    setQuery('');
    setSavedMealResults([]);
    setFoodResults([]);
    setSearchTouched(false);
  }

  function loadSavedMeal(result: LogSearchMealResult) {
    dispatch({
      type: 'LOAD_MEAL_DOCUMENT',
      document: result.meal,
    });
    setDraftNotice(`${result.title} loaded into your draft for review.`);
    setQuery('');
    setSavedMealResults([]);
    setFoodResults([]);
    setSearchTouched(false);
  }

  useEffect(() => {
    const requestId = ++searchRequest.current;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSavedMealResults([]);
      setFoodResults([]);
      setSearching(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      const response = await logSearchService.search(trimmed, {
        banks: plansCaptureSearchBanks(searchFilter),
        limit: 18,
        sectionLimit: 6,
      });
      if (searchRequest.current !== requestId) return;
      const ranked = rankPlansCaptureSearchResults(response.results, searchFilter);
      setSavedMealResults(
        ranked
          .filter((result): result is LogSearchMealResult => result.kind === 'meal')
          .slice(0, 6),
      );
      setFoodResults(
        ranked
          .filter((result): result is LogSearchFoodResult => result.kind === 'food')
          .slice(0, 18),
      );
      setSearching(false);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, searchFilter]);

  async function handleBarcode(code: string) {
    setScannerOpen(false);
    const cleaned = code.replace(/\D/g, '').trim();
    if (cleaned.length < 8) {
      setDraftNotice('That barcode is invalid. Try scanning again or use nutrition search.');
      return;
    }
    setScanLoading(true);
    setDraftNotice(null);
    const result = await foodService.lookupUpc(cleaned, { createProvisional: false });
    setScanLoading(false);
    if (!result.found || !result.food) {
      setDraftNotice('No food was found for that barcode. Try nutrition search or Quick Add.');
      return;
    }
    addFood(result.food);
  }

  function quickAdd() {
    dispatch({
      type: 'ADD_BLANK_COMPONENT',
      componentId: nextComponentId('manual'),
    });
    setCaptureMenuOpen(false);
    setRecipeSearchOpen(false);
    setDraftNotice('Blank draft item added. Add a name and the amount you know.');
  }

  const draftReady =
    (allowEmptyCommit && dirty && components.length === 0) ||
    (components.length > 0 &&
      state.document.title.trim().length > 0 &&
      components.every((component) =>
        component.name.trim().length > 0 &&
        (component.quantity == null || component.quantity > 0),
      ));

  return (
    <div className={compact ? 'space-y-3' : 'space-y-6'}>
      <section aria-labelledby={searchId}>
        <label
          id={searchId}
          className={compact ? 'sr-only' : 'mb-2 block text-sm font-semibold text-white'}
          htmlFor={`${searchId}-input`}
        >
          Nutrition search
        </label>
        <div className="flex items-stretch gap-2">
          <div className="relative min-w-0 flex-1">
            <svg
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              id={`${searchId}-input`}
              type="search"
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchTouched(true);
              }}
              placeholder="Search saved meals, foods, and brands"
              className={`${compact ? 'h-9 rounded-full pl-10 text-xs' : 'h-14 rounded-2xl pl-12 text-base'} w-full border border-white/15 bg-white/[0.07] pr-4 text-white outline-none placeholder:text-white/35 focus:border-[#d7ecff]/60 focus:ring-2 focus:ring-[#d7ecff]/10`}
            />
          </div>
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className={`inline-flex shrink-0 items-center gap-2 border border-white/15 bg-white/[0.06] font-semibold text-white/80 hover:bg-white/10 hover:text-white ${compact ? 'h-9 rounded-full px-3 text-xs' : 'h-14 rounded-2xl px-4 text-sm'}`}
          >
            <BarcodeGlyph />
            <span className="hidden sm:inline">Scan</span>
            <span className="sm:hidden">Scan</span>
          </button>
          <div className="relative">
            <button
              type="button"
              aria-label="More ways to add"
              aria-haspopup="menu"
              aria-expanded={captureMenuOpen}
              onClick={() => setCaptureMenuOpen((open) => !open)}
              className={`flex items-center justify-center border border-white/15 bg-white/[0.06] font-light text-white/85 hover:bg-white/10 hover:text-white ${compact ? 'h-9 w-9 rounded-full text-xl' : 'h-14 w-14 rounded-2xl text-2xl'}`}
            >
              +
            </button>
            {captureMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-16 z-20 w-48 rounded-2xl border border-white/15 bg-[#29231d] p-1.5 shadow-2xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={quickAdd}
                  className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-white/80 hover:bg-white/10 hover:text-white"
                >
                  Quick Add
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setCaptureMenuOpen(false);
                    setRecipeSearchOpen(true);
                  }}
                  className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-white/80 hover:bg-white/10 hover:text-white"
                >
                  Add saved Recipe
                </button>
              </div>
            )}
          </div>
        </div>

        {showSearchFilters && <div className="mt-3 flex items-center gap-2" aria-label="Search filter">
          {([
            ['all', 'All'],
            ['saved_meals', 'Saved Meals'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={searchFilter === value}
              onClick={() => {
                setSearchFilter(value);
                if (value === 'saved_meals') setFoodResults([]);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                searchFilter === value
                  ? 'border-[#d7ecff]/60 bg-[#d7ecff]/15 text-[#d7ecff]'
                  : 'border-white/12 bg-white/[0.03] text-white/50 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>}

        {scanLoading && <p className="mt-3 text-sm text-white/55">Looking up barcode…</p>}
        {query.trim().length > 0 && query.trim().length < 2 && (
          <p className="mt-3 text-sm text-white/45">Type at least 2 characters.</p>
        )}
        {searching && <p className="mt-3 text-sm text-white/55">Searching…</p>}
        {!searching &&
          searchTouched &&
          query.trim().length >= 2 &&
          savedMealResults.length === 0 &&
          foodResults.length === 0 && (
            <p className="mt-3 text-sm text-white/45">
              {searchFilter === 'saved_meals'
                ? 'No matching saved meals found.'
                : 'No matching saved meals or foods found.'}
            </p>
          )}
        {(savedMealResults.length > 0 || foodResults.length > 0) && (
          <div className="mt-2 max-h-80 overflow-y-auto rounded-2xl border border-white/12 bg-black/20">
            {savedMealResults.length > 0 && (
              <section aria-label="Saved Meals results">
                <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d7ecff]/65">
                  Saved Meals
                </p>
                <ul className="divide-y divide-white/10">
                  {savedMealResults.map((result) => (
                    <li key={result.id}>
                      <button
                        type="button"
                        onClick={() => loadSavedMeal(result)}
                        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-white/[0.06]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-white">
                            {result.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-white/45">
                            {result.meal.components.length}{' '}
                            {result.meal.components.length === 1 ? 'item' : 'items'}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-[#d7ecff]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#d7ecff]/75">
                          Saved Meal
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {foodResults.length > 0 && (
              <section aria-label="Food results">
                <p className="border-t border-white/10 px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40 first:border-t-0">
                  Foods
                </p>
                <ul className="divide-y divide-white/10">
                  {foodResults.map((result) => (
                    <li key={result.food.food.id}>
                      <button
                        type="button"
                        onClick={() => addFood(result.food.food)}
                        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-white/[0.06]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-white">
                            {formatFoodName(result.food.food)}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-white/45">
                            {formatServing(result.food.food)} · {formatMacros(result.food.food)}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-medium text-white/55">
                          {formatCalories(result.food.food.calories)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {recipeSearchOpen && (
          <MealComposerRecipeSearch
            onSelect={(recipe) => {
              const existing = components.find(
                (component) => component.recipe_meal_document_id === recipe.id,
              );
              if (existing) {
                focusExisting(existing.component_id);
                return;
              }
              dispatch({
                type: 'ADD_COMPONENT_FROM_RECIPE',
                componentId: nextComponentId('recipe'),
                selection: { recipe, quantity: 1 },
              });
              defaultTitle(recipe.title);
              setRecipeSearchOpen(false);
              setDraftNotice(`${recipe.title} added to your draft.`);
            }}
            onCancel={() => setRecipeSearchOpen(false)}
          />
        )}
      </section>

      <section aria-labelledby={`${searchId}-draft`}>
        {!compact && <div className="flex items-center justify-between gap-3">
          <h3 id={`${searchId}-draft`} className="text-sm font-semibold text-white">
            Meal items
          </h3>
          <span className="text-xs text-white/40">
            {components.length} {components.length === 1 ? 'item' : 'items'}
          </span>
        </div>}
        {draftNotice && (
          <p className="mt-2 text-xs text-[#d7ecff]/75" role="status">{draftNotice}</p>
        )}
        {components.length === 0 ? (
          !compact && (
          <div className="mt-3 rounded-2xl border border-dashed border-white/15 px-5 py-8 text-center">
            <p className="text-sm text-white/45">
              Search, scan, or use + to add the first item.
            </p>
          </div>
          )
        ) : (
          <ul className={compact ? 'divide-y divide-white/10 border-y border-white/10' : 'mt-3 space-y-2'}>
            {visibleComponents.map((component) => {
              const manual = !component.food_object_id && !component.recipe_meal_document_id;
              const persisted = initialComponentIds.current.has(component.component_id);
              const rowType =
                component.recipe_meal_document_id ||
                component.component_id === savedMealRootId
                  ? 'Meal'
                  : 'Single Item';
              const rowTitle =
                component.component_id === savedMealRootId
                  ? state.document.title
                  : component.name;
              return (
                <li
                  id={`draft-${component.component_id}`}
                  key={component.component_id}
                  tabIndex={-1}
                  className={compact
                    ? 'px-1 py-3 outline-none focus:bg-white/[0.025]'
                    : 'rounded-2xl border border-white/12 bg-white/[0.045] p-4 outline-none focus:border-[#d7ecff]/50'}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="mb-0.5 text-[9px] uppercase tracking-[0.12em] text-white/35">
                        {rowType}
                      </p>
                      {manual ? (
                        <input
                          type="text"
                          value={component.name}
                          onChange={(event) => {
                            dispatch({
                              type: 'UPDATE_COMPONENT_NAME',
                              componentId: component.component_id,
                              name: event.target.value,
                            });
                            if (
                              components.length === 1 &&
                              !state.document.title.trim()
                            ) {
                              dispatch({ type: 'SET_TITLE', title: event.target.value });
                            }
                          }}
                          placeholder="Item name"
                          className="w-full border-0 bg-transparent p-0 text-sm font-medium text-white outline-none placeholder:text-white/35"
                        />
                      ) : (
                        <p className="truncate text-sm font-medium text-white">{rowTitle}</p>
                      )}
                      <p className="mt-1 text-xs text-white/40">
                        {component.calories == null
                          ? 'Nutrition will remain reviewable'
                          : `${Math.round(component.calories)} cal`}
                      </p>
                    </div>
                    {pendingRemovalId === component.component_id ? (
                        <div className="flex shrink-0 items-center gap-1" role="group" aria-label={`Remove ${rowTitle}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setPendingRemovalId(null);
                            setOpenOverflowId(null);
                          }}
                          className="rounded-full px-2 py-1 text-[11px] font-semibold text-white/55 hover:bg-white/10 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const ids =
                              component.component_id === savedMealRootId
                                ? components
                                    .filter((candidate) => !candidate.component_id.startsWith('capture-'))
                                    .map((candidate) => candidate.component_id)
                                : [component.component_id];
                            ids.forEach((componentId) =>
                              dispatch({ type: 'REMOVE_COMPONENT', componentId }),
                            );
                            if (components.length === 1 && !allowEmptyCommit) {
                              dispatch({ type: 'SET_TITLE', title: '' });
                            }
                            setPendingRemovalId(null);
                            setOpenOverflowId(null);
                          }}
                          className="rounded-full bg-red-500/15 px-2 py-1 text-[11px] font-semibold text-red-100 hover:bg-red-500/25"
                        >
                          Remove
                        </button>
                      </div>
                    ) : persisted ? (
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          aria-label={`Actions for ${rowTitle}`}
                          aria-haspopup="menu"
                          aria-expanded={openOverflowId === component.component_id}
                          onClick={() =>
                            setOpenOverflowId((current) =>
                              current === component.component_id ? null : component.component_id,
                            )
                          }
                          className="grid h-7 w-7 place-items-center rounded-full text-lg leading-none text-white/45 hover:bg-white/10 hover:text-white"
                        >
                          ⋯
                        </button>
                        {openOverflowId === component.component_id && (
                          <div
                            role="menu"
                            className="absolute right-0 top-8 z-20 w-44 rounded-xl border border-white/15 bg-[#29231d] p-1 shadow-2xl"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => setPendingRemovalId(component.component_id)}
                              className="w-full rounded-lg px-3 py-2 text-left text-xs text-white/75 hover:bg-white/10 hover:text-white"
                            >
                              Remove from {occasionLabel}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Remove ${rowTitle} from this planned meal`}
                        onClick={() => setPendingRemovalId(component.component_id)}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-base text-white/45 hover:bg-white/10 hover:text-white"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className={compact ? 'mt-2 flex max-w-xs items-end gap-2' : 'mt-3 grid grid-cols-2 gap-2'}>
                    <label>
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/35">
                        Qty
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={component.quantity ?? ''}
                        onChange={(event) => {
                          const value = event.target.value.trim();
                          const quantity = value === '' ? null : Number(value);
                          dispatch({
                            type: 'UPDATE_COMPONENT_QUANTITY_UNIT',
                            componentId: component.component_id,
                            quantity: Number.isFinite(quantity) ? quantity : null,
                            unit: component.unit,
                          });
                        }}
                        className={`${compact ? 'w-20 rounded-full px-3 py-1.5 text-xs' : 'w-full rounded-xl px-3 py-2 text-sm'} border border-white/10 bg-black/20 text-white outline-none focus:border-[#d7ecff]/50`}
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/35">
                        Unit
                      </span>
                      <input
                        type="text"
                        value={component.unit ?? ''}
                        onChange={(event) =>
                          dispatch({
                            type: 'UPDATE_COMPONENT_QUANTITY_UNIT',
                            componentId: component.component_id,
                            quantity: component.quantity,
                            unit: event.target.value || null,
                          })
                        }
                        className={`${compact ? 'w-28 rounded-full px-3 py-1.5 text-xs' : 'w-full rounded-xl px-3 py-2 text-sm'} border border-white/10 bg-black/20 text-white outline-none focus:border-[#d7ecff]/50`}
                      />
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {components.length > 0 && compact && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 px-1 pb-3 text-[11px] text-white/45">
          <span className="font-semibold text-white/70">Total</span>
          <span>NDS —</span>
          <span>{totalCalories == null ? '—' : Math.round(totalCalories)} kcal</span>
        </div>
      )}

      {components.length > 0 && !compact && (
        <details className="rounded-2xl border border-white/10 bg-white/[0.025]">
          <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-white/55">
            Optional meal details
          </summary>
          <div className="space-y-3 border-t border-white/10 p-4">
            <label className="block">
              <span className="mb-1 block text-xs text-white/45">Meal name</span>
              <input
                type="text"
                value={state.document.title}
                onChange={(event) => dispatch({ type: 'SET_TITLE', title: event.target.value })}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-[#d7ecff]/50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-white/45">Prep notes</span>
              <textarea
                rows={2}
                value={state.document.prep_notes ?? ''}
                onChange={(event) =>
                  dispatch({ type: 'SET_PREP_NOTES', prepNotes: event.target.value })
                }
                className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-[#d7ecff]/50"
              />
            </label>
          </div>
        </details>
      )}

      {error && (
        <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {error}
        </p>
      )}

      {dirty && (
        <div className={compact
          ? 'flex items-center justify-between border-t border-white/10 px-1 pt-3'
          : 'sticky bottom-0 -mx-5 flex items-center justify-between border-t border-white/10 bg-[#16110d]/95 px-5 py-4 backdrop-blur sm:-mx-8 sm:px-8'}
        >
          <span className="text-xs font-semibold text-white/45">Draft</span>
          <button
            type="button"
            disabled={!draftReady || submitting}
            onClick={() => void commit.onCommit()}
            className={`inline-flex items-center justify-center rounded-full bg-[#d7ecff] font-semibold text-black hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 ${compact ? 'min-w-20 px-4 py-1.5 text-xs' : 'min-w-28 px-6 py-2.5 text-sm'}`}
          >
            {submitting ? 'Saving…' : commit.label}
          </button>
        </div>
      )}

      {scannerOpen && (
        <BarcodeScanner
          elevated
          onScan={(code) => void handleBarcode(code)}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </div>
  );
}

function BarcodeGlyph() {
  return (
    <svg
      aria-hidden
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
    >
      <path d="M3 7V4a1 1 0 0 1 1-1h3M17 3h3a1 1 0 0 1 1 1v3M21 17v3a1 1 0 0 1-1 1h-3M7 21H4a1 1 0 0 1-1-1v-3" />
      <path d="M7 8v8M10 8v8M13 8v8M17 8v8" />
    </svg>
  );
}
