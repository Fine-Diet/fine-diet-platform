'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';

import {
  FoodHomeStatusSurface,
} from '@/components/food/home/FoodHomeStatusSurface';
import type { RecipeEntryAction } from '@/components/food/home/RecipeEntryMenu';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { CreateMealDocumentPanel } from '@/components/meals/CreateMealDocumentPanel';
import {
  hasBuildableFoodHomeList,
  selectNextFoodHomeHaul,
} from '@/lib/food/home/status';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { planService } from '@/lib/plans/planService';
import type { GroceryHaulCollectionItem } from '@/lib/plans/types';

type LoadState = 'loading' | 'ready' | 'error';

function localTodayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function previewHaul(shoppingDate: string): GroceryHaulCollectionItem {
  return {
    id: 'food-home-preview-haul',
    source_grocery_list_id: 'food-home-preview-list',
    source_list_name: 'Weekly List',
    source_list_names: ['Weekly List'],
    title: 'Weekly Haul',
    shopping_date: shoppingDate,
    status: 'planned',
    item_count: 4,
    execution_item_count: 4,
    unpriced_item_count: 0,
    estimated_total: 0,
    currency: 'USD',
    budget_amount: null,
    store_names: [],
    created_at: `${shoppingDate}T12:00:00.000Z`,
    updated_at: `${shoppingDate}T12:00:00.000Z`,
  };
}

export function FoodHomeView({
  preferFixtures = false,
}: {
  /** Development-only preview; canonical /app/food always uses live reads. */
  preferFixtures?: boolean;
} = {}) {
  const router = useRouter();
  const todayKey = localTodayKey();
  const [loadState, setLoadState] = useState<LoadState>(
    preferFixtures ? 'ready' : 'loading',
  );
  const [hauls, setHauls] = useState<GroceryHaulCollectionItem[]>(
    preferFixtures ? [previewHaul(todayKey)] : [],
  );
  const [hasBuildableList, setHasBuildableList] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  const load = useCallback(async () => {
    if (preferFixtures) return;
    setLoadState('loading');
    try {
      const [haulRows, overview] = await Promise.all([
        planService.listGroceryHauls(),
        planService.getGroceryListsOverview(),
      ]);
      const activeLists = [overview.default_list, ...overview.named_lists].filter(
        (list) => Boolean(list && list.status === 'active' && !list.archived_at),
      );
      setHauls(haulRows);
      setHasBuildableList(
        hasBuildableFoodHomeList(activeLists, overview.persistent_list_summaries),
      );
      setLoadState('ready');
    } catch {
      setHauls([]);
      setHasBuildableList(false);
      setLoadState('error');
    }
  }, [preferFixtures]);

  useEffect(() => {
    void load();
  }, [load]);

  const nextHaul = useMemo(
    () => selectNextFoodHomeHaul(hauls, todayKey),
    [hauls, todayKey],
  );

  const handleRecipeAction = useCallback(
    (action: RecipeEntryAction) => {
      if (action === 'manual') {
        setComposerOpen(true);
        return;
      }
      const mode = action === 'text' ? 'text' : 'url';
      void router.push(
        `${APP_ROUTES.planImportNew}?mode=${mode}&returnTo=${encodeURIComponent(APP_ROUTES.food)}`,
      );
    },
    [router],
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#16110d] text-white">
      <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-24">
        <FoodHomeStatusSurface
          loadState={loadState}
          haul={nextHaul}
          hasBuildableList={hasBuildableList}
          todayKey={todayKey}
          onRetry={() => void load()}
          onRecipeAction={handleRecipeAction}
        />
      </main>

      <JournalFooterNav />

      {composerOpen && (
        <CreateMealDocumentPanel
          initialKind="recipe"
          onClose={() => setComposerOpen(false)}
        />
      )}
    </div>
  );
}
