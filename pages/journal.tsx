'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { JournalHeroSection } from '@/components/journal/JournalHeroSection';
import { JournalBlockSection } from '@/components/journal/JournalBlockSection';
import { NDSDisplay } from '@/components/journal/NDSDisplay';
import {
  toDateKey,
  parseLocalDate,
  deriveBlock,
  journalService,
  calculateDailyTotals,
  type TimeBlock,
  type JournalEntry,
  type UserGoals,
} from '@/lib/journal';
import { foodService, type FoodNutrientData } from '@/lib/food';
import { useNDS } from '@/lib/nds/useNDS';
import { useFeatureFlags } from '@/lib/hooks/useFeatureFlags';

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
};

/** Read ?date=YYYY-MM-DD from URL for initial selectedDate so first NDS request uses the correct date. */
function getInitialSelectedDate(): Date {
  if (typeof window === 'undefined') return new Date();
  const params = new URLSearchParams(window.location.search);
  const dateParam = params.get('date');
  return parseLocalDate(dateParam);
}

export default function JournalPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('journal');
  const [selectedDate, setSelectedDate] = useState(getInitialSelectedDate);
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

  // User goals state
  const [userGoals, setUserGoals] = useState<UserGoals>(DEFAULT_GOALS);
  const goalsLoadedRef = useRef(false);
  
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

  // Fetch user goals once on mount
  useEffect(() => {
    if (goalsLoadedRef.current) return;
    goalsLoadedRef.current = true;

    (async () => {
      try {
        const goals = await journalService.getGoals();
        setUserGoals(goals);
      } catch (error) {
        console.error('[JournalPage] Failed to fetch goals:', error);
      }
    })();
  }, []);

  // Calculate daily totals from entries
  const dailyTotals = calculateDailyTotals(entries);
  const dailyIntake = dailyTotals.caloriesConsumed;
  const dailyGoal = userGoals.dailyCalorieGoal;

  // Nutrition Density Score
  // Show NDS only if there's actually food logged (dailyIntake > 0).
  // Days with no food should show "—" not a meaningless score.
  const ndsScoreRounded =
    ndsData != null && typeof ndsData.nds_score_100 === 'number' && !Number.isNaN(ndsData.nds_score_100)
      ? Math.round(ndsData.nds_score_100)
      : null;
  
  // Only show NDS if calories are logged AND there's a real score (> 0).
  // A score of 0 means no qualifying meals (e.g. all entries excluded as snacks).
  const hasFood = dailyIntake > 0;
  const gaugeScore: number | null =
    hasFood && ndsScoreRounded != null && ndsScoreRounded > 0
      ? ndsScoreRounded
      : null;
  const gaugeLoading = ndsLoading;
  const gaugeLabel = 'Nutrition Density';

  // Debug: enable with ?debug_nds=1 to surface gauge data on-screen + console
  const showNdsDebug = router.query?.debug_nds === '1';
  const ndsDebugPayload = {
    flagsLoading,
    ndsEnabled,
    selectedDateKey,
    nds_score_100: ndsData?.nds_score_100 ?? 'null',
    ndsScoreRounded: ndsScoreRounded ?? 'null',
    hasFood,
    dailyIntake: Math.round(dailyIntake * 10) / 10,
    gaugeScore: gaugeScore ?? 'null',
    gaugeLoading,
    ndsLoading,
    ndsError: ndsError ?? 'null',
    ndsDataExists: ndsData != null,
  };
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!showNdsDebug) return;
    console.log('[Journal NDS Gauge]', ndsDebugPayload);
  }, [showNdsDebug, flagsLoading, ndsEnabled, selectedDateKey, ndsData?.nds_score_100, gaugeScore, ndsLoading, ndsError]);

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

        // Extract unique food object IDs for batch nutrient fetch
        const foodIds = Array.from(
          new Set(
            filtered
              .map((e) => e.payload.foodObjectId)
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

  // Filter entries by block (already sorted by timestamp ASC, id ASC)
  const getEntriesForBlock = (block: TimeBlock): JournalEntry[] => {
    return entries.filter((e) => deriveBlock(e.timestamp) === block);
  };

  useEffect(() => {
    if (!router.isReady) return;
    const q = (router.query ?? {}) as Record<string, string | undefined>;
    if (q.meal_created === '1') {
      setMealCreatedBanner(true);
      const t = setTimeout(() => setMealCreatedBanner(false), 4000);
      // Clear meal_created but preserve date param
      const dateParam = q.date ? `?date=${q.date}` : '';
      router.replace(`/journal${dateParam}`, undefined, { shallow: true });
      // NDS refresh polling is triggered by entries fingerprint change detection
      // (no need to call startNDSRefreshPolling() here - it will fire when entries update)
      return () => clearTimeout(t);
    }
  }, [router.isReady, router.query?.meal_created]);

  // Update URL when date changes so router.asPath reflects current state
  // Use shallow routing to avoid full page reload
  const updateUrlWithDate = (newDate: Date) => {
    const dateKey = toDateKey(newDate);
    router.replace(`/journal?date=${dateKey}`, undefined, { shallow: true });
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
    : `/journal?date=${toDateKey(selectedDate)}`;

  return (
    <div className="min-h-screen bg-brand-900 text-white">
      {/* Hero section with background image, date nav, score gauge, and block sections */}
      <JournalHeroSection
        score={gaugeScore}
        dateLabel={formatDateLabel(selectedDate)}
        onPrevDay={handlePrevDay}
        onNextDay={handleNextDay}
        canGoNext={!isToday(selectedDate)}
        dailyIntake={dailyIntake}
        dailyGoal={dailyGoal}
        scoreLoading={gaugeLoading}
        scoreLabel={gaugeLabel}
      >
        {/* NDS Display - Feature flagged */}
        {ndsEnabled && (
          <div className="mb-3 px-4 py-3 rounded-lg bg-black/30 backdrop-blur-sm">
            <NDSDisplay 
              data={ndsData} 
              isLoading={ndsLoading} 
              error={ndsError} 
              compact 
            />
          </div>
        )}

        {/* Meal created banner */}
        {mealCreatedBanner && (
          <div className="mb-3 px-4 py-2 rounded-lg bg-dark_accent-500/30 text-dark_accent-200 text-sm backdrop-blur-sm">
            Meal saved.
          </div>
        )}

        {/* Morning / Midday / Evening blocks */}
        {(['morning', 'midday', 'evening'] as TimeBlock[]).map((block) => (
          <JournalBlockSection
            key={block}
            block={block}
            date={selectedDate}
            entries={isLoading ? [] : getEntriesForBlock(block)}
            foodNutrientMap={foodNutrientMap}
            redirect={redirect}
            showNDSIndicators={ndsEnabled}
          />
        ))}
      </JournalHeroSection>

      {/* Debug overlay — visible when ?debug_nds=1 is in URL */}
      {showNdsDebug && (
        <div
          id="nds-debug-panel"
          style={{
            position: 'fixed',
            bottom: 80,
            left: 8,
            right: 8,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.92)',
            color: '#0f0',
            fontFamily: 'monospace',
            fontSize: 11,
            padding: 10,
            borderRadius: 8,
            maxHeight: 180,
            overflow: 'auto',
            border: '1px solid #333',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>[NDS Debug Panel]</div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(ndsDebugPayload, null, 2)}
          </pre>
        </div>
      )}

      {/* Footer Navigation */}
      <JournalFooterNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
