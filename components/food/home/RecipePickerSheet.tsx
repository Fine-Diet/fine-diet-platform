'use client';

import { useEffect, useId, useState } from 'react';

import { FOOD_HOME_RECIPE_PICKER_FIXTURES } from '@/lib/food/home/fixtures';
import type { RecipePickerSheetStatus, SavedRecipePickerItem } from '@/lib/food/home/types';
import { cn } from '@/lib/utils';

/**
 * Recipe picker for Food Home "start from recipe".
 * Fixtures are for /dev preview only — live callers must pass recipes/status.
 */
export function RecipePickerSheet({
  open,
  onClose,
  recipes,
  status: controlledStatus,
  useFixtures = false,
}: {
  open: boolean;
  onClose: () => void;
  recipes?: SavedRecipePickerItem[];
  status?: RecipePickerSheetStatus;
  /** Dev/fixture mode only. Canonical /app/food must leave this false. */
  useFixtures?: boolean;
}) {
  const titleId = useId();
  const resolvedRecipes = useFixtures
    ? (recipes ?? FOOD_HOME_RECIPE_PICKER_FIXTURES)
    : (recipes ?? []);
  const [status, setStatus] = useState<RecipePickerSheetStatus>(
    controlledStatus ?? (useFixtures ? 'loading' : 'loading'),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    if (controlledStatus) {
      setStatus(controlledStatus);
      return;
    }
    if (!useFixtures) {
      setStatus(resolvedRecipes.length === 0 ? 'empty' : 'ready');
      return;
    }
    setStatus('loading');
    const timer = window.setTimeout(() => {
      setStatus(resolvedRecipes.length === 0 ? 'empty' : 'ready');
    }, 450);
    return () => window.clearTimeout(timer);
  }, [open, controlledStatus, useFixtures, resolvedRecipes.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const selected = resolvedRecipes.find((recipe) => recipe.id === selectedId) ?? null;
  const canConfirm = Boolean(selected?.available) && useFixtures;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[28px] border border-white/30 bg-brand-900 p-5 shadow-large sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45 antialiased">
              Start from a recipe
            </p>
            <h2 id={titleId} className="mt-2 text-2xl font-semibold text-white antialiased">
              Choose a saved recipe
            </h2>
            <p className="mt-2 text-sm text-white/55 antialiased">
              {useFixtures
                ? 'Meal seeding from a recipe attaches later. This picker keeps the entry contract stable.'
                : 'Browse your saved recipes. Starting a meal from a recipe opens the meal composer when available.'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close recipe picker"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-white/50 hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="mt-5 space-y-2">
          {status === 'loading' && (
            <p className="rounded-2xl border border-white/10 bg-black/25 px-4 py-6 text-sm text-white/55">
              Loading saved recipes…
            </p>
          )}

          {status === 'empty' && (
            <p className="rounded-2xl border border-white/10 bg-black/25 px-4 py-6 text-sm text-white/55">
              No saved recipes yet. Create a recipe first, then start a meal from it here.
            </p>
          )}

          {status === 'unavailable' && (
            <p
              className="rounded-2xl border border-semantic-error/40 bg-black/25 px-4 py-6 text-sm text-semantic-error"
              role="alert"
            >
              Recipe picker is temporarily unavailable.
            </p>
          )}

          {status === 'ready' &&
            resolvedRecipes.map((recipe) => {
              const selectedState = selectedId === recipe.id;
              return (
                <button
                  key={recipe.id}
                  type="button"
                  disabled={!recipe.available}
                  onClick={() => setSelectedId(recipe.id)}
                  className={cn(
                    'flex w-full flex-col rounded-2xl border px-4 py-3 text-left transition-colors',
                    selectedState
                      ? 'border-denim-400/50 bg-black/35'
                      : 'border-white/15 bg-black/20 hover:bg-black/30',
                    !recipe.available && 'cursor-not-allowed opacity-45',
                  )}
                >
                  <span className="text-base font-semibold text-white antialiased">{recipe.title}</span>
                  <span className="mt-1 text-sm text-white/50 antialiased">{recipe.subtitle}</span>
                </button>
              );
            })}
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/25 px-5 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            title={
              useFixtures
                ? canConfirm
                  ? 'Meal seeding from recipe is not available yet'
                  : 'Select an available recipe'
                : 'Starting a meal from a recipe is not available yet. Create a meal from scratch instead.'
            }
            className="rounded-full bg-denim-500 px-5 py-2 text-sm font-semibold text-neutral-900 opacity-50 disabled:cursor-not-allowed"
          >
            {useFixtures ? 'Continue (coming soon)' : 'Continue unavailable'}
          </button>
        </div>
      </div>
    </div>
  );
}
