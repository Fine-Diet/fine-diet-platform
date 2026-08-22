'use client';

import { Fragment, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import type { GetStaticProps } from 'next';
import { StackedPageSection } from '@/components/layout/StackedPageSection';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { JournalHeroSection } from '@/components/journal/JournalHeroSection';
import { JournalBlockSection } from '@/components/journal/JournalBlockSection';
import { DailySummary } from '@/components/journal/DailySummary';
import {
  toDateKey,
  parseLocalDate,
  journalService,
  calculateDailyTotals,
  type JournalEntry,
  type UserGoals,
} from '@/lib/journal';
import type { MealSchedule } from '@/lib/plans/types';
import { defaultMealSchedule, normalizeMealSchedule } from '@/lib/plans/scheduleResolver';
import {
  getEnabledMealSlots,
  getMealSlotForEntry,
} from '@/lib/journal/mealScheduleAssignment';
import { foodService, type FoodNutrientData } from '@/lib/food';
import { useNDS } from '@/lib/nds/useNDS';
import { useFeatureFlags } from '@/lib/hooks/useFeatureFlags';
import { useNutritionTargetsOverlay } from '@/components/nutrition/targets/NutritionTargetsOverlayProvider';
import {
  hasConfirmedCalorieTarget,
  deriveDailyGoalForDisplay,
  deriveMacroGoalForDisplay,
} from '@/lib/nutrition/targets/display';
import type { JournalPageContent } from '@/lib/contentTypes';
import { getJournalPageContent } from '@/lib/contentApi';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

function formatDateLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

  if (dateOnly.getTime() === todayOnly.getTime()) {
    return 'Today';
  } else if (dateOnly.getTime() === yesterdayOnly.getTime()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }
}

function isToday(date: Date): boolean {
  const today = new Date();
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return dateOnly.getTime() === todayOnly.getTime();
}

// Default goals for fallback
const DEFAULT_GOALS: UserGoals = {
  dailyCalorieGoal: 2500,
  macroGoals: { protein_g: 150, carbs_g: 250, fat_g: 80 },
  isDefault: true,
  macroGoalsSet: false,
  provenance: null,
};

interface JournalPageProps {
  journalContent: JournalPageContent;
}

