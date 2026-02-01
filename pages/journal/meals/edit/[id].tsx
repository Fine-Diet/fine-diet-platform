'use client';

import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getSafeRedirectTarget } from '@/lib/redirectHelpers';
import { journalService } from '@/lib/journal';
import type { MealTemplate, MealTemplateItem } from '@/lib/journal';
import { AddItemsPanel, type AddItemData } from '@/components/journal/AddItemsPanel';

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

  // Add item from AddItemsPanel (with duplicate detection)
  const handleAddItem = useCallback((data: AddItemData) => {
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
        unit: data.servingUnit ?? 'serving',
        calories: data.calories ?? undefined,
        macros: data.macros,
        servingSizeG: data.servingSizeG ?? undefined,
      };

      return [...prev, newItem];
    });
  }, []);

  // Compute total calories
  const getTotalCalories = useCallback((): number | null => {
    let total = 0;
    let hasCalories = false;
    for (const item of items) {
      if (typeof item.calories === 'number') {
        total += item.calories;
        hasCalories = true;
      }
    }
    return hasCalories ? total : null;
  }, [items]);

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
              {items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl bg-white/5 border border-white/10 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">
                        {item.name ?? 'Untitled'}
                      </p>
                      <p className="text-white/50 text-sm mt-0.5">
                        {typeof item.calories === 'number' && (
                          <span>{item.calories} cal</span>
                        )}
                        {item.macros && (
                          <span className="text-white/30 ml-1">
                            · P {item.macros.protein ?? 0}g
                            · C {item.macros.carbs ?? 0}g
                            · F {item.macros.fat ?? 0}g
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
                    <div className="flex items-center gap-2 flex-1">
                      <label className="text-white/50 text-xs">Unit</label>
                      <input
                        type="text"
                        value={item.unit ?? 'serving'}
                        onChange={(e) => handleUpdateItem(item.id, 'unit', e.target.value)}
                        className="flex-1 rounded-lg bg-white/10 border border-white/15 px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-white/20"
                        placeholder="serving"
                      />
                    </div>
                  </div>
                </li>
              ))}
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
        />
      )}
    </div>
  );
}
