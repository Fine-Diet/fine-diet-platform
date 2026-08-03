'use client';

/**
 * Plans Authoring Convergence — Phase 2: shared component-list editor.
 *
 * The reusable core of the Meal Composer: renders a MealComponent[] with
 * EXPLICIT move-up, move-down, duplicate, and remove controls (no
 * drag-and-drop, per the packet's product rules) plus food-search grounding
 * via the existing MealComponentFoodSearch. This is the one piece every
 * composer context (create, edit-saved, plan, log, adjust-and-log) shares.
 */

import { useState } from 'react';

import {
  MealComponentFoodSearch,
  type SelectedFoodGrounding,
} from '@/components/meals/MealComponentFoodSearch';
import { MealComposerRecipeSearch } from '@/components/meals/MealComposerRecipeSearch';
import type { MealComponent, MealDocument } from '@/lib/meals/types';

export interface MealComposerComponentListHandlers {
  onMoveUp: (componentId: string) => void;
  onMoveDown: (componentId: string) => void;
  onDuplicate: (componentId: string) => void;
  onRemove: (componentId: string) => void;
  onUpdateName: (componentId: string, name: string) => void;
  onUpdateQuantityUnit: (componentId: string, quantity: number | null, unit: string | null) => void;
  onUpdatePrepNote: (componentId: string, note: string) => void;
  onApplySelection: (componentId: string, selection: SelectedFoodGrounding) => void;
  onClearGrounding: (componentId: string) => void;
  onAddBlank: () => void;
  onAddFromSelection: (selection: SelectedFoodGrounding) => void;
  onAddFromRecipe?: (recipe: MealDocument) => void;
}

function isRecipeReference(component: MealComponent): boolean {
  return (
    component.component_kind === 'recipe_document' ||
    (!!component.recipe_meal_document_id && component.recipe_meal_document_id.trim().length > 0)
  );
}

function isComponentGrounded(component: MealComponent): boolean {
  if (isRecipeReference(component)) {
    return component.nutrition_snapshot?.status === 'available' ||
      component.nutrition_snapshot?.status === 'estimated' ||
      (component.match_status === 'matched' && !component.needs_review);
  }
  return (
    !!component.food_object_id &&
    (component.match_status === 'matched' || component.match_status === 'partial')
  );
}

const inputClass =
  'w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-brand-50 antialiased outline-none transition-colors placeholder:text-white/30 focus:border-emerald-300/50';
const controlButtonClass =
  'rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-30';

