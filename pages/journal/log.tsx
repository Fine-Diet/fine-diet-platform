'use client';

import { useRouter } from 'next/router';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { getSafeRedirectTarget } from '@/lib/redirectHelpers';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import {
  journalService,
  toDateKey,
  deriveBlock,
  setTimeOnDate,
  parseLocalDate,
  type TimeBlock,
  type JournalEntry,
  type MealTemplate,
  type HistoryFoodItem,
  type RepeatFoodItem,
  type MealScheduleContext,
  TIME_BLOCK_DEFAULTS,
} from '@/lib/journal';
import type { MealSchedule, MealSlotKey } from '@/lib/plans/types';
import { defaultMealSchedule, normalizeMealSchedule } from '@/lib/plans/scheduleResolver';
import {
  assignTimestampToMealSlot,
  buildMealScheduleContext,
  getEnabledMealSlots,
  getMealSlotForEntry,
  isMealSlotKey,
} from '@/lib/journal/mealScheduleAssignment';
import dynamic from 'next/dynamic';
import {
  foodService,
  formatFoodName,
  formatFoodNameString,
  formatServing,
  formatCalories,
  formatMacros,
  type FoodObject,
  type FoodSearchResult,
  type FoodSearchResponse,
  type FoodSearchDebugInfo,
  type CreateCustomFoodInput,
  type SectionKey,
  resolveDefaultIntakeProfile,
  type DefaultIntakeContext,
} from '@/lib/food';
import { useSearchSession } from '@/lib/hooks/useSearchSession';
const BarcodeScanner = dynamic(() => import('@/components/journal/BarcodeScanner'), { ssr: false });
import { LoggedItemCard } from '@/components/journal/LoggedItemCard';
import { CompactLoggedCard } from '@/components/journal/CompactLoggedCard';
import { SavedMealCard } from '@/components/journal/SavedMealCard';
import {
  ALL_TAB_IDS,
  getTabLabel,
  TAB_TO_ENTRY_TYPE,
  WaterForm,
  SleepForm,
  SupplementForm,
  MoodForm,
  BowelForm,
  CycleForm,
  MovementForm,
  BloodPressureForm,
} from '@/components/journal/LogEntryForms';

type EntryTab = (typeof ALL_TAB_IDS)[number];
type BottomTab = 'saved' | 'favorites' | 'history';
type HistoryFilter = 'recent' | 'repeat';
type SearchBadge = { label: string; className: string };

function parseDateParam(value: string | string[] | null | undefined): Date {
  const v = Array.isArray(value) ? value[0] : value;
  return parseLocalDate(v);
}