export default function JournalPage({ journalContent }: JournalPageProps) {
  const router = useRouter();
  // Always initialise to today — the useEffect below syncs with ?date= from
  // the URL once the router is ready. This avoids SSR/client hydration
  // mismatches (server can't read window.location.search).
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [mealCreatedBanner, setMealCreatedBanner] = useState(false);

  // NDS Feature Flag - use full hook to detect loading state
  const { flags: featureFlags, isLoading: flagsLoading } = useFeatureFlags();
  const ndsEnabled = featureFlags.ndsDailyBeta === true;

  // Entries state (single fetch at page level to avoid race conditions)
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const fetchIdRef = useRef(0);

  // Food nutrient data for flag computation (keyed by food_object_id)
  const [foodNutrientMap, setFoodNutrientMap] = useState<Map<string, FoodNutrientData>>(new Map());

  // User goals state — loaded from profile via /api/journal/goals
  const [userGoals, setUserGoals] = useState<UserGoals>(DEFAULT_GOALS);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const nutritionTargetsOverlay = useNutritionTargetsOverlay();

  // Tracking settings for DailySummary tile visibility
  const DEFAULT_TRACKING_KEYS = ['intake', 'water', 'sleep', 'supplement', 'mood', 'bowel', 'cycle', 'movement'];
  const [enabledTrackingKeys, setEnabledTrackingKeys] = useState<string[]>(DEFAULT_TRACKING_KEYS);
  const [mealSchedule, setMealSchedule] = useState<MealSchedule>(() => defaultMealSchedule());
  
  // NDS data - always fetch (don't gate on flag); flag only controls display
  const selectedDateKey = toDateKey(selectedDate);
  const {
    data: ndsData,
    isLoading: ndsLoading,
    error: ndsError,
    refetch: refetchNDS,
    forceRecompute: forceRecomputeNDS,
  } = useNDS({
    dateLocal: selectedDateKey,
    enabled: true,  // Always fetch so data is ready when flag is on
    autoFetch: true,
  });

  // Track entries fingerprint to detect mutations and force NDS recompute
  // Fingerprint = sorted entry IDs + updated_at (changes when entries added/removed/updated)
  const computeEntriesFingerprint = (entryList: JournalEntry[]): string => {
    return entryList
      .map(e => `${e.id}:${e.updated_at?.getTime() ?? 0}`)
      .sort()
      .join(',');
  };
  const prevEntriesFingerprintRef = useRef<string>('');
  const entriesPopulatedRef = useRef(false);

  // Reset initial-load tracking when the date changes so the first entry
  // population for the new date is NOT treated as a user mutation.
  useEffect(() => {
    entriesPopulatedRef.current = false;
    prevEntriesFingerprintRef.current = '';
  }, [selectedDateKey]);

  // Detect entry mutations and force NDS recompute inline.
  // This fires when entries array changes (create/update/delete from another page or refetch).
  // We must NOT fire forceRecompute on the initial entries population — only after
  // the user has made a mutation (add/edit/delete). The normal NDS fetch already
  // covers the correct date on initial load.
  useEffect(() => {
    const currentFingerprint = computeEntriesFingerprint(entries);

    if (!entriesPopulatedRef.current) {
      // Still in initial-load phase: save fingerprint but don't fire recompute.
      // Mark populated once entries have actually arrived from the API.
      prevEntriesFingerprintRef.current = currentFingerprint;
      if (entries.length > 0) {
        entriesPopulatedRef.current = true;
      }
      return;
    }

    // After initial population, detect real mutations and force recompute
    if (currentFingerprint !== prevEntriesFingerprintRef.current) {
      prevEntriesFingerprintRef.current = currentFingerprint;
      if (ndsEnabled) {
        forceRecomputeNDS();
      }
    }
  }, [entries, ndsEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchUserGoals = useCallback(async () => {
    try {
      const goals = await journalService.getGoals();
      setUserGoals(goals);
    } catch (error) {
      console.error('[JournalPage] Failed to fetch goals:', error);
    } finally {
      setGoalsLoading(false);
    }
  }, []);

  // Load profile goals on mount and when returning to the page (e.g. after profile edits)
  useEffect(() => {
    fetchUserGoals();
  }, [fetchUserGoals]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchUserGoals();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchUserGoals]);

  // Fetch tracking settings once on mount
  useEffect(() => {
    journalService.getTrackingSettings()
      .then(({ enabled_tracking_keys }) => {
        if (enabled_tracking_keys.length > 0) setEnabledTrackingKeys(enabled_tracking_keys);
      })
      .catch(() => { /* keep defaults */ });
  }, []);

  const fetchMealSchedule = useCallback(async () => {
    try {
      const res = await fetch('/api/journal/profile');
      if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
      const data = await res.json();
      setMealSchedule(normalizeMealSchedule(data.profile?.meal_schedule));
    } catch (error) {
      console.error('[JournalPage] Failed to fetch meal schedule:', error);
      setMealSchedule(defaultMealSchedule());
    }
  }, []);

  useEffect(() => {
    fetchMealSchedule();
  }, [fetchMealSchedule]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchMealSchedule();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchMealSchedule]);

  // Calculate daily totals from entries
  const dailyTotals = calculateDailyTotals(entries);
  const dailyIntake = dailyTotals.caloriesConsumed;
  // Nutrition Targets v1 — unset target presentation: actual intake always
  // displays; the target denominator renders as unset ("—") rather than a
  // fabricated default until the user has confirmed a Nutrition Target.
  // See lib/nutrition/targets/display.ts for the shared unset-target rules.
  const dailyGoal = !goalsLoading ? deriveDailyGoalForDisplay(userGoals) : undefined;
  const macroSummary = goalsLoading
    ? []
    : [
        {
          label: 'Protein' as const,
          value: dailyTotals.macrosConsumed.protein,
          goal: deriveMacroGoalForDisplay(userGoals, 'protein_g'),
        },
        {
          label: 'Carbs' as const,
          value: dailyTotals.macrosConsumed.carbs,
          goal: deriveMacroGoalForDisplay(userGoals, 'carbs_g'),
        },
        {
          label: 'Fat' as const,
          value: dailyTotals.macrosConsumed.fat,
          goal: deriveMacroGoalForDisplay(userGoals, 'fat_g'),
        },
      ];

  // Nutrition Density Score
  // Show NDS only if there's actually food logged (dailyIntake > 0).
  // Days with no food should show "—" not a meaningless score.
  const ndsScoreRounded =
    ndsData != null && typeof ndsData.nds_score_100 === 'number' && !Number.isNaN(ndsData.nds_score_100)
      ? Math.round(ndsData.nds_score_100)
      : null;
  
  // Show NDS when food is logged and a score exists (including 0).
  // 0 is a legitimate score — it means the pipeline ran but the diet quality is low.
  // null means the pipeline hasn't computed yet or errored.
  const hasFood = dailyIntake > 0;
  const gaugeScore: number | null =
    hasFood && ndsScoreRounded != null
      ? ndsScoreRounded
      : null;
  const gaugeLoading = ndsLoading;
  const gaugeLabel = ndsError && hasFood ? 'Score pending…' : 'Nutrition Density';

  // Debug: enable with ?debug_nds=1 to log gauge data source (client-side console only)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = (router.query ?? {}) as Record<string, string | undefined>;
    if (q.debug_nds !== '1') return;
    console.log('[Journal NDS Gauge]', {
      flagsLoading,
      ndsEnabled,
      selectedDateKey,
      nds_score_100: ndsData?.nds_score_100,
      ndsScoreRounded,
      hasFood,
      dailyIntake: Math.round(dailyIntake * 10) / 10,
      gaugeScore,
      gaugeLoading,
      ndsLoading,
      ndsError: ndsError ?? null,
      _meta: ndsData?._meta ?? null,
    });
  }, [flagsLoading, ndsEnabled, selectedDateKey, ndsData?.nds_score_100, gaugeScore, ndsLoading, ndsError, router.query]);

  // Read date from query param on mount/change (e.g., returning from log page)
  useEffect(() => {
    if (!router.isReady) return;
    const q = (router.query ?? {}) as Record<string, string | undefined>;
    if (q.date) {
      const parsed = parseLocalDate(q.date);
      setSelectedDate(parsed);
    }
  }, [router.isReady, router.query?.date]);

  // Single fetch for all entries on selected date (prevents race conditions)
  useEffect(() => {
    if (!router.isReady) return;

    // Increment fetch ID to track stale requests
    const currentFetchId = ++fetchIdRef.current;
    setIsLoading(true);

    (async () => {
      try {
        const list = await journalService.listEntriesByDay(selectedDate);
        // Only update state if this is still the latest request
        if (currentFetchId !== fetchIdRef.current) return;

        // Filter to only entries matching this local date
        const filtered = list.filter((e) => toDateKey(e.timestamp) === selectedDateKey);
        setEntries(filtered);

        // Extract unique food object IDs for batch nutrient fetch (intake entries only)
        const foodIds = Array.from(
          new Set(
            filtered
              .filter((e) => e.type === 'intake')
              .map((e) => (e.payload as { foodObjectId?: string }).foodObjectId)
              .filter((id): id is string => Boolean(id))
          )
        );

        // Batch fetch nutrient data if we have food IDs
        if (foodIds.length > 0 && currentFetchId === fetchIdRef.current) {
          const nutrients = await foodService.batchGetNutrients(foodIds);
          if (currentFetchId === fetchIdRef.current) {
            const map = new Map<string, FoodNutrientData>();
            for (const n of nutrients) {
              map.set(n.id, n);
            }
            setFoodNutrientMap(map);
          }
        } else {
          setFoodNutrientMap(new Map());
        }
      } catch (error) {
        console.error('[JournalPage] Failed to fetch entries:', error);
        if (currentFetchId === fetchIdRef.current) {
          setEntries([]);
          setFoodNutrientMap(new Map());
        }
      } finally {
        if (currentFetchId === fetchIdRef.current) {
          setIsLoading(false);
        }
      }
    })();
  }, [router.isReady, selectedDateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const enabledMealSlots = getEnabledMealSlots(mealSchedule);

  // Filter intake entries into schedule-aware meal slots. Historical entries
  // without stored context are derived for display only.
  const getEntriesForMealSlot = (slotKey: string): JournalEntry[] => {
    return entries.filter((entry) => {
      if (entry.type !== 'intake') return false;
      return getMealSlotForEntry(entry, enabledMealSlots)?.key === slotKey;
    });
  };

  useEffect(() => {
    if (!router.isReady) return;
    const q = (router.query ?? {}) as Record<string, string | undefined>;
    if (q.meal_created === '1') {
      setMealCreatedBanner(true);
      const t = setTimeout(() => setMealCreatedBanner(false), 4000);
      // Clear meal_created but preserve date param
      const dateParam = q.date ? `?date=${q.date}` : '';
      router.replace(`${APP_ROUTES.log}${dateParam}`, undefined, { shallow: true });
      // NDS refresh polling is triggered by entries fingerprint change detection
      // (no need to call startNDSRefreshPolling() here - it will fire when entries update)
      return () => clearTimeout(t);
    }
  }, [router.isReady, router.query?.meal_created]);

  // Update URL when date changes so router.asPath reflects current state
  // Use shallow routing to avoid full page reload
  const updateUrlWithDate = (newDate: Date) => {
    const dateKey = toDateKey(newDate);
    router.replace(`${APP_ROUTES.log}?date=${dateKey}`, undefined, { shallow: true });
  };

  const handlePrevDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
    updateUrlWithDate(newDate);
  };

  const handleNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (newDate <= today) {
      setSelectedDate(newDate);
      updateUrlWithDate(newDate);
    }
  };

  // Use router.asPath for redirect so exact URL state is preserved
  // If asPath doesn't include date yet (initial load), fall back to computed URL
  const redirect = router.asPath.includes('date=')
    ? router.asPath
    : `${APP_ROUTES.log}?date=${toDateKey(selectedDate)}`;

  return (
    <div className="min-h-screen bg-brand-900 text-white">
      {/* Hero intake summary */}
      <JournalHeroSection
        score={gaugeScore}
        dateLabel={formatDateLabel(selectedDate)}
        onPrevDay={handlePrevDay}
        onNextDay={handleNextDay}
        canGoNext={!isToday(selectedDate)}
        dailyIntake={dailyIntake}
        dailyGoal={dailyGoal}
        goalsLoading={goalsLoading}
        macroSummary={macroSummary}
        scoreLoading={gaugeLoading}
        scoreLabel={gaugeLabel}
        showNutritionTargetsSetup={!goalsLoading && !hasConfirmedCalorieTarget(userGoals)}
        onOpenNutritionTargetsSetup={() =>
          nutritionTargetsOverlay.openNutritionTargets({
            trigger: 'log',
            onSaved: () => void fetchUserGoals(),
          })
        }
      />

      {/* Meals input section */}
      <StackedPageSection layer={1} className="bg-brand-900 pb-20" contentClassName="max-w-[1000px]">
        <div className="w-full">
          {/* Meals copy — adjust internal spacing independently of the bordered module */}
          <div className="space-y-3">
            <h2 className="text-brand-50 font-semibold text-xl antialiased mb-5">Meals</h2>

            {mealCreatedBanner && (
              <div className="px-4 py-4 rounded-lg bg-denim-500/30 text-denim-200 text-sm backdrop-blur-sm">
                Meal saved.
              </div>
            )}
          </div>

          {/* Copy ↔ module spacing — adjust this container to tune the gap above the meal border */}
          <div className="mt-3" aria-hidden />

          {/* Meal schedule slots */}
          <div className="rounded-2xl border-[1.5px] border-brand-300">
            <div className="flex flex-col pt-0">
              {enabledMealSlots.map((slot, index) => (
                <Fragment key={slot.key}>
                  {index > 0 && (
                    <div className="shrink-0 border-t-[1.5px] border-brand-300" role="presentation" />
                  )}
                  <JournalBlockSection
                    mealSlot={slot}
                    date={selectedDate}
                    entries={isLoading ? [] : getEntriesForMealSlot(slot.key)}
                    foodNutrientMap={foodNutrientMap}
                    redirect={redirect}
                    showNDSIndicators={ndsEnabled}
                  />
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      </StackedPageSection>

      {/* Remaining inputs section — preference-driven tracking modules + More Today chips */}
      {!isLoading && (
        <StackedPageSection layer={2} className="bg-neutral-900 py-10 pb-[100px]" contentClassName="max-w-[1000px]">
          <DailySummary
            date={selectedDate}
            entries={entries}
            enabledKeys={enabledTrackingKeys}
            tileImages={journalContent?.summaryTiles}
          />
        </StackedPageSection>
      )}

      

      {/* Footer Navigation */}
      <JournalFooterNav />
    </div>
  );
}

export const getStaticProps: GetStaticProps<JournalPageProps> = async () => {
  const journalContent = await getJournalPageContent();
  return { props: { journalContent }, revalidate: 60 };
};
