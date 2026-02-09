'use client';

import { useRouter } from 'next/router';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { getSafeRedirectTarget } from '@/lib/redirectHelpers';
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
  TIME_BLOCK_DEFAULTS,
} from '@/lib/journal';
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
  type CreateCustomFoodInput,
  type SectionKey,
} from '@/lib/food';
import { LoggedItemCard } from '@/components/journal/LoggedItemCard';
import { SavedMealCard } from '@/components/journal/SavedMealCard';

type EntryTab = 'food' | 'water' | 'supplements' | 'mood' | 'bowel' | 'cycle' | 'movement';
type BottomTab = 'saved' | 'favorites' | 'history';
type HistoryFilter = 'recent' | 'repeat';

// All entry type tabs in default order
const ALL_ENTRY_TABS: { id: EntryTab; label: string; disabled: boolean }[] = [
  { id: 'food', label: 'Food / Drinks', disabled: false },
  { id: 'water', label: 'Water', disabled: true },
  { id: 'supplements', label: 'Supplements', disabled: true },
  { id: 'mood', label: 'Mood', disabled: true },
  { id: 'bowel', label: 'Bowel', disabled: true },
  { id: 'cycle', label: 'Cycle', disabled: true },
  { id: 'movement', label: 'Movement', disabled: true },
];

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

