'use client';

import { useRouter } from 'next/router';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { getSafeRedirectTarget } from '@/lib/redirectHelpers';
import { journalService } from '@/lib/journal';
import type { MealTemplate, MealTemplateItem } from '@/lib/journal';
import { AddItemsPanel, type AddItemData, type AddItemResult } from '@/components/journal/AddItemsPanel';
import { formatFoodNameString } from '@/lib/food';

// Common unit options (stored as lowercase canonical values)
const COMMON_UNITS = ['serving', 'g', 'oz', 'ml', 'cup', 'tbsp', 'tsp', 'piece'];
const OTHER_UNIT_VALUE = '__other__';

// Check if a unit is in our common list (case-insensitive)
function isCommonUnit(unit: string | undefined): boolean {
  if (!unit) return false;
  return COMMON_UNITS.includes(unit.toLowerCase());
}

// Normalize unit to lowercase canonical form
function normalizeUnit(unit: string): string {
  return unit.toLowerCase().trim();
}

// Unit Picker component
function UnitPicker({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (unit: string) => void;
}) {
  const currentUnit = value ?? 'serving';
  const normalizedCurrent = normalizeUnit(currentUnit);
  const isOther = !isCommonUnit(currentUnit);
  
  const [showOtherInput, setShowOtherInput] = useState(isOther);
  const [otherValue, setOtherValue] = useState(isOther ? currentUnit : '');

  // Handle select change
  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    if (selected === OTHER_UNIT_VALUE) {
      setShowOtherInput(true);
      // Keep current value if switching to Other
      if (!isOther) {
        setOtherValue('');
      }
    } else {
      setShowOtherInput(false);
      onChange(selected);
    }
  };

  // Handle other input change
  const handleOtherChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setOtherValue(newValue);
    if (newValue.trim()) {
      onChange(normalizeUnit(newValue));
    }
  };

  const selectValue = showOtherInput ? OTHER_UNIT_VALUE : normalizedCurrent;

  return (
    <div className="flex items-center gap-2 flex-1">
      <label className="text-white/50 text-xs">Unit</label>
      <select
        value={selectValue}
        onChange={handleSelectChange}
        className="flex-1 rounded-lg bg-white/10 border border-white/15 px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-white/20 appearance-none cursor-pointer"
        style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.25em 1.25em', paddingRight: '2rem' }}
      >
        {COMMON_UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
        <option value={OTHER_UNIT_VALUE}>Other...</option>
      </select>
      {showOtherInput && (
        <input
          type="text"
          value={otherValue}
          onChange={handleOtherChange}
          placeholder="custom unit"
          className="w-24 rounded-lg bg-white/10 border border-white/15 px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-white/20"
          autoFocus
        />
      )}
    </div>
  );
}

