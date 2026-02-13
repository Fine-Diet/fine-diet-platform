'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { EntryUnit } from '@/lib/units/convert';

interface LoggedItemCardProps {
  id: string;
  name: string;
  /** Serving multiplier (payload.quantity). Always drives nutrition math. */
  quantity?: number;
  /** Display unit ('serving' | 'g'). */
  unit?: string;
  /** Canonical grams (from journal_entries.quantity_g). */
  quantityG?: number | null;
  /** Serving size in grams (from food object). Needed for serving↔g conversion. */
  servingSizeG?: number | null;
  /** Protein in grams (already scaled by quantity) */
  protein?: number;
  /** Carbs in grams (already scaled by quantity) */
  carbs?: number;
  /** Fat in grams (already scaled by quantity) */
  fat?: number;
  editHref: string;
  onDelete?: (id: string) => void;
  /**
   * Callback when quantity or unit is changed inline.
   * Sends the current unit + the relevant numeric value.
   * If unit='serving': value = serving multiplier
   * If unit='g': value = gram value (server recomputes serving multiplier)
   */
  onEntryChange?: (id: string, unit: EntryUnit, value: number) => void;
  /** Food object ID for favorites toggle (if present, shows heart) */
  foodObjectId?: string;
  /** Whether this item is currently favorited */
  isFavorited?: boolean;
  /** Callback to toggle favorite status */
  onToggleFavorite?: (foodObjectId: string) => void;
}

/**
 * Card for a logged food item. Clicking the card goes to edit.
 * Down arrow opens a menu with Edit and Delete.
 * Quantity and Unit are displayed below the nutrition bar.
 * Unit dropdown appears only when valid conversions exist (servingSizeG > 0).
 */
