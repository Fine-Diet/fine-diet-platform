'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import {
  PlanLibraryBrowser,
  type PlanLibraryBrowserItem,
} from '@/components/journal/plans/PlanLibraryBrowser';
import { PlansViewSwitcher } from '@/components/journal/plans/PlansViewSwitcher';
import { countPatternMeals, countTemplateMeals } from '@/lib/plans/reusableAuthoringHelpers';
import { UNNAMED_DAY_PLAN } from '@/lib/plans/dayPlanDraftStore';
import { planService, type PlanDayTemplate, type PlanWeekPattern } from '@/lib/plans';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';

const UNNAMED_WEEK_PLAN = 'Unnamed Week Plan';
const UNNAMED_MEAL = 'Unnamed Meal';

type SectionState = 'loading' | 'ready' | 'error';

interface MealLibraryRow {
  id: string;
  title: string;
  description: string | null;
  updated_at: string | null;
  document_kind: string;
}

function displayName(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function PlansLibraryView() {
  const router = useRouter();
  const [meals, setMeals] = useState<MealLibraryRow[]>([]);
  const [dayPlans, setDayPlans] = useState<PlanDayTemplate[]>([]);
  const [weekPlans, setWeekPlans] = useState<PlanWeekPattern[]>([]);
  const [mealsState, setMealsState] = useState<SectionState>('loading');
  const [dayState, setDayState] = useState<SectionState>('loading');
  const [weekState, setWeekState] = useState<SectionState>('loading');
  const [mealQuery, setMealQuery] = useState('');
  const [dayQuery, setDayQuery] = useState('');
  const [weekQuery, setWeekQuery] = useState('');

  const load = useCallback(async () => {
    setMealsState('loading');
    setDayState('loading');
    setWeekState('loading');

    const mealsRequest = fetch('/api/journal/meals/documents/search?mode=meals&limit=50', {
      credentials: 'include',
    }).then(async (response) => {
      if (!response.ok) throw new Error('Could not load meals.');
      const body = (await response.json()) as { results?: MealLibraryRow[] };
      const rows = Array.isArray(body.results) ? body.results : [];
      return rows.filter((row) => row.document_kind !== 'recipe');
    });

    const dayRequest = planService.listPlanDayTemplates();
    const weekRequest = planService.listPlanWeekPatterns();

    const [mealsResult, dayResult, weekResult] = await Promise.allSettled([
      mealsRequest,
      dayRequest,
      weekRequest,
    ]);

    if (mealsResult.status === 'fulfilled') {
      setMeals(mealsResult.value);
      setMealsState('ready');
    } else {
      setMeals([]);
      setMealsState('error');
    }

    if (dayResult.status === 'fulfilled') {
      setDayPlans(dayResult.value);
      setDayState('ready');
    } else {
      setDayPlans([]);
      setDayState('error');
    }

    if (weekResult.status === 'fulfilled') {
      setWeekPlans(weekResult.value);
      setWeekState('ready');
    } else {
      setWeekPlans([]);
      setWeekState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mealItems: PlanLibraryBrowserItem[] = meals.map((meal) => ({
    id: meal.id,
    title: displayName(meal.title, UNNAMED_MEAL),
    description: meal.description,
    metadata: 'Meal',
    updatedAt: meal.updated_at ?? '',
    onSelect: () => {
      void router.push(`${APP_ROUTES.foodMeals}?document=${encodeURIComponent(meal.id)}`);
    },
  }));

  const dayItems: PlanLibraryBrowserItem[] = dayPlans.map((template) => ({
    id: template.id,
    title: displayName(template.name, UNNAMED_DAY_PLAN),
    description: template.description,
    metadata: `${template.slots?.length ?? 0} occasions · ${countTemplateMeals(template)} meals`,
    updatedAt: template.updated_at,
    onSelect: () => {
      void router.push(APP_ROUTE_BUILDERS.planDayTemplate(template.id));
    },
  }));

  const weekItems: PlanLibraryBrowserItem[] = weekPlans.map((pattern) => ({
    id: pattern.id,
    title: displayName(pattern.name, UNNAMED_WEEK_PLAN),
    description: pattern.description,
    metadata: `${pattern.days?.length ?? 0} days · ${countPatternMeals(pattern)} meals`,
    updatedAt: pattern.updated_at,
    onSelect: () => {
      void router.push(APP_ROUTE_BUILDERS.planWeekPattern(pattern.id));
    },
  }));

  return (
    <div className="flex min-h-screen flex-col bg-[#16110d] text-white">
      <main className="flex-1 overflow-x-hidden bg-[#463c2f] pb-28">
        <div className="min-h-screen bg-gradient-to-b from-[#17130f] via-brand-900 to-[#463c2f]">
          <div className="mx-auto w-full max-w-[950px] px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
            <header className="mb-8">
              <PlansViewSwitcher currentView="library" />
              <h1 className="mt-5 text-4xl font-regular tracking-tight sm:text-5xl">Plans Library</h1>
              <p className="mt-3 max-w-lg text-sm leading-6 text-white/55">
                Meals, Day Plans, and Week Plans live here. Recipes stay in Food.
              </p>
            </header>

            <LibrarySection
              id="plans-library-meals"
              title="Meals"
              state={mealsState}
              errorMessage="Meals could not be loaded."
              emptyMessage="No meals yet."
              items={mealItems}
              query={mealQuery}
              onQueryChange={setMealQuery}
              searchPlaceholder="Search meals"
            />
            <LibrarySection
              id="plans-library-day-plans"
              title="Day Plans"
              state={dayState}
              errorMessage="Day Plans could not be loaded."
              emptyMessage="No day plans yet."
              items={dayItems}
              query={dayQuery}
              onQueryChange={setDayQuery}
              searchPlaceholder="Search day plans"
            />
            <LibrarySection
              id="plans-library-week-plans"
              title="Week Plans"
              state={weekState}
              errorMessage="Week Plans could not be loaded."
              emptyMessage="No week plans yet."
              items={weekItems}
              query={weekQuery}
              onQueryChange={setWeekQuery}
              searchPlaceholder="Search week plans"
            />
          </div>
        </div>
      </main>
      <JournalFooterNav />
    </div>
  );
}

function LibrarySection({
  id,
  title,
  state,
  errorMessage,
  emptyMessage,
  items,
  query,
  onQueryChange,
  searchPlaceholder,
}: {
  id: string;
  title: string;
  state: SectionState;
  errorMessage: string;
  emptyMessage: string;
  items: PlanLibraryBrowserItem[];
  query: string;
  onQueryChange: (value: string) => void;
  searchPlaceholder: string;
}) {
  return (
    <section aria-labelledby={id} className="border-t border-white/15 py-8">
      <h2 id={id} className="mb-4 text-2xl font-regular tracking-tight">
        {title}
      </h2>
      {state === 'error' ? (
        <p className="text-sm text-red-200">{errorMessage}</p>
      ) : (
        <PlanLibraryBrowser
          query={query}
          onQueryChange={onQueryChange}
          items={state === 'ready' ? items : []}
          emptyMessage={state === 'loading' ? 'Loading…' : emptyMessage}
          searchPlaceholder={searchPlaceholder}
          busy={state === 'loading'}
        />
      )}
    </section>
  );
}