export function MealComposerComponentList({
  components,
  handlers,
  itemNounSingular = 'component',
  hostDocumentId = null,
  allowRecipeReferences = true,
}: {
  components: MealComponent[];
  handlers: MealComposerComponentListHandlers;
  /** e.g. "ingredient" for recipes vs "component" for assembled meals. */
  itemNounSingular?: string;
  hostDocumentId?: string | null;
  /** Package 5A — meals may attach recipes; recipe editors stay food-only. */
  allowRecipeReferences?: boolean;
}) {
  const [searchOpenFor, setSearchOpenFor] = useState<'add' | 'add-recipe' | string | null>(null);

  return (
    <div>
      <div className="space-y-3">
        {components.map((component, index) => {
          const recipeRef = isRecipeReference(component);
          const grounded = isComponentGrounded(component);
          return (
            <div
              key={component.component_id}
              className="rounded-xl border border-white/10 bg-white/[0.025] p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Move up"
                    aria-label={`Move ${component.name || itemNounSingular} up`}
                    disabled={index === 0}
                    onClick={() => handlers.onMoveUp(component.component_id)}
                    className={controlButtonClass}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    title="Move down"
                    aria-label={`Move ${component.name || itemNounSingular} down`}
                    disabled={index === components.length - 1}
                    onClick={() => handlers.onMoveDown(component.component_id)}
                    className={controlButtonClass}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    title="Duplicate"
                    onClick={() => handlers.onDuplicate(component.component_id)}
                    className={controlButtonClass}
                  >
                    Duplicate
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handlers.onRemove(component.component_id)}
                  className="rounded-full px-2 py-0.5 text-xs font-semibold text-white/55 transition-colors hover:bg-red-500/15 hover:text-red-200"
                >
                  Remove
                </button>
              </div>

              {recipeRef && (
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100/90">
                    Recipe reference
                  </span>
                  {component.display_snapshot?.serving_label && (
                    <span className="truncate text-[11px] text-white/45">
                      {component.display_snapshot.serving_label}
                    </span>
                  )}
                </div>
              )}

              <input
                type="text"
                value={component.name}
                onChange={(e) => handlers.onUpdateName(component.component_id, e.target.value)}
                placeholder="Name"
                className={`${inputClass} mb-2`}
                readOnly={recipeRef}
              />

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={component.quantity ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const qty = raw.trim() === '' ? null : Number(raw);
                    handlers.onUpdateQuantityUnit(
                      component.component_id,
                      Number.isFinite(qty) ? qty : null,
                      component.unit,
                    );
                  }}
                  placeholder="Qty"
                  className={inputClass}
                />
                <input
                  type="text"
                  value={component.unit ?? ''}
                  onChange={(e) =>
                    handlers.onUpdateQuantityUnit(
                      component.component_id,
                      component.quantity,
                      e.target.value || null,
                    )
                  }
                  placeholder="Unit"
                  className={inputClass}
                />
              </div>

              <input
                type="text"
                value={component.preparation_note ?? ''}
                onChange={(e) => handlers.onUpdatePrepNote(component.component_id, e.target.value)}
                placeholder="Prep note (e.g. diced)"
                className={`${inputClass} mt-2`}
              />

              {!recipeRef && (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-black/15 px-2.5 py-1.5">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs antialiased">
                    {grounded ? (
                      <>
                        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                        <span className="truncate text-white/55">Matched to a food</span>
                      </>
                    ) : (
                      <>
                        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                        <span className="truncate text-amber-200/80">Not matched to a food</span>
                      </>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {grounded && (
                      <button
                        type="button"
                        onClick={() => handlers.onClearGrounding(component.component_id)}
                        className="rounded-full px-2.5 py-1 text-xs font-semibold text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white"
                      >
                        Clear match
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setSearchOpenFor((prev) =>
                          prev === component.component_id ? null : component.component_id,
                        )
                      }
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                        grounded
                          ? 'text-white/65 hover:bg-white/[0.08] hover:text-white'
                          : 'bg-amber-500/20 text-amber-100 hover:bg-amber-500/30'
                      }`}
                    >
                      {searchOpenFor === component.component_id
                        ? 'Close'
                        : grounded
                          ? 'Change match'
                          : 'Resolve food'}
                    </button>
                  </span>
                </div>
              )}

              {recipeRef && (
                <div className="mt-2 rounded-lg border border-white/[0.07] bg-black/15 px-2.5 py-1.5 text-xs text-white/55">
                  {component.nutrition_snapshot?.status === 'unavailable'
                    ? 'Recipe nutrition unavailable — portion kept; review later.'
                    : component.nutrition_snapshot?.status === 'estimated'
                      ? 'Using estimated recipe nutrition snapshot.'
                      : 'Using saved recipe nutrition snapshot.'}
                  {component.recipe_version_token && (
                    <span className="ml-1 text-white/35">({component.recipe_version_token})</span>
                  )}
                </div>
              )}

              {searchOpenFor === component.component_id && !recipeRef && (
                <MealComponentFoodSearch
                  initialQuery={component.name}
                  onSelect={(selection) => {
                    handlers.onApplySelection(component.component_id, selection);
                    setSearchOpenFor(null);
                  }}
                  onCancel={() => setSearchOpenFor(null)}
                />
              )}

              {component.needs_review && (
                <p className="mt-2 text-[11px] text-amber-200/80 antialiased">
                  {recipeRef
                    ? 'Needs review — recipe nutrition is incomplete.'
                    : 'Needs review — match a food or fix quantity/unit.'}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handlers.onAddBlank}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add {itemNounSingular}
        </button>
        <button
          type="button"
          onClick={() => setSearchOpenFor((prev) => (prev === 'add' ? null : 'add'))}
          className="text-xs font-semibold text-denim-200 hover:text-denim-100"
        >
          {searchOpenFor === 'add' ? 'Close search' : `Search & add ${itemNounSingular}`}
        </button>
        {allowRecipeReferences && handlers.onAddFromRecipe && (
          <button
            type="button"
            onClick={() =>
              setSearchOpenFor((prev) => (prev === 'add-recipe' ? null : 'add-recipe'))
            }
            className="text-xs font-semibold text-emerald-200/90 hover:text-emerald-100"
          >
            {searchOpenFor === 'add-recipe' ? 'Close recipes' : 'Add saved Recipe'}
          </button>
        )}
      </div>

      {searchOpenFor === 'add' && (
        <MealComponentFoodSearch
          initialQuery=""
          onSelect={(selection) => {
            handlers.onAddFromSelection(selection);
            setSearchOpenFor(null);
          }}
          onCancel={() => setSearchOpenFor(null)}
        />
      )}

      {searchOpenFor === 'add-recipe' && handlers.onAddFromRecipe && (
        <MealComposerRecipeSearch
          excludeDocumentId={hostDocumentId}
          onSelect={(recipe) => {
            handlers.onAddFromRecipe?.(recipe);
            setSearchOpenFor(null);
          }}
          onCancel={() => setSearchOpenFor(null)}
        />
      )}
    </div>
  );
}
