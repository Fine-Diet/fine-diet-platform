'use client';

/**
 * Main App Home presentation composition for canonical /app.
 *
 * Welcome + NDS + Today's Rhythm + Programs continuation + Food readiness.
 * Programs primary slide reuses Programs Home hero resolver.
 * Welcome CTA and Rhythm highlight share resolveNextMeal().
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';

import {
  FoodReadinessCard,
  ProgramsContinuationCard,
} from '@/components/app/home/HomeContinuationCards';
import { NutritionDensityRail } from '@/components/app/home/NutritionDensityRail';
import { TodaysRhythmModule } from '@/components/app/home/TodaysRhythmModule';
import { WelcomeZone } from '@/components/app/home/WelcomeZone';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import {
  buildFoodViewModel,
  buildNdsViewModel,
  buildProgramsViewModelFromRuntime,
  buildRhythmViewModel,
  buildWelcomeViewModel,
} from '@/lib/app/home/adapters';
import {
  appHomeFixturesAllowed,
  getAppHomeFixture,
  parseAppHomeFixtureId,
} from '@/lib/app/home/fixtures';
import { resolveNextMeal } from '@/lib/app/home/nextMealResolver';
import type { AppHomeViewModel } from '@/lib/app/home/types';
import { journalService, toDateKey, type JournalEntry } from '@/lib/journal';
import { getEnabledMealSlots } from '@/lib/journal/mealScheduleAssignment';
import { useNDS } from '@/lib/nds/useNDS';
import { normalizeMealSchedule } from '@/lib/plans/scheduleResolver';
import type { MealSchedule } from '@/lib/plans/types';
import { usePantryReadiness } from '@/lib/plans/usePantryReadiness';
import { hasBaselineAccessFromLibrary } from '@/lib/programs/home/adapters';
import type { ProgramLibrary } from '@/lib/programs/programLibraryServerService';
import type {
  ProgramRuntimeSummary,
  ProgramRuntimeSummaryList,
} from '@/lib/programs/runtimeTypes';

const BASELINE_SLUG = 'baseline';

function todayLocalKey(): string {
  return toDateKey(new Date());
}

export function AppHomeView({
  hideFooter = false,
  preferFixtures = false,
}: {
  hideFooter?: boolean;
  preferFixtures?: boolean;
}) {
  const router = useRouter();
  const fixtureId = parseAppHomeFixtureId(router.query.fixture);
  const useFixtures =
    (Boolean(fixtureId) || preferFixtures) && appHomeFixturesAllowed();

  const fixtureModel = useMemo(() => {
    if (!useFixtures) return null;
    return getAppHomeFixture(fixtureId ?? 'default');
  }, [useFixtures, fixtureId]);

  const [firstName, setFirstName] = useState<string | null>(null);
  const [slots, setSlots] = useState<ReturnType<typeof getEnabledMealSlots>>([]);
  const [todayEntries, setTodayEntries] = useState<JournalEntry[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [homeError, setHomeError] = useState(false);
  const [programsModel, setProgramsModel] = useState(() =>
    buildProgramsViewModelFromRuntime({
      hasAccess: false,
      summary: null,
      loading: true,
    }),
  );

  const nds = useNDS({
    dateLocal: todayLocalKey(),
    enabled: !useFixtures,
  });
  const pantry = usePantryReadiness();

  const loadLive = useCallback(async () => {
    setScheduleLoading(true);
    setEntriesLoading(true);
    setHomeError(false);
    try {
      const [entries, profileResp, runtimeResp, libraryResp] = await Promise.all([
        journalService.listEntriesByDay(new Date()),
        fetch('/api/journal/profile'),
        fetch('/api/journal/programs/runtime-summary'),
        fetch('/api/journal/programs/library'),
      ]);

      const todayDk = todayLocalKey();
      setTodayEntries(
        entries.filter((entry) => toDateKey(entry.timestamp) === todayDk),
      );

      if (profileResp.ok) {
        const body = await profileResp.json();
        const profile = body.profile ?? body;
        setFirstName(
          typeof profile?.first_name === 'string' ? profile.first_name : null,
        );
        const schedule = normalizeMealSchedule(
          profile?.meal_schedule as MealSchedule | undefined,
        );
        setSlots(getEnabledMealSlots(schedule));
      } else {
        setSlots([]);
      }

      if (runtimeResp.ok && libraryResp.ok) {
        const runtimeJson = (await runtimeResp.json()) as ProgramRuntimeSummaryList;
        const libraryJson = (await libraryResp.json()) as ProgramLibrary;
        const summary =
          runtimeJson.summaries.find(
            (entry: ProgramRuntimeSummary) =>
              entry.program.slug.toLowerCase() === BASELINE_SLUG,
          ) ?? null;
        const libraryEntry =
          libraryJson.entries.find(
            (entry) => entry.slug.toLowerCase() === BASELINE_SLUG,
          ) ?? null;
        const hasAccess =
          hasBaselineAccessFromLibrary(libraryEntry) || Boolean(summary);
        setProgramsModel(
          buildProgramsViewModelFromRuntime({ hasAccess, summary }),
        );
      } else {
        setProgramsModel(
          buildProgramsViewModelFromRuntime({
            hasAccess: false,
            summary: null,
            errorMessage: 'Programs state could not load.',
          }),
        );
      }
    } catch {
      setHomeError(true);
      setProgramsModel(
        buildProgramsViewModelFromRuntime({
          hasAccess: false,
          summary: null,
          errorMessage: 'Programs state could not load.',
        }),
      );
    } finally {
      setScheduleLoading(false);
      setEntriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (useFixtures) return;
    void loadLive();
  }, [useFixtures, loadLive]);

  const liveModel: AppHomeViewModel = useMemo(() => {
    const loading = scheduleLoading || entriesLoading;
    const outcome = loading
      ? null
      : resolveNextMeal({
          slots,
          todayEntries,
          now: new Date(),
          dateKey: todayLocalKey(),
        });

    return {
      fixtureId: 'live',
      welcome: buildWelcomeViewModel({
        firstName,
        outcome,
        loading,
        error: homeError,
      }),
      nds: buildNdsViewModel({
        data: nds.data,
        isLoading: nds.isLoading,
        error: Boolean(nds.error),
      }),
      rhythm: buildRhythmViewModel({
        outcome,
        loading,
        error: homeError,
        now: new Date(),
      }),
      programs: programsModel,
      food: buildFoodViewModel({
        state: pantry.state,
        summary: pantry.summary,
      }),
    };
  }, [
    scheduleLoading,
    entriesLoading,
    slots,
    todayEntries,
    firstName,
    homeError,
    nds.data,
    nds.isLoading,
    nds.error,
    programsModel,
    pantry.state,
    pantry.summary,
  ]);

  const model = fixtureModel ?? liveModel;

  return (
    <div className="min-h-screen bg-[#2a241b] text-white">
      <WelcomeZone welcome={model.welcome} />
      <NutritionDensityRail nds={model.nds} />
      <div
        className={
          hideFooter
            ? 'bg-[#2a241b] px-4 pb-10 pt-8 sm:px-5'
            : 'bg-[#2a241b] px-4 pb-[120px] pt-8 sm:px-5'
        }
      >
        <div className="mx-auto w-full max-w-[1000px]">
          <TodaysRhythmModule rhythm={model.rhythm} />
          <ProgramsContinuationCard programs={model.programs} />
          <FoodReadinessCard food={model.food} />
        </div>
      </div>
      {!hideFooter ? <JournalFooterNav /> : null}
    </div>
  );
}
