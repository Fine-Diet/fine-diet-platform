'use client';

/**
 * Food Home presentation composition.
 *
 * Canonical /app/food loads authenticated live plan + grocery adapters.
 * Fixtures remain on /dev/food-home via preferFixtures / ?fixture=.
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
  buildLiveFoodHomeViewModel,
  mapEmptyReasonToReadyAnytimeStatus,
} from '@/lib/food/home/adapters';
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
  RecipePickerSheetStatus,
  RecipeUploadAcceptedFile,
  SavedRecipePickerItem,
} from '@/lib/food/home/types';
import { selectCurrentPlan } from '@/lib/plans/currentPlan';
import { planService } from '@/lib/plans/planService';
import type { GroceryItem, PantryReadinessSummary, Plan } from '@/lib/plans/types';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import type { MealDocumentKind } from '@/lib/meals/types';

type ComposerKind = MealDocumentKind | null;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function resolveFixtureModel(
  fixtureQuery: unknown,
  preferFixtures: boolean,
): FoodHomeViewModel | null {
  if (!foodHomeFixturesAllowed()) return null;
  const fixtureId = parseFoodHomeFixtureId(fixtureQuery);
  if (fixtureId) return getFoodHomeFixture(fixtureId);
  if (preferFixtures) return getFoodHomeFixture('populated');
  return null;
}

function clearActionQueryParam() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('action')) return;
  url.searchParams.delete('action');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export function FoodHomeView({
  preferFixtures = false,
}: {
  /** Dev preview may force fixtures without ?fixture=. Canonical /app/food must not. */
  preferFixtures?: boolean;
} = {}) {
  const router = useRouter();
  const fixtureModel = useMemo(
    () => resolveFixtureModel(router.query.fixture, preferFixtures),
    [router.query.fixture, preferFixtures],
  );
  const isLive = fixtureModel === null;

  const [composerKind, setComposerKind] = useState<ComposerKind>(null);
  const [recipePickerOpen, setRecipePickerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [pickerRecipes, setPickerRecipes] = useState<SavedRecipePickerItem[]>([]);
  const [pickerStatus, setPickerStatus] = useState<RecipePickerSheetStatus>('loading');

  const [livePlan, setLivePlan] = useState<Plan | null>(null);
  const [liveReadiness, setLiveReadiness] = useState<PantryReadinessSummary | null>(
    null,
  );
  const [liveItems, setLiveItems] = useState<GroceryItem[]>([]);
  const [liveListId, setLiveListId] = useState<string | null>(null);
  const [liveListLabel, setLiveListLabel] = useState('My Grocery List');
  const [liveLoadState, setLiveLoadState] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [liveError, setLiveError] = useState<string | undefined>(undefined);

  const reloadLive = useCallback(async () => {
    setLiveLoadState('loading');
    setLiveError(undefined);
    try {
      const [plans, readiness, overview] = await Promise.all([
        planService.list(),
        planService.getPantryReadiness().catch(() => null),
        planService.getGroceryListsOverview().catch(() => null),
      ]);
      const plan = selectCurrentPlan(plans);
      setLivePlan(plan);
      setLiveReadiness(readiness);

      const defaultList = overview?.default_list ?? null;
      setLiveListId(defaultList?.id ?? null);
      setLiveListLabel(defaultList?.title?.trim() || 'My Grocery List');

      if (defaultList?.id) {
        const detail = await planService.getPersistentGroceryList(defaultList.id);
        setLiveItems(detail.items);
      } else {
        setLiveItems([]);
      }
      setLiveLoadState('ready');
    } catch (err) {
      setLiveError(
        err instanceof Error ? err.message : 'Could not load Food Home.',
      );
      setLiveLoadState('error');
    }
  }, []);

  useEffect(() => {
    if (!isLive || !router.isReady) return;
    void reloadLive();
  }, [isLive, router.isReady, reloadLive]);

  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.action === 'start-from-recipe') {
      setRecipePickerOpen(true);
    }
  }, [router.isReady, router.query.action]);

  useEffect(() => {
    if (!recipePickerOpen || !isLive) return;
    let cancelled = false;
    setPickerStatus('loading');
    (async () => {
      try {
        const res = await fetch(
          '/api/journal/meals/documents/search?mode=recipes&limit=20',
          { credentials: 'include' },
        );
        if (!res.ok) throw new Error('search failed');
        const body = (await res.json()) as {
          results?: Array<{
            id: string;
            title: string;
            description?: string | null;
            review_state?: string;
          }>;
        };
        if (cancelled) return;
        const mapped: SavedRecipePickerItem[] = (body.results ?? []).map((doc) => ({
          id: doc.id,
          title: doc.title,
          subtitle:
            doc.description?.trim() ||
            (doc.review_state ? `Recipe · ${doc.review_state}` : 'Saved recipe'),
          available: true,
        }));
        setPickerRecipes(mapped);
        setPickerStatus(mapped.length === 0 ? 'empty' : 'ready');
      } catch {
        if (cancelled) return;
        setPickerRecipes([]);
        setPickerStatus('unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recipePickerOpen, isLive]);

  const viewModel = useMemo((): FoodHomeViewModel => {
    if (fixtureModel) return fixtureModel;
    return buildLiveFoodHomeViewModel({
      plan: livePlan,
      readiness: liveReadiness,
      groceryListLabel: liveListLabel,
      groceryItems: liveItems,
      startDate: todayKey(),
      endDate: todayKey(),
      loading: liveLoadState === 'loading',
      errorMessage: liveLoadState === 'error' ? liveError : undefined,
    });
  }, [
    fixtureModel,
    livePlan,
    liveReadiness,
    liveListLabel,
    liveItems,
    liveLoadState,
    liveError,
  ]);

  const handleAddToGroceryList = useCallback<AddToGroceryListHandler>(
    async (demandKeys) => {
      if (!isLive) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
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
      }

      // Live Food Readiness currently surfaces on-list rows only. Adding
      // not-yet-listed demand requires a dedicated demand-preview endpoint.
      return {
        ok: false,
        errorMessage:
          demandKeys.length === 0
            ? 'Nothing selected to add.'
            : 'Selected requirements are already on your grocery list. Use Make List to refresh from your plan.',
      };
    },
    [isLive],
  );

  const handleMakeList = useCallback<MakeListHandler>(
    async ({ startDate, endDate }) => {
      if (!isLive) {
        await new Promise((resolve) => window.setTimeout(resolve, 700));
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
      }

      if (startDate > endDate) {
        return {
          ok: false,
          status: 'invalid_range',
          message: 'Start date cannot be after end date.',
        };
      }
      if (!livePlan) {
        return {
          ok: false,
          status: 'no_active_plan',
          message: 'Activate a plan to generate a grocery list from planned meals.',
        };
      }

      try {
        const result = await planService.reconcilePlanGroceryList({
          plan_id: livePlan.id,
          date: startDate,
          date_end: endDate,
          target_list_id: liveListId ?? undefined,
        });

        if (result.empty_reason) {
          const status = mapEmptyReasonToReadyAnytimeStatus(result.empty_reason);
          return {
            ok: false,
            status,
            message:
              status === 'no_meals_in_range'
                ? 'Nothing is planned in this range.'
                : 'Could not prepare this grocery list.',
            listId: result.target_list.id,
          };
        }

        await reloadLive();
        return {
          ok: true,
          listId: result.target_list.id,
          message: `List ready on ${result.target_list.title?.trim() || 'My Grocery List'}.`,
        };
      } catch (err) {
        return {
          ok: false,
          status: 'error',
          errorMessage:
            err instanceof Error
              ? err.message
              : 'Could not prepare this grocery list. Try again.',
        };
      }
    },
    [isLive, liveListId, livePlan, reloadLive, viewModel.fixtureId, viewModel.readyAnytime],
  );

  const handleUploadSubmit = useCallback(
    async (_file: RecipeUploadAcceptedFile) => {
      if (!isLive) {
        setUploadNotice(
          `Held “${_file.name}” locally. Import processing attaches here later.`,
        );
        return;
      }
      // Honest unsupported path — do not fake a successful upload.
      setUploadOpen(false);
      setUploadNotice(
        'Image/PDF recipe upload is not available yet. Paste a recipe or import from a URL instead.',
      );
    },
    [isLive],
  );

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
          if (isLive) {
            setUploadNotice(
              'Image/PDF recipe upload is not available yet. Paste a recipe or import from a URL instead.',
            );
            return;
          }
          setUploadOpen(true);
          return;
        default:
          return;
      }
    },
    [isLive, router],
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
        useFixtures={!isLive}
        recipes={isLive ? pickerRecipes : undefined}
        status={isLive ? pickerStatus : undefined}
      />

      <RecipeUploadSheet
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSubmit={handleUploadSubmit}
      />
    </div>
  );
}
