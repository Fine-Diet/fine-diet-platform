'use client';

import { useState, useEffect, useRef } from 'react';
import { foodService, type FoodObject, type FoodSearchResponse } from '@/lib/food';
import { journalService, type HistoryFoodItem } from '@/lib/journal';

type Tab = 'search' | 'favorites' | 'history';

export interface AddItemData {
  foodObjectId: string;
  name: string;
  calories: number | null;
  macros: { protein?: number; carbs?: number; fat?: number } | undefined;
  servingSizeG: number | null;
  servingUnit: string | null;
}

interface AddItemsPanelProps {
  onAddItem: (item: AddItemData) => void;
  onClose: () => void;
}

export function AddItemsPanel({ onAddItem, onClose }: AddItemsPanelProps) {
  const [tab, setTab] = useState<Tab>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoodSearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Favorites state
  const [favorites, setFavorites] = useState<FoodObject[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [favoritesLoading, setFavoritesLoading] = useState(false);

  // History state
  const [historyFoods, setHistoryFoods] = useState<HistoryFoodItem[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Focus search input on mount
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Search debounce
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults(null);
      return;
    }

    searchDebounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      const results = await foodService.search(searchQuery);
      setSearchResults(results);
      setIsSearching(false);
    }, 300);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  // Load favorites when tab opens
  useEffect(() => {
    if (tab === 'favorites' && !favoritesLoaded && !favoritesLoading) {
      setFavoritesLoading(true);
      foodService.listFavorites()
        .then((foods) => {
          setFavorites(foods);
          setFavoritesLoaded(true);
        })
        .catch((err) => {
          console.error('[AddItemsPanel] Favorites load error:', err);
        })
        .finally(() => {
          setFavoritesLoading(false);
        });
    }
  }, [tab, favoritesLoaded, favoritesLoading]);

  // Load history when tab opens
  useEffect(() => {
    if (tab === 'history' && !historyLoaded && !historyLoading) {
      setHistoryLoading(true);
      journalService.listHistoryFoods({ limit: 50 })
        .then((foods) => {
          setHistoryFoods(foods);
          setHistoryLoaded(true);
        })
        .catch((err) => {
          console.error('[AddItemsPanel] History load error:', err);
        })
        .finally(() => {
          setHistoryLoading(false);
        });
    }
  }, [tab, historyLoaded, historyLoading]);

  // Convert FoodObject to AddItemData
  const foodObjectToAddItem = (food: FoodObject): AddItemData => ({
    foodObjectId: food.id,
    name: food.canonicalName,
    calories: food.calories,
    macros: {
      protein: food.proteinG ?? undefined,
      carbs: food.carbsG ?? undefined,
      fat: food.fatG ?? undefined,
    },
    servingSizeG: food.servingSizeG,
    servingUnit: food.servingUnit,
  });

  // Convert HistoryFoodItem to AddItemData
  const historyItemToAddItem = (item: HistoryFoodItem): AddItemData => ({
    foodObjectId: item.foodObjectId,
    name: item.name,
    calories: item.calories,
    macros: {
      protein: item.proteinG ?? undefined,
      carbs: item.carbsG ?? undefined,
      fat: item.fatG ?? undefined,
    },
    servingSizeG: item.servingSizeG,
    servingUnit: item.servingUnit,
  });

  const handleSelectFood = (item: AddItemData) => {
    onAddItem(item);
  };

  // Render a food item row
  const FoodRow = ({ item, onClick }: { item: AddItemData; onClick: () => void }) => (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium truncate">{item.name}</p>
          <p className="text-white/50 text-sm mt-0.5">
            {typeof item.calories === 'number' && <span>{item.calories} cal</span>}
            {item.macros && (
              <span className="text-white/30 ml-1">
                · P {item.macros.protein ?? 0}g
                · C {item.macros.carbs ?? 0}g
                · F {item.macros.fat ?? 0}g
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-white/40">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </div>
      </div>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[85vh] bg-brand-900 rounded-t-2xl sm:rounded-2xl border border-white/10 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
          <h2 className="text-lg font-medium text-white">Add items</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-white/60 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          {(['search', 'favorites', 'history'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === t
                  ? 'text-white border-b-2 border-white'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              {t === 'search' ? 'Search' : t === 'favorites' ? 'Favorites' : 'History'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Search Tab */}
          {tab === 'search' && (
            <div className="space-y-4">
              <div className="relative">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search foods..."
                  className="w-full rounded-xl bg-white/10 border border-white/15 px-4 py-3 pl-10 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
                />
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {isSearching && (
                <p className="text-white/50 text-sm text-center py-4">Searching...</p>
              )}

              {!isSearching && searchResults && searchResults.results.length === 0 && searchQuery.length >= 2 && (
                <p className="text-white/50 text-sm text-center py-4">No results found</p>
              )}

              {!isSearching && searchResults && searchResults.results.length > 0 && (
                <div className="space-y-2">
                  {searchResults.results.map((r) => (
                    <FoodRow
                      key={r.food.id}
                      item={foodObjectToAddItem(r.food)}
                      onClick={() => handleSelectFood(foodObjectToAddItem(r.food))}
                    />
                  ))}
                </div>
              )}

              {!searchQuery && (
                <p className="text-white/40 text-sm text-center py-8">
                  Type at least 2 characters to search
                </p>
              )}
            </div>
          )}

          {/* Favorites Tab */}
          {tab === 'favorites' && (
            <div>
              {favoritesLoading && (
                <p className="text-white/50 text-sm text-center py-4">Loading favorites...</p>
              )}

              {!favoritesLoading && favorites.length === 0 && (
                <p className="text-white/40 text-sm text-center py-8">
                  No favorites yet. Heart foods to add them here.
                </p>
              )}

              {!favoritesLoading && favorites.length > 0 && (
                <div className="space-y-2">
                  {favorites.map((food) => (
                    <FoodRow
                      key={food.id}
                      item={foodObjectToAddItem(food)}
                      onClick={() => handleSelectFood(foodObjectToAddItem(food))}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* History Tab */}
          {tab === 'history' && (
            <div>
              {historyLoading && (
                <p className="text-white/50 text-sm text-center py-4">Loading history...</p>
              )}

              {!historyLoading && historyFoods.length === 0 && (
                <p className="text-white/40 text-sm text-center py-8">
                  No food history yet. Log some foods first.
                </p>
              )}

              {!historyLoading && historyFoods.length > 0 && (
                <div className="space-y-2">
                  {historyFoods.map((item) => (
                    <FoodRow
                      key={item.foodObjectId}
                      item={historyItemToAddItem(item)}
                      onClick={() => handleSelectFood(historyItemToAddItem(item))}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