export function LoggedItemCard({
  id,
  name,
  quantity = 1,
  unit = 'serving',
  quantityG = null,
  servingSizeG = null,
  protein = 0,
  carbs = 0,
  fat = 0,
  editHref,
  onDelete,
  onEntryChange,
  foodObjectId,
  isFavorited = false,
  onToggleFavorite,
}: LoggedItemCardProps) {
  const hasMacros = protein > 0 || carbs > 0 || fat > 0;
  const canFavorite = !!foodObjectId && !!onToggleFavorite;
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Can we convert between serving and grams?
  const hasConversion = typeof servingSizeG === 'number' && servingSizeG > 0;

  // Determine the active unit (normalised)
  const activeUnit: EntryUnit = unit === 'g' ? 'g' : 'serving';

  // Display value depends on active unit
  const displayValue = activeUnit === 'g'
    ? (quantityG ?? (quantity * (servingSizeG ?? 1)))
    : quantity;

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [menuOpen]);

  const handleCardClick = () => {
    if (!menuOpen) router.push(editHref);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete?.(id);
    setMenuOpen(false);
  };

  const handleValueChange = (newValue: number) => {
    if (newValue > 0 && onEntryChange) {
      onEntryChange(id, activeUnit, newValue);
    }
  };

  const handleUnitChange = (newUnit: EntryUnit) => {
    if (!onEntryChange || !hasConversion) return;
    if (newUnit === activeUnit) return;

    // Convert the current value to the new unit
    if (newUnit === 'g') {
      // switching from serving → grams
      const grams = quantity * (servingSizeG ?? 1);
      onEntryChange(id, 'g', grams);
    } else {
      // switching from grams → serving
      const currentGrams = quantityG ?? (quantity * (servingSizeG ?? 1));
      const servings = currentGrams / (servingSizeG ?? 1);
      onEntryChange(id, 'serving', servings);
    }
  };

  return (
    <div
      className="relative bg-transparent p-4 space-y-2 cursor-pointer hover:bg-white/5 transition-colors"
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
      aria-label={`Edit ${name}`}
    >
      {/* Header: name + heart + down arrow menu */}
      <div className="flex items-start justify-between gap-1">
        <h3 className="text-brand-50 text-xl font-semibold flex-1 min-w-0">{name}</h3>
        <div className="flex items-center gap-0.5 shrink-0" ref={menuRef}>
          {/* Favorite heart button */}
          {canFavorite && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(foodObjectId!);
              }}
              className={`p-1.5 rounded transition-opacity ${isFavorited ? 'text-brand-50/40 opacity-90 hover:opacity-100' : 'text-brand-50/30 hover:text-brand-50/50'}`}
              aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            >
              <svg className="w-4 h-4" fill={isFavorited ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={isFavorited ? 0 : 1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            className="p-1.5 text-brand-50 hover:text-white transition-colors rounded"
            aria-label="Options"
            aria-expanded={menuOpen}
            aria-haspopup="true"
          >
            <svg className="w-4 h-4 text-brand-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Dropdown: Edit | Delete */}
      {menuOpen && (
        <div
          className="absolute right-4 top-12 z-50 min-w-[120px] rounded-lg bg-brand-900 border border-white/20 shadow-lg py-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Link
            href={editHref}
            className="block px-4 py-2 text-sm text-white/90 hover:bg-white/10 transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            Edit
          </Link>
          <button
            type="button"
            onClick={handleDelete}
            className="w-full text-left px-4 py-2 text-sm text-red-300 hover:bg-white/10 transition-colors"
          >
            Delete
          </button>
        </div>
      )}

      {/* Macros bar: Protein / Carbs / Fat — equal thirds */}
      {hasMacros && (
        <div className="flex items-center rounded-full bg-gradient-to-r from-brand-200/70 to-brand-100/70 overflow-hidden text-base h-9">
          <span className="relative flex flex-1 items-center justify-center text-brand-900 bg-white/15 h-full px-2 pt-[2px] min-w-0 truncate">
            <span className="truncate">
              <span className="font-semibold">Protein</span>
              <span className="font-light"> {Math.round(protein)}g</span>
            </span>
            <span className="absolute right-0 top-0 h-full w-[3px] rounded-r-full bg-brand-900" aria-hidden />
          </span>
          <span className="relative flex flex-1 items-center justify-center text-brand-900 pt-[2px] bg-gradient-to-r from-brand-200/70 to-brand-100/70 h-full px-2 min-w-0 truncate">
            <span className="truncate">
              <span className="font-semibold">Carbs</span>
              <span className="font-light"> {Math.round(carbs)}g</span>
            </span>
            <span className="absolute right-0 top-0 h-full w-[3px] rounded-r-full bg-brand-900" aria-hidden />
          </span>
          <span className="flex flex-1 items-center justify-center text-brand-900 pt-[2px] bg-gradient-to-r from-brand-200/70 to-brand-100/70 h-full px-2 min-w-0 truncate">
            <span className="truncate">
              <span className="font-semibold">Fat</span>
              <span className="font-light"> {Math.round(fat)}g</span>
            </span>
          </span>
        </div>
      )}

      {/* Quantity + Unit row — below macros bar */}
      <div className="flex items-center gap-4 pt-1" onClick={(e) => e.stopPropagation()}>
        {/* Quantity label + editable input */}
        <div className="flex items-center gap-2">
          <span className="text-white/50 text-sm">Quantity</span>
          <input
            type="number"
            inputMode="decimal"
            min={0.25}
            step={activeUnit === 'g' ? 1 : 0.25}
            value={Math.round(displayValue * 100) / 100}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) handleValueChange(v);
            }}
            className="w-14 h-8 rounded-lg border border-white/20 bg-transparent text-center text-brand-50 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-brand-200/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            aria-label={`Quantity for ${name}`}
          />
        </div>

        {/* Unit: dropdown if conversion available, read-only otherwise */}
        <div className="flex items-center gap-2">
          <span className="text-white/50 text-sm">Unit</span>
          {hasConversion ? (
            <select
              value={activeUnit}
              onChange={(e) => handleUnitChange(e.target.value as EntryUnit)}
              className="h-8 rounded-lg border border-white/20 bg-transparent text-brand-50 text-sm pl-2 pr-6 focus:outline-none focus:ring-1 focus:ring-brand-200/40 appearance-none"
              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23a0a0a0' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 4px center', backgroundRepeat: 'no-repeat', backgroundSize: '16px' }}
              aria-label={`Unit for ${name}`}
            >
              <option value="serving" className="bg-brand-900 text-brand-50">serving</option>
              <option value="g" className="bg-brand-900 text-brand-50">g</option>
            </select>
          ) : (
            <span className="h-8 flex items-center px-3 rounded-lg border border-white/20 text-brand-50/70 text-sm">
              {unit}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