export default function JournalMealEditPage() {
  const router = useRouter();
  const rawId = router.query?.id;
  const id = typeof rawId === 'string' ? rawId : undefined;
  const q = (router.query ?? {}) as Record<string, string | undefined>;
  const redirectTarget = getSafeRedirectTarget(q.redirect ?? null, '/journal/meals');

  const [template, setTemplate] = useState<MealTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable state
  const [name, setName] = useState('');
  const [items, setItems] = useState<MealTemplateItem[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const t = await journalService.getMealTemplate(id);
      setTemplate(t ?? null);
      if (t) {
        setName(t.name);
        setItems(t.items);
      }
      setLoading(false);
    })();
  }, [id]);

  // Track changes
  useEffect(() => {
    if (!template) return;
    const nameChanged = name !== template.name;
    const itemsChanged = JSON.stringify(items) !== JSON.stringify(template.items);
    setHasChanges(nameChanged || itemsChanged);
  }, [name, items, template]);

  const handleSave = async () => {
    if (!id || !hasChanges) return;
    setSaving(true);
    setError(null);
    const updated = await journalService.updateMealTemplate(id, { name, items });
    if (updated) {
      setTemplate(updated);
      setHasChanges(false);
    } else {
      setError('Failed to save changes. Please try again.');
    }
    setSaving(false);
  };

  const handleRemoveItem = (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const handleUpdateItem = (itemId: string, field: 'quantity' | 'unit', value: number | string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, [field]: value } : i))
    );
  };

  // Existing food IDs for duplicate detection in AddItemsPanel
  const existingFoodIds = useMemo(() => {
    return new Set(items.map((i) => i.foodObjectId).filter(Boolean) as string[]);
  }, [items]);

  // Add item from AddItemsPanel (with duplicate detection)
  // Returns 'added' for new items, 'updated' if quantity was incremented
  const handleAddItem = useCallback((data: AddItemData): AddItemResult => {
    // Check if item already exists before updating state
    const isExisting = existingFoodIds.has(data.foodObjectId);
    
    setItems((prev) => {
      // Check if item already exists (same foodObjectId)
      const existingIndex = prev.findIndex((i) => i.foodObjectId === data.foodObjectId);
      
      if (existingIndex >= 0) {
        // Increment quantity of existing item
        return prev.map((item, idx) =>
          idx === existingIndex
            ? { ...item, quantity: (item.quantity ?? 1) + 1 }
            : item
        );
      }

      // Add new item
      const newItem: MealTemplateItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        foodObjectId: data.foodObjectId,
        name: data.name,
        quantity: 1,
        unit: normalizeUnit(data.servingUnit ?? 'serving'),
        calories: data.calories ?? undefined,
        macros: data.macros,
        servingSizeG: data.servingSizeG ?? undefined,
      };

      return [...prev, newItem];
    });

    return isExisting ? 'updated' : 'added';
  }, [existingFoodIds]);

  // Compute display calories for an item (scaled by quantity)
  const getItemDisplayCalories = useCallback((item: MealTemplateItem): number | null => {
    if (typeof item.calories !== 'number') return null;
    return item.calories * (item.quantity ?? 1);
  }, []);

  // Compute display macros for an item (scaled by quantity)
  const getItemDisplayMacros = useCallback((item: MealTemplateItem): { protein: number; carbs: number; fat: number } | null => {
    if (!item.macros) return null;
    const qty = item.quantity ?? 1;
    return {
      protein: (item.macros.protein ?? 0) * qty,
      carbs: (item.macros.carbs ?? 0) * qty,
      fat: (item.macros.fat ?? 0) * qty,
    };
  }, []);

  // Compute total calories (sum of scaled item calories)
  const getTotalCalories = useCallback((): number | null => {
    let total = 0;
    let hasCalories = false;
    for (const item of items) {
      const displayCal = getItemDisplayCalories(item);
      if (displayCal !== null) {
        total += displayCal;
        hasCalories = true;
      }
    }
    return hasCalories ? total : null;
  }, [items, getItemDisplayCalories]);

  if (id === undefined) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-900 text-white flex items-center justify-center">
        <p className="text-white/50">Loading...</p>
      </div>
    );
  }

  if (template === null) {
    return (
      <div className="min-h-screen bg-brand-900 text-white flex flex-col items-center justify-center px-4">
        <p className="text-white/70">Meal not found.</p>
        <Link href={redirectTarget} className="mt-4 text-white/90 hover:text-white underline">
          Back to saved meals
        </Link>
      </div>
    );
  }

  const totalCalories = getTotalCalories();

  return (
    <div className="min-h-screen bg-brand-900 text-white max-w-[1200px] mx-auto relative flex flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-4 border-b border-white/10 bg-brand-900/95 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link
            href={redirectTarget}
            className="p-2 -ml-2 text-white/80 hover:text-white transition-colors"
            aria-label="Back"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-lg font-medium text-white">Edit meal</h1>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            hasChanges && !saving
              ? 'bg-white text-brand-900 hover:bg-white/90'
              : 'bg-white/10 text-white/40 cursor-not-allowed'
          }`}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </header>

      <main className="flex-1 px-4 py-6 space-y-6">
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Name */}
        <div>
          <label className="block text-white/70 text-sm mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl bg-white/10 border border-white/15 px-4 py-3 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
            placeholder="Meal name"
          />
        </div>

        {/* Items */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white/70 text-sm font-medium">
              Items ({items.length})
              {totalCalories !== null && (
                <span className="ml-2 text-white/40 font-normal">
                  · {Math.round(totalCalories)} cal total
                </span>
              )}
            </h2>
          </div>

          {items.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-white/40 text-sm">No items in this meal</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => {
                const displayCal = getItemDisplayCalories(item);
                const displayMacros = getItemDisplayMacros(item);
                return (
                <li
                  key={item.id}
                  className="rounded-xl bg-white/5 border border-white/10 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">
                        {formatFoodNameString(item.name ?? 'Untitled')}
                      </p>
                      <p className="text-white/50 text-sm mt-0.5">
                        {displayCal !== null && (
                          <span>{Math.round(displayCal)} cal</span>
                        )}
                        {displayMacros && (
                          <span className="text-white/30 ml-1">
                            · P {Math.round(displayMacros.protein)}g
                            · C {Math.round(displayMacros.carbs)}g
                            · F {Math.round(displayMacros.fat)}g
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors shrink-0"
                      aria-label="Remove item"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Quantity + Unit controls */}
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/5">
                    <div className="flex items-center gap-2">
                      <label className="text-white/50 text-xs">Qty</label>
                      <input
                        type="number"
                        min={0.1}
                        step={0.1}
                        value={item.quantity ?? 1}
                        onChange={(e) =>
                          handleUpdateItem(item.id, 'quantity', parseFloat(e.target.value) || 1)
                        }
                        className="w-16 rounded-lg bg-white/10 border border-white/15 px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-white/20"
                      />
                    </div>
                    <UnitPicker
                      value={item.unit}
                      onChange={(unit) => handleUpdateItem(item.id, 'unit', unit)}
                    />
                  </div>
                </li>
                );
              })}
            </ul>
          )}

          {/* Add items button */}
          <button
            onClick={() => setShowAddPanel(true)}
            className="w-full mt-3 py-3 rounded-xl border border-dashed border-white/20 text-white/50 text-sm hover:border-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
          >
            + Add items
          </button>
        </div>
      </main>

      {/* Add Items Panel */}
      {showAddPanel && (
        <AddItemsPanel
          onAddItem={handleAddItem}
          onClose={() => setShowAddPanel(false)}
          existingFoodIds={existingFoodIds}
        />
      )}
    </div>
  );
}