export default function JournalLogPage() {
  const router = useRouter();
  const q = (router.query ?? {}) as Record<string, string | undefined>;
  const block = (q.block ?? 'morning') as TimeBlock;
  const timeParam = q.time ?? TIME_BLOCK_DEFAULTS[block];
  const dateParam = q.date;
  const redirectTarget = getSafeRedirectTarget(q.redirect ?? null, '/journal');

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
  const [savedMeals, setSavedMeals] = useState<MealTemplate[]>([]);

  // Food search state (Phase 3)
  const [searchResults, setSearchResults] = useState<FoodSearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const [loadingMoreSections, setLoadingMoreSections] = useState<Set<SectionKey>>(new Set());
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

  // Undo state for last add batch
  const [lastAddedEntryIds, setLastAddedEntryIds] = useState<string[]>([]);
  const [undoFeedback, setUndoFeedback] = useState<string | null>(null);
  const [undoLoading, setUndoLoading] = useState(false);

  function updateSavedMealsScrollState() {
    const el = savedMealsScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setSavedMealsCanScrollLeft(scrollLeft > 2);
    setSavedMealsCanScrollRight(scrollLeft < scrollWidth - clientWidth - 2);
  }

  // Looping tab carousel: selected tab pinned left, others rotate
  const unselectedTabs = ALL_ENTRY_TABS.filter(t => t.id !== entryTab);
  const [tabRotation, setTabRotation] = useState(0);

  // Get rotated order of unselected tabs
  const rotatedTabs = [
    ...unselectedTabs.slice(tabRotation % unselectedTabs.length),
    ...unselectedTabs.slice(0, tabRotation % unselectedTabs.length),
  ];

  // Rotate tabs when chevron is clicked
  const handleChevronClick = () => {
    setTabRotation((prev) => prev + 1);
  };

  // Get the selected tab info
  const selectedTabInfo = ALL_ENTRY_TABS.find(t => t.id === entryTab)!;

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

  const date = parseDateParam(dateParam);
  const dateKey = toDateKey(date);

  const refreshEntries = async () => {
    const list = await journalService.listEntriesByDay(date);
    // Filter by local date first (server returns wide window), then by block
    const filtered = list.filter((e) => {
      const entryDateKey = toDateKey(e.timestamp);
      return entryDateKey === dateKey && deriveBlock(e.timestamp) === block;
    });
    setEntries(filtered);
  };

  useEffect(() => {
    refreshEntries();
  }, [dateKey, block]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await foodService.search(searchQuery.trim(), { limit: 15 });
        setSearchResults(results);
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
  }, [searchQuery]);

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
        12 // sectionLimit
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
  }, [searchResults, searchQuery]);

  // Log food from search result
  const handleLogFood = async (food: FoodObject) => {
    const occurredAt = setTimeOnDate(new Date(date.getTime()), selectedTime);
    const createdEntry = await journalService.createEntry({
      type: 'intake',
      date,
      time: selectedTime,
      block,
      occurredAt,
      payload: {
        // Use formatFoodName for consistent display (sanitizes USDA IDs + apostrophe casing)
        name: formatFoodName(food),
        quantity: 1,
        unit: food.servingUnit,
        calories: food.calories ?? undefined,
        macros: food.proteinG !== null || food.carbsG !== null || food.fatG !== null
          ? {
              protein: food.proteinG ?? undefined,
              carbs: food.carbsG ?? undefined,
              fat: food.fatG ?? undefined,
            }
          : undefined,
        foodObjectId: food.id,
        servingSizeG: food.servingSizeG,
      },
    });
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
    const createdEntry = await journalService.createEntry({
      type: 'intake',
      date,
      time: selectedTime,
      block,
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

    // Create entries for each item in the template, collect IDs for undo
    const createdIds: string[] = [];
    for (const item of meal.items) {
      const createdEntry = await journalService.createEntry({
        type: 'intake',
        date,
        time: selectedTime,
        block,
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

  // UPC lookup
  const handleUpcLookup = async () => {
    if (!upcInput || upcInput.length < 8) {
      setUpcError('Please enter a valid UPC code (8+ digits)');
      return;
    }

    setUpcLoading(true);
    setUpcError(null);

    try {
      const result = await foodService.lookupUpc(upcInput.trim());
      if (result.found && result.food) {
        await handleLogFood(result.food);
        setShowUpcModal(false);
        setUpcInput('');
      } else {
        setUpcError('Product not found. Try searching instead.');
      }
    } catch (error) {
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
        {/* Entry type tabs — looping carousel with selected tab pinned left */}
        <div className="px-6 pt-1">
          <div className="relative rounded-full border-[1.5px] border-brand-200/50 overflow-hidden">
            {/* Tab container — scrollable + chevron rotation */}
            <div className="flex items-center pr-8 overflow-x-auto scrollbar-hide">
              {/* Selected tab — always first/pinned */}
              <button
                type="button"
                className="shrink-0 whitespace-nowrap py-1.5 px-4 rounded-full text-2xl font-semibold border-[1.5px] border-brand-50 text-brand-50"
              >
                {selectedTabInfo.label}
              </button>

              {/* Unselected tabs — rotated order */}
              {rotatedTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => !tab.disabled && setEntryTab(tab.id)}
                  className={`shrink-0 whitespace-nowrap py-1.5 px-4 rounded-full text-2xl font-semibold transition-colors ${
                    tab.disabled
                      ? 'text-brand-200/50'
                      : 'text-white/60 hover:text-white cursor-pointer'
                  }`}
                  disabled={tab.disabled}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Chevron button — rotates tabs when clicked */}
            <button
              type="button"
              onClick={handleChevronClick}
              className="absolute right-0 top-0 bottom-0 flex items-center pl-6 pr-0 bg-gradient-to-r from-transparent to-brand-900 to-40%"
              aria-label="Rotate tabs"
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
                onChange={(e) => setSelectedTime(e.target.value)}
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
                onClick={() => setSelectedTime(adjustHour(selectedTime, 1))}
                className="px-0.5 py-0 text-white/60 hover:text-white transition-colors leading-none"
                aria-label="Increase hour"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setSelectedTime(adjustHour(selectedTime, -1))}
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
        </div>

        {/* Search input */}
        <div className="px-6 pt-1">
          <div className="relative">
            <input
              type="search"
              placeholder="Search & Add Food, Meals or Beverages"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-full bg-brand-300 px-5 py-3.5 pr-12 text-brand-50 placeholder-brand-50/75 text-base focus:outline-none focus:ring-2 focus:ring-white/20"
            />
            <button
              type="button"
              onClick={() => setShowUpcModal(true)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-brand-50 hover:text-white transition-colors"
              aria-label="Scan barcode"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search Results (Phase 3) */}
        {searchQuery.trim().length >= 2 && (
          <div className="px-6 pt-3">
            {isSearching ? (
              <div className="text-brand-50/60 text-sm py-4 text-center">Searching...</div>
            ) : searchResults && searchResults.sections && searchResults.sections.some(s => s.items.length > 0) ? (
              <div className="rounded-xl border border-white/10 overflow-hidden">
                {/* Sections rendered in deterministic order (my_foods → common → branded → scanned → other) */}
                {searchResults.sections.map((section, sectionIndex) => {
                  if (section.items.length === 0) return null;
                  return (
                    <div key={section.key}>
                      {/* Section header */}
                      <div className={`px-4 py-2 bg-white/5 text-brand-50/60 text-xs font-medium uppercase tracking-wide flex items-center justify-between ${sectionIndex > 0 ? 'border-t border-white/10' : ''}`}>
                        <span>{section.label}</span>
                        {section.hasMore && (
                          <span className="text-brand-50/40 font-normal normal-case">
                            {section.shown} of {section.total}
                          </span>
                        )}
                      </div>
                      {/* Section items */}
                      {section.items.map((result) => {
                        const isFav = favoriteIds.has(result.food.id);
                        return (
                          <div
                            key={result.food.id}
                            className="flex items-center border-t border-white/5 hover:bg-white/5 transition-colors"
                          >
                            <button
                              onClick={() => handleLogFood(result.food)}
                              className="flex-1 px-4 py-3 flex items-center text-left min-w-0"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-brand-50 font-medium truncate">
                                  {formatFoodName(result.food)}
                                </div>
                                <div className="text-brand-50/60 text-sm truncate">
                                  {formatServing(result.food)} · {formatCalories(result.food.calories)}
                                </div>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleFavorite(result.food.id);
                              }}
                              className={`shrink-0 p-2.5 flex items-center justify-center transition-opacity ${isFav ? 'text-brand-50/40 opacity-90 hover:opacity-100' : 'text-brand-50/30 hover:text-brand-50/50'}`}
                              aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
                            >
                              <svg className="w-5 h-5" fill={isFav ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={isFav ? 0 : 1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLogFood(result.food)}
                              className="shrink-0 p-2.5 flex items-center justify-center text-brand-50/40 hover:opacity-100 transition-opacity"
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
                          className="w-full px-4 py-2.5 text-brand-50/50 text-sm hover:text-brand-50/70 hover:bg-white/5 transition-colors text-center border-t border-white/5 disabled:opacity-50 disabled:cursor-wait"
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
                No foods found for "{searchQuery}"
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

        {/* Logged section — only shown when there is at least one item */}
        {entries.length > 0 && (
          <section className="px-6 pt-6">
            <div className="flex items-center justify-between mb-3">
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
            <div className="rounded-xl border border-white/10">
              {entries.map((entry, index) => (
                <div key={entry.id}>
                  {index > 0 && <div className="border-t border-white/10" />}
                  {(() => {
                    // Macro values in grams, scaled by quantity
                    // payload.macros stores per-serving; payload.quantity is the multiplier
                    const qty = entry.payload.quantity ?? 1;
                    const proteinG = (entry.payload.macros?.protein ?? 0) * qty;
                    const carbsG = (entry.payload.macros?.carbs ?? 0) * qty;
                    const fatG = (entry.payload.macros?.fat ?? 0) * qty;
                    return (
                      <LoggedItemCard
                        id={entry.id}
                        // Format stored name (sanitize USDA IDs + fix apostrophe casing)
                        name={formatFoodNameString(entry.payload.name ?? 'Untitled')}
                        serving={`${entry.payload.quantity ?? 1} ${entry.payload.unit ?? 'Serving'}`}
                        protein={proteinG}
                        carbs={carbsG}
                        fat={fatG}
                        editHref={`/journal/entry/${entry.id}?redirect=${encodeURIComponent(router.asPath || '/journal/log')}`}
                        onDelete={handleDeleteEntry}
                        foodObjectId={entry.payload.foodObjectId}
                        isFavorited={entry.payload.foodObjectId ? favoriteIds.has(entry.payload.foodObjectId) : false}
                        onToggleFavorite={handleToggleFavorite}
                      />
                    );
                  })()}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Bottom tabs: Saved Meals (with dropdown) / Favorites / History */}
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
                    href={`/journal/meals/create?block=${block}&date=${dateKey}&redirect=${encodeURIComponent(router.asPath || '/journal/log')}`}
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
              href={`/journal/meals/create?block=${block}&date=${dateKey}&redirect=${encodeURIComponent(router.asPath || '/journal/log')}`}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-full border border-brand-200/50 text-brand-200/50 hover:text-brand-200/100 hover:bg-white/5 text-base font-semibold transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create meal from logged
            </Link>
          </div>
        )}
        </div>
      </main>

      {/* UPC Barcode Modal (Phase 3) */}
      {showUpcModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-brand-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-brand-50">Enter Barcode</h2>
              <button
                onClick={() => { setShowUpcModal(false); setUpcInput(''); setUpcError(null); }}
                className="p-1 text-brand-50/60 hover:text-brand-50 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-brand-50/70 text-sm">
                Enter the UPC barcode number from the product packaging.
              </p>
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g., 012345678905"
                value={upcInput}
                onChange={(e) => setUpcInput(e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-3 rounded-lg bg-brand-700 text-brand-50 placeholder-brand-50/50 text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-200/30"
                autoFocus
              />
              {upcError && (
                <p className="text-red-400 text-sm">{upcError}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowUpcModal(false); setUpcInput(''); setUpcError(null); }}
                  className="flex-1 py-3 rounded-lg border border-white/20 text-brand-50 font-medium hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpcLookup}
                  disabled={upcLoading || upcInput.length < 8}
                  className="flex-1 py-3 rounded-lg bg-brand-200 text-brand-900 font-semibold hover:bg-brand-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {upcLoading ? 'Looking up...' : 'Add Food'}
                </button>
              </div>
            </div>
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
