'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { JournalHeroSection } from '@/components/journal/JournalHeroSection';
import { JournalBlockSection } from '@/components/journal/JournalBlockSection';
import {
  toDateKey,
  parseLocalDate,
  deriveBlock,
  journalService,
  calculateDailyTotals,
  getNutritionDensityScore,
  type TimeBlock,
  type JournalEntry,
  type UserGoals,
} from '@/lib/journal';
import { foodService, type FoodNutrientData } from '@/lib/food';

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

export default function JournalPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('journal');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [mealCreatedBanner, setMealCreatedBanner] = useState(false);

  // Entries state (single fetch at page level to avoid race conditions)
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const fetchIdRef = useRef(0);

  // Food nutrient data for flag computation (keyed by food_object_id)
  const [foodNutrientMap, setFoodNutrientMap] = useState<Map<string, FoodNutrientData>>(new Map());

  // User goals state
  const [userGoals, setUserGoals] = useState<UserGoals>(DEFAULT_GOALS);
  const goalsLoadedRef = useRef(false);

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

  // Nutrition Density Score (stub for V1 - returns placeholder value)
  const nutritionScore = getNutritionDensityScore(entries, userGoals) ?? 0;

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
  const selectedDateKey = toDateKey(selectedDate);
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
        score={nutritionScore}
        dateLabel={formatDateLabel(selectedDate)}
        onPrevDay={handlePrevDay}
        onNextDay={handleNextDay}
        canGoNext={!isToday(selectedDate)}
        dailyIntake={dailyIntake}
        dailyGoal={dailyGoal}
      >
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
          />
        ))}
      </JournalHeroSection>

      {/* Footer Navigation */}
      <JournalFooterNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
