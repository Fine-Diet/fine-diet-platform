'use client';

/**
 * Food Home presentation composition.
 *
 * Modules render through typed view models. Non-production fixtures drive the
 * first visual review; live adapters can replace callbacks without redesign.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';

import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { CreateMealDocumentPanel } from '@/components/meals/CreateMealDocumentPanel';
import { BuildAheadModule } from '@/components/food/home/BuildAheadModule';
import { FoodReadinessModule } from '@/components/food/home/FoodReadinessModule';
import { ReadyAnytimeModule } from '@/components/food/home/ReadyAnytimeModule';
import { RecipePickerSheet } from '@/components/food/home/RecipePickerSheet';
import { RecipeUploadSheet } from '@/components/food/home/RecipeUploadSheet';
import type { AddNewActionId } from '@/components/food/home/AddNewMenu';
import {
  FOOD_HOME_DEMO_LIST_ID,
  foodHomeFixturesAllowed,
  getFoodHomeFixture,
  parseFoodHomeFixtureId,
} from '@/lib/food/home/fixtures';
import type {
  AddToGroceryListHandler,
  FoodHomeViewModel,
  MakeListHandler,
  RecipeUploadAcceptedFile,
} from '@/lib/food/home/types';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import type { MealDocumentKind } from '@/lib/meals/types';

type ComposerKind = MealDocumentKind | null;

function resolveViewModel(fixtureQuery: unknown): FoodHomeViewModel {
  if (!foodHomeFixturesAllowed()) {
    return {
      fixtureId: 'live',
      readiness: {
        status: 'no_planned_requirements',
        rows: [],
        groceryListLabel: 'My Grocery List',
      },
      readyAnytime: {
        status: 'idle',
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10),
        hasActivePlan: false,
        message: 'Activate a plan to generate a grocery list from planned meals.',
      },
    };
  }
  const fixtureId = parseFoodHomeFixtureId(fixtureQuery) ?? 'populated';
  return getFoodHomeFixture(fixtureId);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clearActionQueryParam() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('action')) return;
  url.searchParams.delete('action');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export function FoodHomeView() {
  const router = useRouter();
  const viewModel = useMemo(
    () => resolveViewModel(router.query.fixture),
    [router.query.fixture],
  );

  const [composerKind, setComposerKind] = useState<ComposerKind>(null);
  const [recipePickerOpen, setRecipePickerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.action === 'start-from-recipe') {
      setRecipePickerOpen(true);
    }
  }, [router.isReady, router.query.action]);

  const handleAddToGroceryList = useCallback<AddToGroceryListHandler>(async (demandKeys) => {
    await sleep(500);
    if (!foodHomeFixturesAllowed()) {
      return {
        ok: false,
        errorMessage: 'Live grocery handoff is not attached yet.',
      };
    }
    return {
      ok: true,
      listId: FOOD_HOME_DEMO_LIST_ID,
      addedCount: demandKeys.length,
    };
  }, []);

  const handleMakeList = useCallback<MakeListHandler>(
    async ({ startDate, endDate }) => {
      await sleep(700);
      if (!foodHomeFixturesAllowed()) {
        return {
          ok: false,
          status: 'error',
          errorMessage: 'Live Make List reconciliation is not attached yet.',
        };
      }
      if (startDate > endDate) {
        return {
          ok: false,
          status: 'invalid_range',
          message: 'Start date cannot be after end date.',
        };
      }
      if (
        viewModel.readyAnytime.status === 'no_active_plan' ||
        !viewModel.readyAnytime.hasActivePlan
      ) {
        return {
          ok: false,
          status: 'no_active_plan',
          message: 'Activate a plan to generate a grocery list from planned meals.',
        };
      }
      if (viewModel.fixtureId === 'ready_anytime_no_meals') {
        return {
          ok: false,
          status: 'no_meals_in_range',
          message: 'Nothing is planned in this range.',
        };
      }
      if (viewModel.fixtureId === 'error') {
        return {
          ok: false,
          status: 'error',
          errorMessage: 'Could not prepare this grocery list. Try again.',
        };
      }
      return {
        ok: true,
        listId: FOOD_HOME_DEMO_LIST_ID,
        message: 'List ready on My Grocery List.',
      };
    },
    [viewModel.fixtureId, viewModel.readyAnytime.hasActivePlan, viewModel.readyAnytime.status],
  );

  const handleUploadSubmit = useCallback(async (file: RecipeUploadAcceptedFile) => {
    // Stable callback boundary — no upload/parse/persist in this packet.
    setUploadNotice(`Held “${file.name}” locally. Import processing attaches here later.`);
  }, []);

  const handleAddNewAction = useCallback(
    (action: AddNewActionId) => {
      setUploadNotice(null);
      switch (action) {
        case 'meal-from-scratch':
          setComposerKind('meal');
          return;
        case 'meal-start-from-recipe': {
          const url = new URL(window.location.href);
          url.searchParams.set('action', 'start-from-recipe');
          window.history.replaceState({}, '', url.toString());
          setRecipePickerOpen(true);
          return;
        }
        case 'recipe-manual':
          setComposerKind('recipe');
          return;
        case 'recipe-paste':
          void router.push(
            `${APP_ROUTES.planImportNew}?mode=text&returnTo=${encodeURIComponent(APP_ROUTES.food)}`,
          );
          return;
        case 'recipe-url':
          void router.push(
            `${APP_ROUTES.planImportNew}?mode=url&returnTo=${encodeURIComponent(APP_ROUTES.food)}`,
          );
          return;
        case 'recipe-upload':
          setUploadOpen(true);
          return;
        default:
          return;
      }
    },
    [router],
  );

  return (
    <div className="min-h-screen bg-[#16110d] text-white flex flex-col">
      <main className="flex-1 overflow-x-hidden overflow-y-auto pb-28">
        <FoodReadinessModule
          model={viewModel.readiness}
          onAddToGroceryList={handleAddToGroceryList}
        />
        <BuildAheadModule onAction={handleAddNewAction} />
        <ReadyAnytimeModule model={viewModel.readyAnytime} onMakeList={handleMakeList} />
        {uploadNotice && (
          <div className="mx-auto w-full max-w-[650px] px-4 pb-4 sm:px-5">
            <p className="rounded-[16px] border border-white/15 bg-black/30 px-4 py-3 text-sm text-white/70">
              {uploadNotice}
            </p>
          </div>
        )}
      </main>

      <JournalFooterNav />

      {composerKind && (
        <CreateMealDocumentPanel
          initialKind={composerKind}
          onClose={() => setComposerKind(null)}
        />
      )}

      <RecipePickerSheet
        open={recipePickerOpen}
        onClose={() => {
          setRecipePickerOpen(false);
          clearActionQueryParam();
        }}
      />

      <RecipeUploadSheet
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSubmit={handleUploadSubmit}
      />
    </div>
  );
}
