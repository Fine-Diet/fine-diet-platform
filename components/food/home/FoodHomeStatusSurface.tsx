'use client';

import Link from 'next/link';

import { FoodHomeViewSwitcher } from './FoodHomeViewSwitcher';
import { RecipeEntryMenu, type RecipeEntryAction } from './RecipeEntryMenu';
import { StackedPageHero, StackedPageSection } from '@/components/layout/StackedPageSection';
import {
  buildEssentialsCardContent,
  buildNextHaulCardContent,
  type FoodHomeLoadState,
} from '@/lib/food/home/status';
import type { GroceryHaulCollectionItem } from '@/lib/plans/types';

function StatusCard({
  title,
  value,
  context,
  href,
  action,
  loading = false,
}: {
  title: string;
  value?: string;
  context?: string;
  href: string;
  action: string;
  loading?: boolean;
}) {
  return (
    <section className="flex flex-col items-center justify-between rounded-[18px] border border-white/20 px-6 py-6 text-center">
      <h2 className="text-2xl font-semibold text-brand-50">{title}</h2>
      {loading ? (
        <div className="my-1 h-7 w-20 animate-pulse rounded-full bg-white/[0.06]" />
      ) : (
        <div className="my-1 min-h-7">
          {value && (
            <p className="text-[2.5rem] font-normal leading-none text-white/50 sm:text-[2.75rem]">
              {value}
            </p>
          )}
          {context && <p className="mt-1 text-[11px] text-white/35">{context}</p>}
        </div>
      )}
      <Link
        href={href}
        aria-disabled={loading}
        tabIndex={loading ? -1 : undefined}
        className={`inline-flex w-full items-center justify-center rounded-full border border-white/45 px-4 py-2 text-xl font-semibold text-brand-50 transition-colors hover:bg-white/[0.06] ${
          loading ? 'pointer-events-none opacity-40' : ''
        }`}
      >
        {action}
      </Link>
    </section>
  );
}

export function FoodHomeStatusSurface({
  loadState,
  pantryLoadState,
  pantryOnHandCount,
  haul,
  hasBuildableList,
  hasActiveList,
  todayKey,
  onRetry,
  onRecipeAction,
}: {
  loadState: FoodHomeLoadState;
  pantryLoadState: FoodHomeLoadState;
  pantryOnHandCount: number;
  haul: GroceryHaulCollectionItem | null;
  hasBuildableList: boolean;
  hasActiveList: boolean;
  todayKey: string;
  onRetry: () => void;
  onRecipeAction: (action: RecipeEntryAction) => void;
}) {
  const essentials = buildEssentialsCardContent({ pantryLoadState, pantryOnHandCount });
  const nextHaul = buildNextHaulCardContent({
    loadState,
    haul,
    hasBuildableList,
    hasActiveList,
    todayKey,
  });

  return (
    <>
      <StackedPageHero className="flex min-h-[90vh] items-center bg-gradient-to-b from-[#342b20] via-[#211b14] to-[#17120e] px-6 sm:px-12">
        <div className="mx-auto w-full max-w-[950px] text-center">
          <FoodHomeViewSwitcher currentView="overview" className="text-brand-50" />
          <h1 className="mx-auto mt-1 max-w-md text-[2.5rem] font-normal leading-[1] text-brand-50 sm:text-[2.75rem]">
            Remain prepared for what&apos;s next
          </h1>
          <p className="mt-3 text-sm font-normal text-white/30">
            Know what&apos;s on hand, what&apos;s needed, and what comes next.
          </p>

          <div className="mx-auto mt-4 grid w-full max-w-[950px] gap-3 sm:grid-cols-2">
            <StatusCard title="Essentials" {...essentials} />
            <StatusCard title="Your Next Haul" {...nextHaul} />
          </div>

          {loadState === 'error' && (
            <p className="mt-3 text-xs text-white/35">
              Haul status could not be refreshed.{' '}
              <button type="button" onClick={onRetry} className="underline hover:text-white/65">
                Try again
              </button>
            </p>
          )}
        </div>
      </StackedPageHero>

      <StackedPageSection
        layer={1}
        className="min-h-[280px] bg-[#2a231b] px-6 pb-32 pt-14 sm:px-12 sm:pt-14"
        contentClassName="max-w-[950px]"
      >
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-brand-50">Recipes</h2>
          <p className="mt-1 text-4xl font-normal leading-tight text-white/85">
            Add recipes from links, text or scratch.
          </p>
          <RecipeEntryMenu onAction={onRecipeAction} />
        </div>
      </StackedPageSection>
    </>
  );
}
