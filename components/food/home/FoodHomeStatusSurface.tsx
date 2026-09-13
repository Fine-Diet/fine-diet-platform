'use client';

import Link from 'next/link';

import { RecipeEntryMenu, type RecipeEntryAction } from './RecipeEntryMenu';
import { StackedPageHero, StackedPageSection } from '@/components/layout/StackedPageSection';
import { formatFoodHomeHaulTiming } from '@/lib/food/home/status';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import type { GroceryHaulCollectionItem } from '@/lib/plans/types';

type LoadState = 'loading' | 'ready' | 'error';

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
    <section className="flex min-h-[118px] flex-col items-center justify-between rounded-[18px] border border-white/20 px-5 py-3.5 text-center">
      <h2 className="text-sm font-semibold text-brand-50">{title}</h2>
      {loading ? (
        <div className="my-1 h-7 w-20 animate-pulse rounded-full bg-white/[0.06]" />
      ) : (
        <div className="my-1 min-h-7">
          {value && <p className="text-[28px] font-light leading-none text-white/45">{value}</p>}
          {context && <p className="mt-1 text-[11px] text-white/35">{context}</p>}
        </div>
      )}
      <Link
        href={href}
        aria-disabled={loading}
        tabIndex={loading ? -1 : undefined}
        className={`inline-flex min-h-7 w-full items-center justify-center rounded-full border border-white/45 px-4 text-xs font-medium text-brand-50 transition-colors hover:bg-white/[0.06] ${
          loading ? 'pointer-events-none opacity-40' : ''
        }`}
      >
        {action}
      </Link>
    </section>
  );
}

function nextHaulCard(args: {
  loadState: LoadState;
  haul: GroceryHaulCollectionItem | null;
  hasBuildableList: boolean;
  todayKey: string;
}) {
  if (args.loadState === 'loading') {
    return {
      href: APP_ROUTES.foodLists,
      action: 'Review Lists',
      loading: true,
    };
  }
  if (args.haul) {
    return {
      value: formatFoodHomeHaulTiming(args.haul.shopping_date, args.todayKey),
      context: args.haul.status === 'active' ? 'Shopping in progress' : 'Draft preparation',
      href: args.haul.status === 'active'
        ? APP_ROUTE_BUILDERS.foodHaulShop(args.haul.id)
        : APP_ROUTE_BUILDERS.foodHaul(args.haul.id),
      action: 'Continue Haul',
      loading: false,
    };
  }
  if (args.loadState === 'ready' && args.hasBuildableList) {
    return {
      value: 'Lists ready',
      context: 'Choose sources in Hauls',
      href: APP_ROUTES.foodHauls,
      action: 'Build a Haul',
      loading: false,
    };
  }
  return {
    value: 'Plan ahead',
    context: args.loadState === 'error' ? 'Status unavailable' : 'Prepare a List first',
    href: APP_ROUTES.foodLists,
    action: 'Review Lists',
    loading: false,
  };
}

export function FoodHomeStatusSurface({
  loadState,
  haul,
  hasBuildableList,
  todayKey,
  onRetry,
  onRecipeAction,
}: {
  loadState: LoadState;
  haul: GroceryHaulCollectionItem | null;
  hasBuildableList: boolean;
  todayKey: string;
  onRetry: () => void;
  onRecipeAction: (action: RecipeEntryAction) => void;
}) {
  const nextHaul = nextHaulCard({ loadState, haul, hasBuildableList, todayKey });

  return (
    <>
      <StackedPageHero className="flex min-h-[430px] items-start bg-gradient-to-b from-[#342b20] via-[#211b14] to-[#17120e] px-6 pb-20 pt-20 sm:px-12 sm:pt-20">
        <div className="mx-auto w-full max-w-[650px] text-center">
          <p className="text-lg font-semibold text-brand-50">Food</p>
          <h1 className="mx-auto mt-1 max-w-md text-3xl font-light leading-[0.95] tracking-tight text-brand-50 sm:text-4xl">
            Remain prepared for
            <br />
            What&apos;s next
          </h1>
          <p className="mt-3 text-xs text-white/30">
            Add meal windows in your profile so Plans can guide today.
          </p>

          <div className="mx-auto mt-4 grid max-w-[404px] gap-3 sm:grid-cols-2">
            <StatusCard
              title="Essentials Ready"
              href={APP_ROUTES.foodPantry}
              action="Open Pantry"
            />
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
      >
        <div className="text-center">
          <h2 className="text-xl font-semibold text-brand-50">Recipes</h2>
          <p className="mt-1 text-2xl font-light leading-tight text-white/85 sm:text-[27px]">
            Add recipes from links, text or scratch.
          </p>
          <RecipeEntryMenu onAction={onRecipeAction} />
        </div>
      </StackedPageSection>
    </>
  );
}
