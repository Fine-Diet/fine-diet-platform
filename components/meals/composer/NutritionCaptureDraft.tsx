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
}: {
  state: MealComposerState;
  dispatch: Dispatch<MealComposerAction>;
  commit: NutritionCaptureDraftCommit;
  submitting?: boolean;
  error?: string | null;
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

  const components = state.document.components;

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
    components.length > 0 &&
    state.document.title.trim().length > 0 &&
    components.every((component) =>
      component.name.trim().length > 0 &&
      (component.quantity == null || component.quantity > 0),
    );

  return (
    <div className="space-y-6">
      <section aria-labelledby={searchId}>
        <label
          id={searchId}
          className="mb-2 block text-sm font-semibold text-white"
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
              className="h-14 w-full rounded-2xl border border-white/15 bg-white/[0.07] pl-12 pr-4 text-base text-white outline-none placeholder:text-white/35 focus:border-[#d7ecff]/60 focus:ring-2 focus:ring-[#d7ecff]/10"
            />
          </div>
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="inline-flex h-14 shrink-0 items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white"
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
              className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06] text-2xl font-light text-white/85 hover:bg-white/10 hover:text-white"
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

        <div className="mt-3 flex items-center gap-2" aria-label="Search filter">
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
        </div>

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
        <div className="flex items-center justify-between gap-3">
          <h3 id={`${searchId}-draft`} className="text-sm font-semibold text-white">
            Draft
          </h3>
          <span className="text-xs text-white/40">
            {components.length} {components.length === 1 ? 'item' : 'items'}
          </span>
        </div>
        {draftNotice && (
          <p className="mt-2 text-xs text-[#d7ecff]/75" role="status">{draftNotice}</p>
        )}
        {components.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-white/15 px-5 py-8 text-center">
            <p className="text-sm text-white/45">
              Search, scan, or use + to add the first item.
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {components.map((component) => {
              const manual = !component.food_object_id && !component.recipe_meal_document_id;
              return (
                <li
                  id={`draft-${component.component_id}`}
                  key={component.component_id}
                  tabIndex={-1}
                  className="rounded-2xl border border-white/12 bg-white/[0.045] p-4 outline-none focus:border-[#d7ecff]/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
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
                        <p className="truncate text-sm font-medium text-white">{component.name}</p>
                      )}
                      <p className="mt-1 text-xs text-white/40">
                        {component.calories == null
                          ? 'Nutrition will remain reviewable'
                          : `${Math.round(component.calories)} cal`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'REMOVE_COMPONENT',
                          componentId: component.component_id,
                        })
                      }
                      className="rounded-full px-2 py-1 text-xs font-semibold text-white/45 hover:bg-white/10 hover:text-white"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label>
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/35">
                        Quantity
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
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-[#d7ecff]/50"
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
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-[#d7ecff]/50"
                      />
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {components.length > 0 && (
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

      <div className="sticky bottom-0 -mx-5 flex justify-end border-t border-white/10 bg-[#16110d]/95 px-5 py-4 backdrop-blur sm:-mx-8 sm:px-8">
        <button
          type="button"
          disabled={!draftReady || submitting}
          onClick={() => void commit.onCommit()}
          className="inline-flex min-w-28 items-center justify-center rounded-full bg-[#d7ecff] px-6 py-2.5 text-sm font-semibold text-black hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? 'Saving…' : commit.label}
        </button>
      </div>

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