/** Format 24h time string (HH:MM) to 12h display (e.g. "8:00 am") */
function formatTime12h(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

/** Adjust hour by delta, wrapping 0-23 */
function adjustHour(time24: string, delta: number): string {
  const [h, m] = time24.split(':').map(Number);
  let newHour = (h + delta) % 24;
  if (newHour < 0) newHour += 24;
  return `${newHour.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function getSearchResultBadges(result: FoodSearchResult): SearchBadge[] {
  const signals = result.rankingSignals;
  if (!signals) return [];

  const badges: SearchBadge[] = [];

  switch (signals.nutritionQualityTier) {
    case 'strong':
      badges.push({
        label: 'Strong nutrition',
        className: 'border border-emerald-400/25 bg-emerald-500/15 text-emerald-100',
      });
      break;
    case 'usable':
      badges.push({
        label: 'Usable nutrition',
        className: 'border border-sky-400/25 bg-sky-500/15 text-sky-100',
      });
      break;
    case 'thin':
      badges.push({
        label: 'Thin nutrition',
        className: 'border border-amber-400/25 bg-amber-500/15 text-amber-100',
      });
      break;
  }

  switch (signals.scoreReadiness) {
    case 'high':
      badges.push({
        label: 'High detail',
        className: 'border border-brand-200/25 bg-brand-200/10 text-brand-50/90',
      });
      break;
    case 'medium':
      badges.push({
        label: 'Medium detail',
        className: 'border border-brand-200/20 bg-brand-200/5 text-brand-50/80',
      });
      break;
    case 'low':
      badges.push({
        label: 'Basic detail',
        className: 'border border-brand-200/15 bg-brand-200/5 text-brand-50/70',
      });
      break;
  }

  switch (signals.fallbackState) {
    case 'fallback_promoted_off':
      badges.push({
        label: 'Reviewed community data',
        className: 'border border-violet-400/25 bg-violet-500/15 text-violet-100',
      });
      break;
    case 'fallback_off':
      badges.push({
        label: 'OFF fallback',
        className: 'border border-rose-400/25 bg-rose-500/15 text-rose-100',
      });
      break;
  }

  return badges.slice(0, 3);
}

function getSearchResultNote(result: FoodSearchResult): string | null {
  const signals = result.rankingSignals;
  if (!signals) return null;

  if (signals.fallbackState === 'fallback_off') {
    return 'Lower-trust external data shown because stronger primary matches were limited.';
  }

  if (signals.fallbackState === 'fallback_promoted_off') {
    return 'Reviewed community snapshot surfaced as fallback when primary matches were limited.';
  }

  if (signals.nutritionQualityTier === 'thin') {
    return 'This match is plausible, but it has thinner nutrition detail than stronger results.';
  }

  return null;
}

export default function JournalLogPage() {
  const router = useRouter();
  const q = (router.query ?? {}) as Record<string, string | undefined>;
  const block = (q.block ?? 'morning') as TimeBlock;
  const timeParam = q.time ?? TIME_BLOCK_DEFAULTS[block];
  const dateParam = q.date;
  const queryMealSlot = isMealSlotKey(q.mealSlot) ? q.mealSlot : null;
  const redirectTarget = getSafeRedirectTarget(q.redirect ?? null, '/journal');
  const searchDebugEnabled = q.searchDebug === '1';
  const date = useMemo(() => parseDateParam(dateParam), [dateParam]);
  const dateKey = toDateKey(date);

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [entryTab, setEntryTab] = useState<EntryTab>('food');
  const [bottomTab, setBottomTab] = useState<BottomTab>('saved');
  const [savedMealsDropdownOpen, setSavedMealsDropdownOpen] = useState(false);
  const savedMealsDropdownRef = useRef<HTMLDivElement>(null);
  const savedMealsScrollRef = useRef<HTMLDivElement>(null);
  const [savedMealsCanScrollLeft, setSavedMealsCanScrollLeft] = useState(false);
  const [savedMealsCanScrollRight, setSavedMealsCanScrollRight] = useState(false);
  const [selectedTime, setSelectedTime] = useState(timeParam);
  const [mealSchedule, setMealSchedule] = useState<MealSchedule>(() => defaultMealSchedule());
  const [selectedMealSlotKey, setSelectedMealSlotKey] = useState<MealSlotKey | null>(queryMealSlot);
  const [mealSlotAssignmentSource, setMealSlotAssignmentSource] =
    useState<MealScheduleContext['assignment_source']>('auto');
  const [savedMeals, setSavedMeals] = useState<MealTemplate[]>([]);

  // Phase 3: stable session ID for search telemetry
  const searchSessionId = useSearchSession();

  // Food search state (Phase 3)
  const [searchResults, setSearchResults] = useState<FoodSearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const [loadingMoreSections, setLoadingMoreSections] = useState<Set<SectionKey>>(new Set());
  // Track last query that had results, for search_abandoned detection
  const lastQueryWithResultsRef = useRef<string | null>(null);
  const [showUpcModal, setShowUpcModal] = useState(false);
  const [upcInput, setUpcInput] = useState('');
  const [upcLoading, setUpcLoading] = useState(false);
  const [upcError, setUpcError] = useState<string | null>(null);

  // Favorites & History state (Phase 4)
  const [favorites, setFavorites] = useState<FoodObject[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [historyFoods, setHistoryFoods] = useState<HistoryFoodItem[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // History filter state (Phase 5)
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('recent');
  const [repeatDate, setRepeatDate] = useState<string>(() => {
    // Default to yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return toDateKey(yesterday);
  });
  const [repeatBlock, setRepeatBlock] = useState<TimeBlock>('morning');
  const [repeatFoods, setRepeatFoods] = useState<RepeatFoodItem[]>([]);
  const [repeatLoaded, setRepeatLoaded] = useState(false);
  const [repeatLoading, setRepeatLoading] = useState(false);

  // Custom food modal state (Phase 3C)
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCalories, setCustomCalories] = useState('');
  const [customProtein, setCustomProtein] = useState('');
  const [customCarbs, setCustomCarbs] = useState('');
  const [customFat, setCustomFat] = useState('');
  const [customServingSizeG, setCustomServingSizeG] = useState('100');
  const [customServingUnit, setCustomServingUnit] = useState('serving');
  const [customServingDescription, setCustomServingDescription] = useState('');
  const [showMicronutrients, setShowMicronutrients] = useState(false);
  const [customFiber, setCustomFiber] = useState('');
  const [customSugar, setCustomSugar] = useState('');
  const [customSodium, setCustomSodium] = useState('');
  const [customNutrientsExtended, setCustomNutrientsExtended] = useState('');
  const [customSaveToFavorites, setCustomSaveToFavorites] = useState(true);
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  // Per-entry local overrides for inline qty/unit editing (keyed by entry id).
  // Stores the latest unit + display value to avoid stale-closure issues.
  const [entryOverrides, setEntryOverrides] = useState<Record<string, { unit: string; value: number }>>({});

  // Undo state for last add batch
  const [lastAddedEntryIds, setLastAddedEntryIds] = useState<string[]>([]);
  const [undoFeedback, setUndoFeedback] = useState<string | null>(null);
  const [undoLoading, setUndoLoading] = useState(false);

  // Tracking settings: which tabs are enabled (from people.metadata.enabled_tracking_keys)
  // Default: core keys only (blood_pressure and other add-ons hidden until enabled)
  const [enabledTabIds, setEnabledTabIds] = useState<string[]>([
    'food', 'water', 'supplements', 'mood', 'bowel', 'cycle', 'movement',
  ]);
  const [nonFoodSubmitting, setNonFoodSubmitting] = useState(false);

  const enabledMealSlots = useMemo(() => getEnabledMealSlots(mealSchedule), [mealSchedule]);
  const selectedMealSlot = useMemo(() => {
    return enabledMealSlots.find((slot) => slot.key === selectedMealSlotKey) ?? null;
  }, [enabledMealSlots, selectedMealSlotKey]);

  const getNearestMealSlotForTime = useCallback(
    (time: string) => assignTimestampToMealSlot(setTimeOnDate(new Date(date.getTime()), time), enabledMealSlots),
    [date, enabledMealSlots],
  );

  const handleSelectedTimeChange = useCallback(
    (time: string) => {
      setSelectedTime(time);
      if (mealSlotAssignmentSource === 'auto') {
        setSelectedMealSlotKey(getNearestMealSlotForTime(time)?.key ?? null);
      }
    },
    [getNearestMealSlotForTime, mealSlotAssignmentSource],
  );

  const handleMealSlotChange = (slotKey: MealSlotKey) => {
    const slot = enabledMealSlots.find((candidate) => candidate.key === slotKey);
    setSelectedMealSlotKey(slotKey);
    setMealSlotAssignmentSource('manual');
    if (slot) setSelectedTime(slot.target_time);
  };

  const currentMealBlock = (selectedMealSlot?.slot_block ?? block) as TimeBlock;

  const getCurrentMealScheduleContext = (): MealScheduleContext | undefined => {
    if (!selectedMealSlot) return undefined;
    return buildMealScheduleContext(selectedMealSlot, mealSlotAssignmentSource, mealSchedule);
  };

  useEffect(() => {
    if (!router.isReady) return;
    setSelectedTime(timeParam);
    setSelectedMealSlotKey(queryMealSlot);
    setMealSlotAssignmentSource('auto');
  }, [router.isReady, timeParam, queryMealSlot]);

  function updateSavedMealsScrollState() {
    const el = savedMealsScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setSavedMealsCanScrollLeft(scrollLeft > 2);
    setSavedMealsCanScrollRight(scrollLeft < scrollWidth - clientWidth - 2);
  }

  // Visible tabs: only those in enabledTabIds, in ALL_TAB_IDS order
  const visibleTabs = ALL_TAB_IDS.filter((id) => enabledTabIds.includes(id)).map((id) => ({
    id,
    label: getTabLabel(id),
    disabled: false,
  }));

  // Ensure entryTab is valid (in visible tabs)
  const effectiveEntryTab = visibleTabs.some((t) => t.id === entryTab) ? entryTab : (visibleTabs[0]?.id ?? 'food');

  // Filter logged entries by the active tab's entry type
  const activeEntryType = TAB_TO_ENTRY_TYPE[effectiveEntryTab] ?? 'intake';
  const filteredEntries = entries.filter((e) => e.type === activeEntryType);

  // Sliding pill: position and width from selected tab (like JournalFooterNav)
  const [pillLeft, setPillLeft] = useState(0);
  const [pillWidth, setPillWidth] = useState(0);
  const [pillMounted, setPillMounted] = useState(false);
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const getPillPosition = useCallback((tabId: string) => {
    const button = tabButtonRefs.current[tabId];
    const container = tabContainerRef.current;
    if (button && container) {
      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      return {
        left: buttonRect.left - containerRect.left,
        width: buttonRect.width,
      };
    }
    return { left: 0, width: 0 };
  }, []);

  useEffect(() => {
    const { left, width } = getPillPosition(effectiveEntryTab);
    setPillLeft(left);
    setPillWidth(width);
  }, [effectiveEntryTab, getPillPosition, visibleTabs]);

  useEffect(() => {
    const updatePill = () => {
      const { left, width } = getPillPosition(effectiveEntryTab);
      setPillLeft(left);
      setPillWidth(width);
    };
    window.addEventListener('resize', updatePill);
    requestAnimationFrame(() => {
      updatePill();
      setPillMounted(true);
    });
    return () => window.removeEventListener('resize', updatePill);
  }, [effectiveEntryTab, getPillPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll selected tab into view when it changes
  useEffect(() => {
    const button = tabButtonRefs.current[effectiveEntryTab];
    if (button) {
      button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [effectiveEntryTab]);

  // Update pill position when tab container scrolls
  useEffect(() => {
    const container = tabContainerRef.current;
    if (!container) return;
    const updatePill = () => {
      const { left, width } = getPillPosition(effectiveEntryTab);
      setPillLeft(left);
      setPillWidth(width);
    };
    container.addEventListener('scroll', updatePill);
    return () => container.removeEventListener('scroll', updatePill);
  }, [effectiveEntryTab, getPillPosition]);

  const handleChevronLeft = () => {
    const idx = visibleTabs.findIndex((t) => t.id === effectiveEntryTab);
    if (idx < 0) return;
    const nextIdx = idx === 0 ? visibleTabs.length - 1 : idx - 1;
    setEntryTab(visibleTabs[nextIdx].id as EntryTab);
  };

  const handleChevronRight = () => {
    const idx = visibleTabs.findIndex((t) => t.id === effectiveEntryTab);
    if (idx < 0) return;
    const nextIdx = idx >= visibleTabs.length - 1 ? 0 : idx + 1;
    setEntryTab(visibleTabs[nextIdx].id as EntryTab);
  };

  const selectedTabInfo = visibleTabs.find((t) => t.id === effectiveEntryTab) ?? visibleTabs[0] ?? { id: 'food', label: 'Food / Drinks' };

  useEffect(() => {
    if (!savedMealsDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (savedMealsDropdownRef.current && !savedMealsDropdownRef.current.contains(e.target as Node)) {
        setSavedMealsDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [savedMealsDropdownOpen]);

  const fetchMealSchedule = useCallback(async () => {
    try {
      const res = await fetch('/api/journal/profile');
      if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
      const data = await res.json();
      setMealSchedule(normalizeMealSchedule(data.profile?.meal_schedule));
    } catch (error) {
      console.error('[JournalLogPage] Failed to fetch meal schedule:', error);
      setMealSchedule(defaultMealSchedule());
    }
  }, []);

  useEffect(() => {
    fetchMealSchedule();
  }, [fetchMealSchedule]);

  useEffect(() => {
    if (enabledMealSlots.length === 0) {
      setSelectedMealSlotKey(null);
      return;
    }

    if (mealSlotAssignmentSource === 'manual') return;

    if (queryMealSlot && enabledMealSlots.some((slot) => slot.key === queryMealSlot)) {
      setSelectedMealSlotKey(queryMealSlot);
      setMealSlotAssignmentSource('auto');
      return;
    }

    setSelectedMealSlotKey(getNearestMealSlotForTime(selectedTime)?.key ?? enabledMealSlots[0]?.key ?? null);
  }, [enabledMealSlots, getNearestMealSlotForTime, mealSlotAssignmentSource, queryMealSlot, selectedTime]);

  const refreshEntries = async () => {
    const list = await journalService.listEntriesByDay(date);
    // Filter by local date first (server returns wide window), then by meal slot for intake entries.
    const filtered = list.filter((e) => {
      const entryDateKey = toDateKey(e.timestamp);
      if (entryDateKey !== dateKey) return false;
      if (e.type === 'intake' && selectedMealSlot) {
        return getMealSlotForEntry(e, enabledMealSlots)?.key === selectedMealSlot.key;
      }
      return deriveBlock(e.timestamp) === currentMealBlock;
    });
    setEntries(filtered);
  };

  useEffect(() => {
    refreshEntries();
  }, [dateKey, currentMealBlock, selectedMealSlotKey, enabledMealSlots]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch saved meal templates from API (and refetch when returning from create with meal_created=1)
  const refreshSavedMeals = async () => {
    const list = await journalService.listMealTemplates();
    setSavedMeals(list);
  };
  useEffect(() => {
    refreshSavedMeals();
  }, []);
  useEffect(() => {
    if (q.meal_created === '1') refreshSavedMeals();
  }, [q.meal_created]);

  // Sync entryTab from ?tab= query param (e.g. deep-links from Daily Summary tiles)
  useEffect(() => {
    if (!router.isReady) return;
    const tabParam = q.tab;
    if (tabParam && ALL_TAB_IDS.includes(tabParam as EntryTab)) {
      setEntryTab(tabParam as EntryTab);
    }
  }, [router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch tracking settings (enabled_tracking_keys). New users get core keys only (no add-ons).
  const DEFAULT_TAB_IDS = ['food', 'water', 'sleep', 'supplements', 'mood', 'bowel', 'cycle', 'movement'];
  useEffect(() => {
    journalService.getTrackingSettings().then(({ enabled_tracking_keys }) => {
      const tabIds = enabled_tracking_keys.map((k) => {
        if (k === 'intake') return 'food';
        if (k === 'supplement') return 'supplements';
        return k;
      }).filter((id) => ALL_TAB_IDS.includes(id as EntryTab));
      setEnabledTabIds(tabIds.length > 0 ? tabIds : DEFAULT_TAB_IDS);
    }).catch(() => setEnabledTabIds(DEFAULT_TAB_IDS));
  }, []);

  // Saved meals scroll: update chevron visibility on scroll, resize, and when tab/content changes
  useEffect(() => {
    updateSavedMealsScrollState();
    const el = savedMealsScrollRef.current;
    if (!el) return;
    const onScrollOrResize = () => updateSavedMealsScrollState();
    el.addEventListener('scroll', onScrollOrResize);
    const ro = new ResizeObserver(onScrollOrResize);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScrollOrResize);
      ro.disconnect();
    };
  }, [bottomTab, savedMeals?.length ?? 0, favorites?.length ?? 0, historyFoods?.length ?? 0, repeatFoods?.length ?? 0, historyFilter]);

  // Load favorites on page mount (for favoriteIds used in search/logged item hearts)
  useEffect(() => {
    foodService.listFavorites()
      .then((foods) => {
        setFavorites(foods);
        setFavoriteIds(new Set(foods.map((f) => f.id)));
        setFavoritesLoaded(true);
      })
      .catch((err) => {
        console.error('[Favorites] Initial load error:', err);
      });
  }, []); // Run once on mount

  // Refresh Favorites tab when opened (if flagged for refresh)
  useEffect(() => {
    if (bottomTab === 'favorites' && !favoritesLoaded && !favoritesLoading) {
      setFavoritesLoading(true);
      foodService.listFavorites()
        .then((foods) => {
          setFavorites(foods);
          setFavoriteIds(new Set(foods.map((f) => f.id)));
          setFavoritesLoaded(true);
        })
        .catch((err) => {
          console.error('[Favorites] Load error:', err);
        })
        .finally(() => {
          setFavoritesLoading(false);
        });
    }
  }, [bottomTab, favoritesLoaded, favoritesLoading]);

  // Lazy-load History tab on first open (Recent mode)
  useEffect(() => {
    if (bottomTab === 'history' && historyFilter === 'recent' && !historyLoaded && !historyLoading) {
      setHistoryLoading(true);
      journalService.listHistoryFoods({ limit: 50 })
        .then((foods) => {
          setHistoryFoods(foods);
          setHistoryLoaded(true);
        })
        .catch((err) => {
          console.error('[History] Load error:', err);
        })
        .finally(() => {
          setHistoryLoading(false);
        });
    }
  }, [bottomTab, historyFilter, historyLoaded, historyLoading]);

  // Load Repeat From foods when filter is "repeat" and date/block changes
  useEffect(() => {
    if (bottomTab === 'history' && historyFilter === 'repeat' && !repeatLoaded && !repeatLoading) {
      setRepeatLoading(true);
      journalService.getRepeatFoods({ date: repeatDate, block: repeatBlock })
        .then((foods) => {
          setRepeatFoods(foods);
          setRepeatLoaded(true);
        })
        .catch((err) => {
          console.error('[Repeat] Load error:', err);
        })
        .finally(() => {
          setRepeatLoading(false);
        });
    }
  }, [bottomTab, historyFilter, repeatDate, repeatBlock, repeatLoaded, repeatLoading]);

  // Reset repeatLoaded when date/block changes to trigger refetch
  useEffect(() => {
    if (historyFilter === 'repeat') {
      setRepeatLoaded(false);
    }
  }, [repeatDate, repeatBlock]);

  const handleDeleteEntry = async (entryId: string) => {
    await journalService.deleteEntry(entryId);
    refreshEntries();
  };

  const handleClose = () => {
    router.push(redirectTarget);
  };

  // Food search with debounce (Phase 3)
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (!searchQuery || searchQuery.trim().length < 2) {
      // Phase 3: fire search_abandoned when query is cleared after results were shown
      if (lastQueryWithResultsRef.current) {
        foodService.logSearchEvent({
          event_type: 'search_abandoned',
          session_id: searchSessionId || undefined,
          query: lastQueryWithResultsRef.current,
        });
        lastQueryWithResultsRef.current = null;
      }
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await foodService.search(searchQuery.trim(), {
          limit: 40,
          debug: searchDebugEnabled,
          sessionId: searchSessionId || undefined,
          consumer: 'sections',
        });
        setSearchResults(results);
        // Track for abandoned detection
        if (results.totalReturned > 0) {
          lastQueryWithResultsRef.current = searchQuery.trim();
        }
      } catch (error) {
        console.error('[Food search] Error:', error);
        setSearchResults(null);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchDebugEnabled, searchQuery, searchSessionId]);

  // Handle "Show more" for a section
  const handleShowMore = useCallback(async (sectionKey: SectionKey) => {
    if (!searchResults || !searchQuery.trim()) return;
    
    // Find the current section
    const currentSection = searchResults.sections.find(s => s.key === sectionKey);
    if (!currentSection || !currentSection.hasMore) return;
    
    // Calculate next offset
    const nextOffset = (currentSection.offset || 0) + currentSection.shown;
    
    // Set loading state for this section
    setLoadingMoreSections(prev => new Set(prev).add(sectionKey));
    
    try {
      const response = await foodService.searchSection(
        searchQuery.trim(),
        sectionKey,
        nextOffset,
        12, // sectionLimit
        searchSessionId || undefined,
        searchDebugEnabled,
        'sections',
      );
      
      // Find the returned section (should be only one when using section param)
      const newSection = response.sections.find(s => s.key === sectionKey);
      if (!newSection) {
        console.error(`[handleShowMore] Section ${sectionKey} not found in response`);
        return;
      }
      
      // Update searchResults immutably: append new items to the existing section
      setSearchResults(prev => {
        if (!prev) return prev;
        
        return {
          ...prev,
          sections: prev.sections.map(s => {
            if (s.key !== sectionKey) return s;
            
            // Append new items and update metadata
            const combinedItems = [...s.items, ...newSection.items];
            return {
              ...s,
              items: combinedItems,
              shown: combinedItems.length,
              offset: nextOffset,
              hasMore: newSection.hasMore,
            };
          }),
          // Also update flat results array for backward compatibility
          results: [
            ...prev.results,
            ...newSection.items,
          ],
          totalReturned: prev.totalReturned + newSection.items.length,
        };
      });
    } catch (error) {
      console.error(`[handleShowMore] Error loading more for ${sectionKey}:`, error);
    } finally {
      setLoadingMoreSections(prev => {
        const next = new Set(prev);
        next.delete(sectionKey);
        return next;
      });
    }
  }, [searchDebugEnabled, searchResults, searchQuery, searchSessionId]);

  // Log food from search / UPC: default qty+unit from resolveDefaultIntakeProfile (V1 spec).
  // qtyOverride = multiplier of that profile's "one log" (same unit); see lib/food/defaultIntake.ts.
  // searchMeta is present only when the food came from a text search result (not UPC/custom).
  // intakeCtx passes OFF normalization when available — defaults must not use search rank.
  const handleLogFood = async (
    food: FoodObject,
    qtyOverride?: number,
    searchMeta?: { source?: string; position?: number; query?: string },
    intakeCtx?: DefaultIntakeContext
  ) => {
    const profile = resolveDefaultIntakeProfile(food, intakeCtx ?? {});
    const qty = profile.defaultQuantity * (qtyOverride ?? 1);
    const unit = profile.defaultUnit;
    const occurredAt = setTimeOnDate(new Date(date.getTime()), selectedTime);
    const mealScheduleContext = getCurrentMealScheduleContext();
    // Phase 2: OFF items are source-distinct and read-only — do not persist to food_objects.
    // Log by name/nutrition only; omit foodObjectId so no FK write occurs.
    const isOff = food.sourceProvider === 'off';
    const createdEntry = await journalService.createEntry({
      type: 'intake',
      date,
      time: selectedTime,
      block: currentMealBlock,
      occurredAt,
      payload: {
        name: formatFoodName(food),
        quantity: qty,
        unit,
        calories: food.calories ?? undefined,
        macros: food.proteinG !== null || food.carbsG !== null || food.fatG !== null
          ? {
              protein: food.proteinG ?? undefined,
              carbs: food.carbsG ?? undefined,
              fat: food.fatG ?? undefined,
            }
          : undefined,
        ...(isOff ? {} : { foodObjectId: food.id }),
        servingSizeG: food.servingSizeG,
        measures: food.measures ?? undefined,
        ...(mealScheduleContext ? { meal_schedule_context: mealScheduleContext } : {}),
      },
    });
    // Phase 2/3: log search_result_selected; clear abandoned tracking on selection
    if (searchMeta) {
      lastQueryWithResultsRef.current = null; // selection happened — no abandoned event
      foodService.logSearchEvent({
        event_type: 'search_result_selected',
        session_id: searchSessionId || undefined,
        query: searchMeta.query ?? searchQuery,
        selected_food_id: isOff ? food.sourceId ?? food.id : food.id,
        selected_food_source: isOff ? 'off' : food.personId ? 'user' : 'curated',
        selected_result_position: searchMeta.position,
      });
    }

    // Track for undo
    setLastAddedEntryIds([createdEntry.id]);
    setSearchQuery('');
    setSearchResults(null);
    await refreshEntries();
    // Refresh history after logging (so new item appears)
    setHistoryLoaded(false);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  // Log food from history (re-log) — works for both Recent and Repeat items
  const handleLogFromHistory = async (historyItem: HistoryFoodItem | RepeatFoodItem) => {
    const occurredAt = setTimeOnDate(new Date(date.getTime()), selectedTime);
    const mealScheduleContext = getCurrentMealScheduleContext();
    const createdEntry = await journalService.createEntry({
      type: 'intake',
      date,
      time: selectedTime,
      block: currentMealBlock,
      occurredAt,
      payload: {
        // Format stored name (sanitize USDA IDs + fix apostrophe casing)
        name: formatFoodNameString(historyItem.name),
        quantity: 1,
        unit: historyItem.servingUnit ?? 'serving',
        calories: historyItem.calories ?? undefined,
        macros: historyItem.proteinG !== null || historyItem.carbsG !== null || historyItem.fatG !== null
          ? {
              protein: historyItem.proteinG ?? undefined,
              carbs: historyItem.carbsG ?? undefined,
              fat: historyItem.fatG ?? undefined,
            }
          : undefined,
        foodObjectId: historyItem.foodObjectId,
        servingSizeG: historyItem.servingSizeG ?? undefined,
        measures: historyItem.measures ?? undefined,
        ...(mealScheduleContext ? { meal_schedule_context: mealScheduleContext } : {}),
      },
    });
    // Track for undo
    setLastAddedEntryIds([createdEntry.id]);
    await refreshEntries();
    // Refresh history to update ordering
    setHistoryLoaded(false);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  // Toggle favorite status for a food (optimistic update)
  const handleToggleFavorite = async (foodId: string) => {
    const wasInFavorites = favoriteIds.has(foodId);
    const newState = !wasInFavorites;

    // Optimistic update
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (newState) {
        next.add(foodId);
      } else {
        next.delete(foodId);
      }
      return next;
    });

    // If removing from favorites, also update the favorites list
    if (!newState) {
      setFavorites((prev) => prev.filter((f) => f.id !== foodId));
    }

    try {
      const confirmedState = await foodService.setFavorite(foodId, newState);
      // Update state if server returned different value
      if (confirmedState !== newState) {
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (confirmedState) {
            next.add(foodId);
          } else {
            next.delete(foodId);
          }
          return next;
        });
      }
      // If added to favorites, flag for refresh so Favorites tab shows it
      if (confirmedState) {
        setFavoritesLoaded(false);
      }
    } catch (error) {
      console.error('[handleToggleFavorite] Error, reverting:', error);
      // Revert optimistic update on failure
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (wasInFavorites) {
          next.add(foodId);
        } else {
          next.delete(foodId);
        }
        return next;
      });
    }
  };

  // Apply saved meal — creates entries for each item in the template
  const handleApplySavedMeal = async (meal: MealTemplate) => {
    if (!meal.items || meal.items.length === 0) return;

    const occurredAt = setTimeOnDate(new Date(date.getTime()), selectedTime);
    const mealScheduleContext = getCurrentMealScheduleContext();

    // Create entries for each item in the template, collect IDs for undo
    const createdIds: string[] = [];
    for (const item of meal.items) {
      const createdEntry = await journalService.createEntry({
        type: 'intake',
        date,
        time: selectedTime,
        block: currentMealBlock,
        occurredAt,
        payload: {
          // Format stored name (sanitize USDA IDs + fix apostrophe casing)
          name: formatFoodNameString(item.name ?? 'Untitled'),
          quantity: item.quantity ?? 1,
          unit: item.unit ?? 'serving',
          calories: item.calories,
          macros: item.macros,
          foodObjectId: item.foodObjectId,
          servingSizeG: item.servingSizeG,
          ...(mealScheduleContext ? { meal_schedule_context: mealScheduleContext } : {}),
        },
      });
      createdIds.push(createdEntry.id);
    }

    // Track for undo (all items from this meal)
    setLastAddedEntryIds(createdIds);
    await refreshEntries();
    setHistoryLoaded(false);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  // Undo last add batch
  const handleUndo = async () => {
    if (lastAddedEntryIds.length === 0 || undoLoading) return;

    setUndoLoading(true);
    try {
      // Delete all entries in the batch
      const results = await Promise.all(
        lastAddedEntryIds.map((id) => journalService.deleteEntry(id))
      );
      
      // Check if any failed
      const anyFailed = results.some((r) => !r);
      
      // Clear undo state
      setLastAddedEntryIds([]);
      
      // Refresh entries
      await refreshEntries();
      setHistoryLoaded(false);
      
      // Show feedback
      if (anyFailed) {
        setUndoFeedback('Some items could not be removed');
      } else {
        setUndoFeedback('Undone');
      }
      setTimeout(() => setUndoFeedback(null), 2000);
    } catch (error) {
      console.error('[handleUndo] Error:', error);
      setUndoFeedback('Failed to undo');
      setTimeout(() => setUndoFeedback(null), 2000);
      // Still refresh to show current state
      await refreshEntries();
    } finally {
      setUndoLoading(false);
    }
  };

  // Debounced entry change save — handles both unit switching and value edits.
  // Uses a ref for the latest override so the debounce callback always reads
  // the most recent state (avoids stale-closure race conditions).
  const entryDebounceRef = useRef<Record<string, NodeJS.Timeout>>({});
  const entryOverridesRef = useRef(entryOverrides);
  entryOverridesRef.current = entryOverrides;

  const handleEntryChange = useCallback((entryId: string, unit: string, value: number) => {
    // Optimistic UI update
    setEntryOverrides((prev) => ({ ...prev, [entryId]: { unit, value } }));

    // Debounce API save (500ms). The closure reads from the ref, not stale state.
    if (entryDebounceRef.current[entryId]) clearTimeout(entryDebounceRef.current[entryId]);
    entryDebounceRef.current[entryId] = setTimeout(async () => {
      const latest = entryOverridesRef.current[entryId];
      if (!latest) return;

      if (latest.unit === 'g') {
        // Gram mode: send quantityG so server recomputes payload.quantity
        await journalService.updateEntry(entryId, {
          payload: { unit: 'g' },
          quantityG: latest.value,
        });
      } else if (latest.unit === 'serving') {
        // Serving mode: send payload.quantity + unit normally
        await journalService.updateEntry(entryId, {
          payload: { quantity: latest.value, unit: 'serving' },
        });
      } else {
        // Measure unit mode (e.g. cup, oz, tablespoon): send quantity + unit
        // Server resolves via measures from the food object
        await journalService.updateEntry(entryId, {
          payload: { quantity: latest.value, unit: latest.unit },
        });
      }

      // Refresh entries to get server-authoritative state
      await refreshEntries();
      // Clear override since server state is now canonical
      setEntryOverrides((prev) => {
        const next = { ...prev };
        delete next[entryId];
        return next;
      });
    }, 500);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Create non-food entry (water, supplement, mood, etc.)
  const handleCreateNonFoodEntry = async (payload: Record<string, unknown>) => {
    const entryType = TAB_TO_ENTRY_TYPE[effectiveEntryTab];
    if (!entryType) return;
    setNonFoodSubmitting(true);
    try {
      const occurredAt = setTimeOnDate(new Date(date.getTime()), selectedTime);
      await journalService.createEntry({
        type: entryType,
        date,
        time: selectedTime,
        block: currentMealBlock,
        occurredAt,
        payload,
      });
      await refreshEntries();
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2000);
    } catch (err) {
      console.error('[handleCreateNonFoodEntry] Error:', err);
    } finally {
      setNonFoodSubmitting(false);
    }
  };

  // UPC lookup — called by BarcodeScanner (camera decode or manual entry)
  const handleBarcodeScan = async (code: string) => {
    const cleaned = code.replace(/\D/g, '').trim();
    if (cleaned.length < 8) {
      setUpcError('Invalid barcode — must be at least 8 digits.');
      return;
    }

    setUpcLoading(true);
    setUpcError(null);

    try {
      const result = await foodService.lookupUpc(cleaned);
      if (result.found && result.food) {
        await handleLogFood(result.food);
        setShowUpcModal(false);
        setUpcInput('');
        setUpcError(null);
      } else {
        setUpcError(`Product not found for barcode ${cleaned}. Try searching instead.`);
      }
    } catch {
      setUpcError('Failed to look up barcode. Please try again.');
    } finally {
      setUpcLoading(false);
    }
  };

  // Reset custom food form
  const resetCustomForm = () => {
    setCustomName('');
    setCustomCalories('');
    setCustomProtein('');
    setCustomCarbs('');
    setCustomFat('');
    setCustomServingSizeG('100');
    setCustomServingUnit('serving');
    setCustomServingDescription('');
    setShowMicronutrients(false);
    setCustomFiber('');
    setCustomSugar('');
    setCustomSodium('');
    setCustomNutrientsExtended('');
    setCustomSaveToFavorites(true);
    setCustomError(null);
  };

  // Create custom food and log it immediately
  const handleCreateCustomFood = async () => {
    if (!customName.trim()) {
      setCustomError('Name is required');
      return;
    }

    // Parse nutrients_extended JSON if provided
    let nutrientsExtended: Record<string, number> | undefined;
    if (customNutrientsExtended.trim()) {
      try {
        const parsed = JSON.parse(customNutrientsExtended.trim());
        // Validate it's an object with numeric values
        if (typeof parsed !== 'object' || Array.isArray(parsed)) {
          setCustomError('Additional nutrients must be a JSON object');
          return;
        }
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value !== 'number') {
            setCustomError(`Invalid value for "${key}" - must be a number`);
            return;
          }
        }
        nutrientsExtended = parsed;
      } catch {
        setCustomError('Invalid JSON in additional nutrients field');
        return;
      }
    }

    setCustomLoading(true);
    setCustomError(null);

    try {
      // Build input
      const input: CreateCustomFoodInput = {
        name: customName.trim(),
        saveToFavorites: customSaveToFavorites,
      };

      // Add optional numeric fields
      if (customCalories) input.calories = parseFloat(customCalories);
      if (customProtein) input.proteinG = parseFloat(customProtein);
      if (customCarbs) input.carbsG = parseFloat(customCarbs);
      if (customFat) input.fatG = parseFloat(customFat);
      if (customServingSizeG) input.servingSizeG = parseFloat(customServingSizeG);
      if (customServingUnit) input.servingUnit = customServingUnit;
      if (customServingDescription) input.servingDescription = customServingDescription;
      if (customFiber) input.fiberG = parseFloat(customFiber);
      if (customSugar) input.sugarG = parseFloat(customSugar);
      if (customSodium) input.sodiumMg = parseFloat(customSodium);
      if (nutrientsExtended) input.nutrientsExtended = nutrientsExtended;

      // Create the food
      const food = await foodService.createCustomFood(input);

      // Log it immediately
      await handleLogFood(food);

      // Close modal and reset
      setShowCustomModal(false);
      resetCustomForm();
    } catch (error) {
      console.error('[handleCreateCustomFood] Error:', error);
      setCustomError(error instanceof Error ? error.message : 'Failed to create custom food');
    } finally {
      setCustomLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      {/* Modal header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-brand-900/98 backdrop-blur">
        <h1 className="text-lg font-semibold text-brand-50">Log Entry</h1>
        <div className="flex items-center gap-3">
          {savedFeedback && (
            <span className="font-semibold text-sm text-brand-200">Saved</span>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="p-1 text-white/60 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[650px] mx-auto">
        {/* Entry type tabs — sliding pill centered on selected, dual chevrons */}
        <div className="px-6 pt-1">
          <div className="relative rounded-full border-[1.5px] border-brand-200/50 overflow-hidden">
            {/* Left chevron */}
            <button
              type="button"
              onClick={handleChevronLeft}
              className="absolute left-0 top-0 bottom-0 z-20 flex items-center pr-6 pl-0 bg-gradient-to-r from-brand-900 from-60% to-transparent"
              aria-label="Previous tab"
            >
              <span className="text-brand-200/50 hover:text-brand-50 font-normal leading-none bg-brand-900 rounded-full pl-4 pr-2 transition-colors" style={{ fontSize: '38px' }}>‹</span>
            </button>

            {/* Sliding pill — positioned relative to container, behind tabs */}
            <div
              className="absolute rounded-full border-[2.5px] border-brand-50 pointer-events-none"
              style={{
                left: pillLeft,
                width: pillWidth,
                height: 38,
                top: '49%',
                transform: 'translateY(-50%)',
                opacity: pillMounted ? 1 : 0,
                transition: 'left 0.25s ease-out, width 0.25s ease-out, opacity 0.15s',
              }}
            />

            {/* Tab container — scrollable */}
            <div
              ref={tabContainerRef}
              className="relative flex items-center overflow-x-auto scrollbar-hide px-12"
            >
              {visibleTabs.map((tab) => {
                const isSelected = tab.id === effectiveEntryTab;
                return (
                  <button
                    key={tab.id}
                    ref={(el) => { tabButtonRefs.current[tab.id] = el; }}
                    type="button"
                    onClick={() => setEntryTab(tab.id as EntryTab)}
                    className={`shrink-0 whitespace-nowrap py-1.5 px-4 rounded-full text-2xl font-semibold transition-colors cursor-pointer relative z-10 ${
                      isSelected ? 'text-brand-50' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Right chevron */}
            <button
              type="button"
              onClick={handleChevronRight}
              className="absolute right-0 top-0 bottom-0 z-20 flex items-center pl-6 pr-0 bg-gradient-to-l from-brand-900 to-transparent from-60%"
              aria-label="Next tab"
            >
              <span className="text-brand-200/50 hover:text-brand-50 font-normal leading-none bg-brand-900 rounded-full px-4 transition-colors" style={{ fontSize: '38px' }}>›</span>
            </button>
          </div>
        </div>

        {/* Time picker — clock icon, clickable time (opens native picker), up/down stepper */}
        <div className="px-6 pt-4">
          <div className="inline-flex items-center gap-1">
            {/* Clock icon */}
            <svg className="w-8 h-8 text-brand-50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {/* Time display — clicking opens native time picker popup */}
            <div className="relative">
              <input
                type="time"
                value={selectedTime}
                onChange={(e) => handleSelectedTimeChange(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                aria-label="Select time"
              />
              <span className="text-brand-50 font-semibold text-xl pointer-events-none">
                {formatTime12h(selectedTime)}
              </span>
            </div>
            {/* Up/down stepper arrows (stacked) for quick hour adjustment */}
            <div className="flex flex-col -space-y-0.5">
              <button
                type="button"
                onClick={() => handleSelectedTimeChange(adjustHour(selectedTime, 1))}
                className="px-0.5 py-0 text-white/60 hover:text-white transition-colors leading-none"
                aria-label="Increase hour"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => handleSelectedTimeChange(adjustHour(selectedTime, -1))}
                className="px-0.5 py-0 text-white/60 hover:text-white transition-colors leading-none"
                aria-label="Decrease hour"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            {/* Date label for clarity */}
            <span className="text-brand-200/50 text-xl font-semibold ml-2">
              {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
          {effectiveEntryTab === 'food' && enabledMealSlots.length > 0 && (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold text-brand-50/45 antialiased">
                Meal slot
              </label>
              <select
                value={selectedMealSlot?.key ?? ''}
                onChange={(e) => {
                  if (isMealSlotKey(e.target.value)) {
                    handleMealSlotChange(e.target.value);
                  }
                }}
                className="w-full rounded-full border border-brand-200/50 bg-brand-900 px-4 py-2 text-sm font-semibold text-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-200/30"
              >
                {enabledMealSlots.map((slot) => (
                  <option key={slot.key} value={slot.key}>
                    {slot.label} ({formatTime12h(slot.target_time)})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Content: Food search OR non-food form */}
        {effectiveEntryTab === 'food' ? (
        <>
        {/* Search input — rounded-t-full when drawer is open so it connects to dropdown */}
        <div className="px-6 pt-1">
          <div className="relative">
            <input
              type="search"
              placeholder="Search & Add Food, Meals or Beverages"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full bg-brand-300/40 px-5 py-3.5 pr-12 text-brand-50 placeholder-brand-50/50 text-base focus:outline-none focus:ring-0 focus:ring-white/20 ${
                searchQuery.trim().length >= 2 ? 'rounded-t-2xl rounded-b-none' : 'rounded-full'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowUpcModal(true)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-brand-50 hover:text-white transition-colors"
              aria-label="Scan barcode"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 5v-2a2 2 0 012-2h4M21 5V3a2 2 0 00-2-2h-4M3 19v2a2 2 0 002 2h4M21 19v2a2 2 0 01-2 2h-4" />
                <line x1="7" y1="7" x2="7" y2="17" />
                <line x1="10" y1="7" x2="10" y2="17" />
                <line x1="13" y1="7" x2="13" y2="13" />
                <line x1="16" y1="7" x2="16" y2="17" />
                <line x1="13" y1="15" x2="13" y2="17" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search Results (Phase 3) */}
        {searchQuery.trim().length >= 2 && (
          <div className="px-6 pt-0">
            {isSearching ? (
              <div className="text-brand-50/60 text-sm py-4 text-center">Searching...</div>
            ) : searchResults && searchResults.sections && searchResults.sections.some(s => s.items.length > 0) ? (
              <div className="rounded-b-xl bg-brand-300/40 overflow-hidden">
                {searchDebugEnabled && searchResults.debug && (() => {
                  // Phase E — type the debug payload as the canonical
                  // FoodSearchDebugInfo so any drift between server and
                  // client is a TypeScript error, not a runtime surprise.
                  const debug: FoodSearchDebugInfo = searchResults.debug;
                  return (
                  <details className="m-3 overflow-hidden rounded-2xl border border-white/10 bg-brand-900/35">
                    <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-brand-50/85">
                      Search rationale
                    </summary>
                    <div className="border-t border-white/10 px-4 py-4 space-y-4">
                      <div className="text-xs text-brand-50/65 space-y-1">
                        <p>
                          Normalized query: <span className="text-brand-50/90">{debug.normalizedQuery || '(empty)'}</span>
                        </p>
                        <p>
                          Search mode: <span className="text-brand-50/90">{debug.searchMode}</span>
                        </p>
                        <p>
                          Candidates: <span className="text-brand-50/90">{debug.finalCount}</span>
                          {' '}after filtering, with <span className="text-brand-50/90">{debug.dedupeCount}</span> deduped.
                        </p>
                      </div>

                      {debug.tokens.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {debug.tokens.map((token) => (
                            <span
                              key={token}
                              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] text-brand-50/70"
                            >
                              {token}
                            </span>
                          ))}
                        </div>
                      )}

                      {debug.sectionDebug && debug.sectionDebug.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-50/45">
                            Section Summary
                          </p>
                          {debug.sectionDebug.map((section) => (
                            <div key={section.key} className="rounded-xl bg-white/5 px-3 py-2 text-xs text-brand-50/70">
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-medium text-brand-50/85">{section.label}</span>
                                <span>
                                  {section.shownAfterCap} shown / {section.totalBeforeCap} total
                                </span>
                              </div>
                              {section.top5Items && section.top5Items.length > 0 && (
                                <p className="mt-1 text-brand-50/50">
                                  Top items: {section.top5Items.map((item) => item.brand ? `${item.name} (${item.brand})` : item.name).join(' • ')}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {debug.top10Breakdown.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-50/45">
                            Top Ranking Factors
                          </p>
                          {debug.top10Breakdown.slice(0, 5).map((item) => (
                            <div key={item.id} className="rounded-xl bg-white/5 px-3 py-2 text-xs text-brand-50/70">
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-medium text-brand-50/85">
                                  {item.brand ? `${item.name} (${item.brand})` : item.name}
                                </span>
                                <span className="text-brand-50/55">score {item.score}</span>
                              </div>
                              <p className="mt-1 text-brand-50/50">
                                Matches {item.tokenMatchCount} token groups, brand hits {item.brandGroupHits}, confidence {item.confidence}.
                              </p>
                              <p className="mt-1 text-brand-50/45">
                                Score factors: token {item.scoreBreakdown.tokenScore}, all-token bonus {item.scoreBreakdown.allTokenBonus}, phrase bonus {item.scoreBreakdown.phraseMatchBonus ?? 0}, quality bonus {item.scoreBreakdown.qualityBonus}, thin penalty {item.scoreBreakdown.thinResultPenalty ?? 0}.
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </details>
                  );
                })()}

                {/* Sections rendered in deterministic order (my_foods → common → branded → scanned → other) */}
                {searchResults.sections.map((section, sectionIndex) => {
                  if (section.items.length === 0) return null;
                  // Flat position offset so each item gets a unique position across all sections
                  const sectionOffset = searchResults.sections
                    .slice(0, sectionIndex)
                    .reduce((sum, s) => sum + s.items.length, 0);
                  return (
                    <div key={section.key}>
                      {/* Section header */}
                      <div className={`px-4 py-2 bg-brand-900/50 text-brand-50/50 text-base font-semibold flex items-center justify-between ${sectionIndex > 0 ? 'border-transparent' : ''}`}>
                        <span>{section.label}</span>
                        {section.hasMore && (
                          <span className="text-brand-50/40 font-normal text-sm normal-case">
                            {section.shown} of {section.total}
                          </span>
                        )}
                      </div>
                      {/* Section items */}
                      {section.items.map((result, itemIndex) => {
                        const meta = { source: result.source, position: sectionOffset + itemIndex, query: searchQuery };
                        const resultBadges = getSearchResultBadges(result);
                        const resultNote = getSearchResultNote(result);
                        return (
                          <div
                            key={result.food.id}
                            className="flex items-center gap-2 border-b border-brand-900/50 hover:bg-brand-400/60 transition-colors px-4 py-4"
                          >
                            {/* Food info — tap to add */}
                            <button
                              onClick={() =>
                                handleLogFood(result.food, undefined, meta, {
                                  offNormalization: result.offNormalization,
                                })
                              }
                              className="flex-1 flex flex-col text-left min-w-0"
                            >
                              <span className="text-brand-50 font-semibold text-xl truncate">
                                {formatFoodName(result.food)}
                              </span>
                              <span className="text-brand-50/60 text-sm pt-1 truncate">
                                {formatServing(result.food)} · {formatCalories(result.food.calories)}
                                {result.source === 'off' && (
                                  <span className="ml-2 text-xs text-brand-50/40">
                                    Open Food Facts
                                  </span>
                                )}
                              </span>
                              {resultBadges.length > 0 && (
                                <span className="flex flex-wrap gap-1.5 pt-2">
                                  {resultBadges.map((badge) => (
                                    <span
                                      key={badge.label}
                                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
                                    >
                                      {badge.label}
                                    </span>
                                  ))}
                                </span>
                              )}
                              {resultNote && (
                                <span className="pt-2 text-xs leading-5 text-brand-50/45">
                                  {resultNote}
                                </span>
                              )}
                            </button>

                            {/* Add button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLogFood(result.food, undefined, meta, {
                                  offNormalization: result.offNormalization,
                                });
                              }}
                              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-brand-50/60 hover:text-brand-50 hover:bg-brand-500/60 transition-colors"
                              aria-label="Add to log"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          </div>
                        );
                      })}
                      {/* Show more button */}
                      {section.hasMore && (
                        <button
                          type="button"
                          disabled={loadingMoreSections.has(section.key as SectionKey)}
                          className="w-full px-4 py-2.5 text-brand-50/50 text-sm hover:text-brand-50/70 hover:bg-brand-400/60 transition-colors text-center border-t border-white/[0.06] disabled:opacity-50 disabled:cursor-wait"
                          onClick={() => handleShowMore(section.key as SectionKey)}
                        >
                          {loadingMoreSections.has(section.key as SectionKey) 
                            ? 'Loading...' 
                            : `Show more ${section.label.toLowerCase()} (${section.total - section.shown} remaining)`
                          }
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : searchResults && searchResults.totalCount === 0 ? (
              <div className="text-brand-50/60 text-sm py-4 text-center">
                No foods found for &quot;{searchQuery}&quot;
              </div>
            ) : null}
          </div>
        )}

        {/* Create Custom Item button — always visible, below search results or below search input */}
        <div className="px-6 pt-3">
          <button
            type="button"
            onClick={() => setShowCustomModal(true)}
            className="w-full py-3.5 rounded-full border border-brand-200/50 text-brand-200/50 hover:text-brand-200 hover:bg-white/5 text-base font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Create custom item
          </button>
        </div>
        </>
        ) : (
        /* Non-food form — water, supplement, mood, bowel, cycle, movement, blood_pressure */
        <div className="px-6 pt-4 pb-2">
            {effectiveEntryTab === 'water' && <WaterForm onSubmit={handleCreateNonFoodEntry} isSubmitting={nonFoodSubmitting} />}
            {effectiveEntryTab === 'sleep' && <SleepForm onSubmit={handleCreateNonFoodEntry} isSubmitting={nonFoodSubmitting} />}
            {effectiveEntryTab === 'supplements' && <SupplementForm onSubmit={handleCreateNonFoodEntry} isSubmitting={nonFoodSubmitting} />}
            {effectiveEntryTab === 'mood' && <MoodForm onSubmit={handleCreateNonFoodEntry} isSubmitting={nonFoodSubmitting} />}
            {effectiveEntryTab === 'bowel' && <BowelForm onSubmit={handleCreateNonFoodEntry} isSubmitting={nonFoodSubmitting} />}
            {effectiveEntryTab === 'cycle' && <CycleForm onSubmit={handleCreateNonFoodEntry} isSubmitting={nonFoodSubmitting} />}
            {effectiveEntryTab === 'movement' && <MovementForm onSubmit={handleCreateNonFoodEntry} isSubmitting={nonFoodSubmitting} />}
            {effectiveEntryTab === 'blood_pressure' && <BloodPressureForm onSubmit={handleCreateNonFoodEntry} isSubmitting={nonFoodSubmitting} />}
        </div>
        )}

        {/* Logged section — filtered by the active entry-type tab */}
        {filteredEntries.length > 0 && (
          <section className="px-6 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-brand-50 text-xl font-semibold">Logged</h2>
              <div className="flex items-center gap-2">
                {undoFeedback && (
                  <span className="text-sm text-brand-200">{undoFeedback}</span>
                )}
                {lastAddedEntryIds.length > 0 && !undoFeedback && (
                  <button
                    onClick={handleUndo}
                    disabled={undoLoading}
                    className="text-sm text-brand-50/60 hover:text-brand-50 transition-colors disabled:opacity-50"
                  >
                    {undoLoading ? 'Undoing...' : 'Undo'}
                  </button>
                )}
              </div>
            </div>
            <div className="rounded-2xl bg-brand-300/40 overflow-hidden">
              {filteredEntries.map((entry, index) => (
                <div key={entry.id}>
                  {index > 0 && <div className="border-t border-white/[0.06]" />}
                  {entry.type !== 'intake' ? (
                    <CompactLoggedCard
                      entry={entry}
                      editHref={`${APP_ROUTE_BUILDERS.logEntry(entry.id)}?redirect=${encodeURIComponent(router.asPath || APP_ROUTES.logNew)}`}
                      onDelete={handleDeleteEntry}
                    />
                  ) : (() => {
                    const p = entry.payload as { name?: string; quantity?: number; unit?: string; servingSizeG?: number; measures?: Array<{ unit: string; grams: number; label?: string }>; macros?: { protein?: number; carbs?: number; fat?: number }; foodObjectId?: string };
                    const override = entryOverrides[entry.id];
                    const ssg = p.servingSizeG;
                    const entryMeasures = p.measures ?? null;
                    let servingQty: number;
                    if (override) {
                      if (override.unit === 'g' && ssg && ssg > 0) {
                        servingQty = override.value / ssg;
                      } else if (override.unit === 'serving') {
                        servingQty = override.value;
                      } else if (override.unit !== 'g' && override.unit !== 'serving' && entryMeasures) {
                        const m = entryMeasures.find((m) => m.unit.toLowerCase() === override.unit.toLowerCase());
                        if (m && m.grams > 0 && ssg && ssg > 0) {
                          servingQty = (override.value * m.grams) / ssg;
                        } else {
                          servingQty = p.quantity ?? 1;
                        }
                      } else {
                        servingQty = p.quantity ?? 1;
                      }
                    } else {
                      servingQty = p.quantity ?? 1;
                    }

                    const proteinG = (p.macros?.protein ?? 0) * servingQty;
                    const carbsG = (p.macros?.carbs ?? 0) * servingQty;
                    const fatG = (p.macros?.fat ?? 0) * servingQty;
                    return (
                      <LoggedItemCard
                        id={entry.id}
                        name={formatFoodNameString(p.name ?? 'Untitled')}
                        quantity={override ? (override.unit === 'serving' ? override.value : servingQty) : (p.quantity ?? 1)}
                        unit={override?.unit ?? p.unit ?? 'serving'}
                        quantityG={override?.unit === 'g' ? override.value : entry.quantityG}
                        servingSizeG={ssg}
                        measures={entryMeasures}
                        protein={proteinG}
                        carbs={carbsG}
                        fat={fatG}
                        editHref={`${APP_ROUTE_BUILDERS.logEntry(entry.id)}?redirect=${encodeURIComponent(router.asPath || APP_ROUTES.logNew)}`}
                        onDelete={handleDeleteEntry}
                        onEntryChange={handleEntryChange}
                        foodObjectId={p.foodObjectId}
                        isFavorited={p.foodObjectId ? favoriteIds.has(p.foodObjectId) : false}
                        onToggleFavorite={handleToggleFavorite}
                      />
                    );
                  })()}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Per-tab contextual bottom sections (non-food tabs) */}
        {effectiveEntryTab === 'water' && filteredEntries.length > 0 && (() => {
          const totalOz = filteredEntries.reduce((sum, e) => {
            const p = e.payload as { amount?: number; unit?: string };
            if (!p.amount) return sum;
            return sum + (p.unit === 'ml' ? p.amount / 29.574 : p.amount);
          }, 0);
          const goalOz = 64;
          const pct = Math.min(100, Math.round((totalOz / goalOz) * 100));
          return (
            <section className="px-6 pt-4">
              <div className="rounded-2xl bg-brand-300/40 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-brand-50/80 text-sm font-medium">Block Total</span>
                  <span className="text-brand-50 text-sm font-semibold">{Math.round(totalOz)} oz</span>
                </div>
                <div className="w-full h-2 rounded-full bg-brand-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-200 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-brand-50/50 text-xs mt-1.5">{pct}% of {goalOz} oz daily goal</p>
              </div>
            </section>
          );
        })()}

        {effectiveEntryTab === 'supplements' && filteredEntries.length > 0 && (() => {
          const names = Array.from(new Set(filteredEntries.map((e) => (e.payload as { name?: string }).name).filter(Boolean))) as string[];
          if (names.length === 0) return null;
          return (
            <section className="px-6 pt-4">
              <div className="rounded-2xl bg-brand-300/40 p-4">
                <p className="text-brand-50/80 text-sm font-medium mb-2">Quick Re-log</p>
                <div className="flex flex-wrap gap-2">
                  {names.slice(0, 8).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleCreateNonFoodEntry({ name: n })}
                      disabled={nonFoodSubmitting}
                      className="px-3 py-1.5 rounded-full bg-brand-700 text-brand-50 text-sm hover:bg-brand-600 transition-colors disabled:opacity-50"
                    >
                      + {n}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          );
        })()}

        {/* Bottom tabs: Saved Meals (with dropdown) / Favorites / History — food tab only */}
        {effectiveEntryTab === 'food' && (<>
        <section className="px-6 pt-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="relative inline-flex items-center" ref={savedMealsDropdownRef}>
              <button
                type="button"
                onClick={() => setBottomTab('saved')}
                className={`inline-flex items-center gap-1 text-xl font-semibold pb-1 transition-colors shrink-0 ${
                  bottomTab === 'saved'
                    ? 'text-white border-white'
                    : 'text-white/50 border-transparent hover:text-white/70'
                }`}
              >
                Saved Meals
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setSavedMealsDropdownOpen((o) => !o); }}
                className={`inline-flex items-center justify-center p-1 shrink-0 transition-colors pb-2 border-b-2 border-transparent ${
                  bottomTab === 'saved'
                    ? 'text-white'
                    : 'text-white/50 hover:text-white/70'
                }`}
                aria-label="Saved meals options"
                aria-expanded={savedMealsDropdownOpen}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 9l6 7 6-7H6z" />
                </svg>
              </button>
              {savedMealsDropdownOpen && (
                <div
                  className="absolute left-0 top-full mt-1 z-20 min-w-[160px] rounded-lg bg-brand-800 border border-white/20 shadow-lg py-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Link
                    href={`/journal/meals/create?block=${currentMealBlock}&date=${dateKey}&redirect=${encodeURIComponent(router.asPath || APP_ROUTES.logNew)}`}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/90 hover:bg-white/10 transition-colors"
                    onClick={() => setSavedMealsDropdownOpen(false)}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Create meal
                  </Link>
                  <Link
                    href={`/journal/meals?redirect=${encodeURIComponent(router.asPath || redirectTarget)}`}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/90 hover:bg-white/10 transition-colors"
                    onClick={() => setSavedMealsDropdownOpen(false)}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit meals
                  </Link>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setBottomTab('favorites')}
              className={`text-xl font-semibold pb-1 mx-2 transition-colors ${
                bottomTab === 'favorites'
                  ? 'text-white border-white'
                  : 'text-white/50 border-transparent hover:text-white/70'
              }`}
            >
              Favorites
            </button>
            <button
              type="button"
              onClick={() => setBottomTab('history')}
              className={`text-xl font-semibold pb-1 mx-2 transition-colors ${
                bottomTab === 'history'
                  ? 'text-white border-white'
                  : 'text-white/50 border-transparent hover:text-white/70'
              }`}
            >
              History
            </button>
          </div>

          {/* History filter controls (Recent | Repeat from) */}
          {bottomTab === 'history' && (
            <div className="px-0 pt-3 pb-1">
              {/* Segmented control */}
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setHistoryFilter('recent')}
                  className={`px-0 py-1.5 text-base font-semibold transition-colors ${
                    historyFilter === 'recent'
                      ? 'text-brand-50'
                      : 'text-brand-50/50 hover:text-brand-50/80'
                  }`}
                >
                  Recent
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('repeat')}
                  className={`pl-6 py-1.5 rounded-full text-base font-semibold transition-colors ${
                    historyFilter === 'repeat'
                      ? 'text-brand-50'
                      : 'text-brand-50/50 hover:text-brand-50/80'
                  }`}
                >
                  Repeat from
                </button>
              </div>

              {/* Repeat from: date + block picker */}
              {historyFilter === 'repeat' && (
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    type="date"
                    value={repeatDate}
                    onChange={(e) => setRepeatDate(e.target.value)}
                    className="repeat-date-calendar-icon px-3 py-1.5 rounded-full border border-brand-200/50 bg-brand-900 text-brand-50 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-brand-200/30"
                  />
                  <select
                    value={repeatBlock}
                    onChange={(e) => setRepeatBlock(e.target.value as TimeBlock)}
                    className="repeat-block-select px-3 py-2 rounded-full border border-brand-200/50 bg-brand-900 text-brand-50 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-brand-200/30"
                  >
                    <option value="morning">Morning</option>
                    <option value="midday">Midday</option>
                    <option value="evening">Evening</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Horizontal scroll cards — with left/right chevrons when overflow (Saved Meals, Favorites, History) */}
          <div className="relative -mx-4">
            {savedMealsCanScrollLeft && (
              <button
                type="button"
                onClick={() => savedMealsScrollRef.current?.scrollBy({ left: -200, behavior: 'smooth' })}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center text-brand-50/25 hover:text-brand-50/80 hover:bg-brand-900/80 py-[35px] pl-[2px] pr-[0px] transition-colors rounded-tl rounded-tl"
                aria-label="Scroll left"
              >
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}
            {savedMealsCanScrollRight && (
              <button
                type="button"
                onClick={() => savedMealsScrollRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center text-brand-50/25 hover:text-brand-50/80 hover:bg-brand-900/80 py-[35px] pl-[0px] pr-[2px] transition-colors rounded-tr rounded-br"
                aria-label="Scroll right"
              >
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            )}
            <div
              ref={savedMealsScrollRef}
              onScroll={updateSavedMealsScrollState}
              className="flex gap-3 overflow-x-auto py-4 px-6 scrollbar-hide"
            >
              {bottomTab === 'saved' && savedMeals.length === 0 && (
                <p className="text-white/40 text-sm py-4">No saved meals yet.</p>
              )}
              {bottomTab === 'saved' && savedMeals.length > 0 && savedMeals.map((meal) => (
                <SavedMealCard
                  key={meal.id}
                  id={meal.id}
                  name={meal.name}
                  nutritionDensity={meal.nutritionDensity}
                  onClick={() => handleApplySavedMeal(meal)}
                />
              ))}

              {/* Favorites Tab */}
              {bottomTab === 'favorites' && favoritesLoading && (
                <p className="text-white/40 text-sm py-4">Loading favorites...</p>
              )}
              {bottomTab === 'favorites' && !favoritesLoading && favorites.length === 0 && (
                <div className="flex flex-col items-start py-4">
                  <p className="text-white/40 text-sm">No favorites yet.</p>
                  <p className="text-white/30 text-xs mt-1">Tap the star on an item to save it here.</p>
                </div>
              )}
              {bottomTab === 'favorites' && !favoritesLoading && favorites.length > 0 && favorites.map((food) => (
                <button
                  key={food.id}
                  onClick={() => handleLogFood(food)}
                  className="relative flex-shrink-0 w-[200px] h-[100px] rounded-xl bg-white/5 p-4 text-left hover:bg-white/10 transition-colors flex flex-col"
                >
                  {/* Unfavorite (heart) button — top-right of card */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleFavorite(food.id);
                    }}
                    className="absolute top-3 right-3 p-1 text-brand-50/40 opacity-90 hover:opacity-100 transition-opacity"
                    aria-label="Remove from favorites"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  </button>
                  <h4 className="text-brand-50 font-semibold text-base mb-0 line-clamp-2 pr-6">
                    {food.brandName ? `${food.canonicalName} (${food.brandName})` : food.canonicalName}
                  </h4>
                  <p className="text-brand-50 font-light text-sm">
                    {food.calories !== null && <span>{food.calories} cal</span>}
                    {food.servingSizeG && food.servingUnit && (
                      <span>{food.calories != null ? ' · ' : ''}{food.servingSizeG}g {food.servingUnit}</span>
                    )}
                  </p>
                </button>
              ))}

              {/* History Tab — Recent Mode */}
              {bottomTab === 'history' && historyFilter === 'recent' && historyLoading && (
                <p className="text-white/40 text-sm py-4">Loading history...</p>
              )}
              {bottomTab === 'history' && historyFilter === 'recent' && !historyLoading && historyFoods.length === 0 && (
                <p className="text-white/40 text-sm py-4">No history yet.</p>
              )}
              {bottomTab === 'history' && historyFilter === 'recent' && !historyLoading && historyFoods.length > 0 && historyFoods.map((item) => (
                <button
                  key={item.foodObjectId}
                  onClick={() => handleLogFromHistory(item)}
                  className="flex-shrink-0 w-[200px] h-[100px] rounded-xl bg-white/5 p-4 text-left hover:bg-white/10 transition-colors flex flex-col justify-between"
                >
                  <h4 className="text-brand-50 font-semibold text-base mb-0 line-clamp-2">
                    {formatFoodNameString(item.name)}
                  </h4>
                  <p className="text-brand-50 font-light text-sm">
                    {item.calories !== null && <span>{item.calories} cal</span>}
                    {item.servingSizeG && item.servingUnit && (
                      <span>{item.calories != null ? ' · ' : ''}{item.servingSizeG}g {item.servingUnit}</span>
                    )}
                  </p>
                </button>
              ))}

              {/* History Tab — Repeat From Mode */}
              {bottomTab === 'history' && historyFilter === 'repeat' && repeatLoading && (
                <p className="text-white/40 text-sm py-4">Loading...</p>
              )}
              {bottomTab === 'history' && historyFilter === 'repeat' && !repeatLoading && repeatFoods.length === 0 && (
                <p className="text-white/40 text-sm py-4">Nothing logged in that block.</p>
              )}
              {bottomTab === 'history' && historyFilter === 'repeat' && !repeatLoading && repeatFoods.length > 0 && repeatFoods.map((item) => (
                <button
                  key={item.foodObjectId}
                  onClick={() => handleLogFromHistory(item)}
                  className="flex-shrink-0 w-[200px] h-[100px] rounded-xl bg-white/5 p-4 text-left hover:bg-white/10 transition-colors flex flex-col justify-between"
                >
                  <h4 className="text-brand-50 font-semibold text-base mb-0 line-clamp-2">
                    {formatFoodNameString(item.name)}
                  </h4>
                  <p className="text-brand-50 font-light text-sm">
                    {item.calories !== null && <span>{item.calories} cal</span>}
                    {item.servingSizeG && item.servingUnit && (
                      <span>{item.calories != null ? ' · ' : ''}{item.servingSizeG}g {item.servingUnit}</span>
                    )}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Create meal from logged — enabled when at least 1 intake in current day+block */}
        {entries.length > 0 && (
          <div className="px-6 pb-8">
            <Link
              href={`/journal/meals/create?block=${currentMealBlock}&date=${dateKey}&redirect=${encodeURIComponent(router.asPath || APP_ROUTES.logNew)}`}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-full border border-brand-200/50 text-brand-200/50 hover:text-brand-200/100 hover:bg-white/5 text-base font-semibold transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create meal from logged
            </Link>
          </div>
        )}
        {/* end food-only bottom section */}
        </>)}
        </div>
      </main>

      {/* Barcode Scanner Modal (camera + manual fallback) */}
      {showUpcModal && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => { setShowUpcModal(false); setUpcInput(''); setUpcError(null); }}
        />
      )}

      {/* UPC lookup status overlay */}
      {upcLoading && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-brand-800 rounded-xl px-8 py-6 text-center shadow-xl">
            <div className="animate-spin w-8 h-8 border-2 border-brand-200 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-brand-50 text-sm">Looking up barcode…</p>
          </div>
        </div>
      )}

      {/* UPC error toast */}
      {upcError && !showUpcModal && (
        <div className="fixed bottom-24 left-4 right-4 z-[60] flex justify-center">
          <div className="bg-red-900/90 border border-red-400/30 text-red-200 text-sm px-5 py-3 rounded-xl shadow-lg max-w-md text-center">
            {upcError}
            <button
              onClick={() => setUpcError(null)}
              className="ml-3 text-red-300 hover:text-red-100 font-medium"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Create Custom Item Modal (Phase 3C) */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-brand-800 rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-semibold text-brand-50">Create Custom Item</h2>
              <button
                onClick={() => { setShowCustomModal(false); resetCustomForm(); }}
                className="p-1 text-brand-50/60 hover:text-brand-50 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable form content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Name (required) */}
              <div>
                <label className="block text-brand-50/80 text-sm font-medium mb-1.5">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g., Homemade Granola"
                  className="w-full px-4 py-3 rounded-lg bg-brand-700 text-brand-50 placeholder-brand-50/50 focus:outline-none focus:ring-2 focus:ring-brand-200/30"
                  autoFocus
                />
              </div>

              {/* Calories */}
              <div>
                <label className="block text-brand-50/80 text-sm font-medium mb-1.5">
                  Calories (kcal)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={customCalories}
                  onChange={(e) => setCustomCalories(e.target.value)}
                  placeholder="e.g., 250"
                  min="0"
                  className="w-full px-4 py-3 rounded-lg bg-brand-700 text-brand-50 placeholder-brand-50/50 focus:outline-none focus:ring-2 focus:ring-brand-200/30"
                />
              </div>

              {/* Macros row */}
              <div>
                <label className="block text-brand-50/80 text-sm font-medium mb-1.5">
                  Macros (grams)
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={customProtein}
                      onChange={(e) => setCustomProtein(e.target.value)}
                      placeholder="Protein"
                      min="0"
                      className="w-full px-3 py-2.5 rounded-lg bg-brand-700 text-brand-50 placeholder-brand-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200/30"
                    />
                    <span className="block text-brand-50/50 text-xs mt-1 text-center">Protein</span>
                  </div>
                  <div>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={customCarbs}
                      onChange={(e) => setCustomCarbs(e.target.value)}
                      placeholder="Carbs"
                      min="0"
                      className="w-full px-3 py-2.5 rounded-lg bg-brand-700 text-brand-50 placeholder-brand-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200/30"
                    />
                    <span className="block text-brand-50/50 text-xs mt-1 text-center">Carbs</span>
                  </div>
                  <div>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={customFat}
                      onChange={(e) => setCustomFat(e.target.value)}
                      placeholder="Fat"
                      min="0"
                      className="w-full px-3 py-2.5 rounded-lg bg-brand-700 text-brand-50 placeholder-brand-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200/30"
                    />
                    <span className="block text-brand-50/50 text-xs mt-1 text-center">Fat</span>
                  </div>
                </div>
              </div>

              {/* Serving info */}
              <div>
                <label className="block text-brand-50/80 text-sm font-medium mb-1.5">
                  Serving
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={customServingSizeG}
                    onChange={(e) => setCustomServingSizeG(e.target.value)}
                    placeholder="Size (g)"
                    min="0.1"
                    className="w-full px-4 py-3 rounded-lg bg-brand-700 text-brand-50 placeholder-brand-50/50 focus:outline-none focus:ring-2 focus:ring-brand-200/30"
                  />
                  <input
                    type="text"
                    value={customServingUnit}
                    onChange={(e) => setCustomServingUnit(e.target.value)}
                    placeholder="Unit (e.g., cup)"
                    className="w-full px-4 py-3 rounded-lg bg-brand-700 text-brand-50 placeholder-brand-50/50 focus:outline-none focus:ring-2 focus:ring-brand-200/30"
                  />
                </div>
                <input
                  type="text"
                  value={customServingDescription}
                  onChange={(e) => setCustomServingDescription(e.target.value)}
                  placeholder="Description (e.g., 1 cup chopped)"
                  className="w-full mt-3 px-4 py-3 rounded-lg bg-brand-700 text-brand-50 placeholder-brand-50/50 focus:outline-none focus:ring-2 focus:ring-brand-200/30"
                />
              </div>

              {/* Micronutrients toggle */}
              <div className="border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => setShowMicronutrients(!showMicronutrients)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <span className="text-brand-50/80 text-sm font-medium">
                    Micronutrients
                    <span className="text-brand-50/50 text-xs ml-2">(Advanced)</span>
                  </span>
                  <div className={`w-10 h-6 rounded-full transition-colors ${showMicronutrients ? 'bg-brand-200' : 'bg-brand-700'} relative`}>
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${showMicronutrients ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                </button>
              </div>

              {/* Advanced micronutrient fields */}
              {showMicronutrients && (
                <div className="space-y-4 pl-2 border-l-2 border-brand-200/30">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-brand-50/60 text-xs mb-1">Fiber (g)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={customFiber}
                        onChange={(e) => setCustomFiber(e.target.value)}
                        placeholder="0"
                        min="0"
                        className="w-full px-3 py-2 rounded-lg bg-brand-700 text-brand-50 placeholder-brand-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200/30"
                      />
                    </div>
                    <div>
                      <label className="block text-brand-50/60 text-xs mb-1">Sugar (g)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={customSugar}
                        onChange={(e) => setCustomSugar(e.target.value)}
                        placeholder="0"
                        min="0"
                        className="w-full px-3 py-2 rounded-lg bg-brand-700 text-brand-50 placeholder-brand-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200/30"
                      />
                    </div>
                    <div>
                      <label className="block text-brand-50/60 text-xs mb-1">Sodium (mg)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={customSodium}
                        onChange={(e) => setCustomSodium(e.target.value)}
                        placeholder="0"
                        min="0"
                        className="w-full px-3 py-2 rounded-lg bg-brand-700 text-brand-50 placeholder-brand-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200/30"
                      />
                    </div>
                  </div>

                  {/* Additional nutrients JSON */}
                  <div>
                    <label className="block text-brand-50/60 text-xs mb-1">
                      Additional Nutrients (JSON)
                    </label>
                    <textarea
                      value={customNutrientsExtended}
                      onChange={(e) => setCustomNutrientsExtended(e.target.value)}
                      placeholder='{"vitamin_a_iu": 500, "calcium_mg": 100}'
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg bg-brand-700 text-brand-50 placeholder-brand-50/50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-200/30 resize-none"
                    />
                    <p className="text-brand-50/40 text-xs mt-1">
                      Optional. Enter as JSON object with numeric values.
                    </p>
                  </div>
                </div>
              )}

              {/* Save to favorites toggle */}
              <div className="flex items-center justify-between">
                <span className="text-brand-50/80 text-sm">Save to Favorites</span>
                <button
                  type="button"
                  onClick={() => setCustomSaveToFavorites(!customSaveToFavorites)}
                  className={`w-10 h-6 rounded-full transition-colors ${customSaveToFavorites ? 'bg-brand-200' : 'bg-brand-700'} relative`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${customSaveToFavorites ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Error message */}
              {customError && (
                <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30">
                  <p className="text-red-300 text-sm">{customError}</p>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="px-6 py-4 border-t border-white/10 flex gap-3 shrink-0">
              <button
                onClick={() => { setShowCustomModal(false); resetCustomForm(); }}
                className="flex-1 py-3 rounded-lg border border-white/20 text-brand-50 font-medium hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCustomFood}
                disabled={customLoading || !customName.trim()}
                className="flex-1 py-3 rounded-lg bg-brand-200 text-brand-900 font-semibold hover:bg-brand-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {customLoading ? 'Creating...' : 'Create & Log'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
