'use client';

import { useEffect, useState } from 'react';

import { AppDialog } from '@/components/ui/AppDialog';
import { planService } from '@/lib/plans';
import type { FoodSearchResult } from '@/lib/food/types';
import type { GroceryHaulItem } from '@/lib/plans/types';

interface HaulItemEditorProps {
  haulId: string;
  item: GroceryHaulItem | null;
  openInProductSearch?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

function optionalNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

export function HaulItemEditor({
  haulId,
  item,
  openInProductSearch = false,
  onClose,
  onSaved,
}: HaulItemEditorProps) {
  const [productTitle, setProductTitle] = useState('');
  const [brandName, setBrandName] = useState('');
  const [selectedFoodObjectId, setSelectedFoodObjectId] = useState<string | null>(null);
  const [purchaseUnit, setPurchaseUnit] = useState('');
  const [packageSize, setPackageSize] = useState('');
  const [packageUnit, setPackageUnit] = useState('');
  const [packageCount, setPackageCount] = useState('');
  const [retailer, setRetailer] = useState('');
  const [storeLocation, setStoreLocation] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [priceAmount, setPriceAmount] = useState('');
  const [finalQuantity, setFinalQuantity] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoodSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setProductTitle(item.product_title ?? '');
    setBrandName(item.brand_name ?? '');
    setSelectedFoodObjectId(item.selected_food_object_id);
    setPurchaseUnit(item.purchase_unit ?? '');
    setPackageSize(item.package_size == null ? '' : String(item.package_size));
    setPackageUnit(item.package_unit ?? '');
    setPackageCount(item.package_count == null ? '' : String(item.package_count));
    setRetailer(item.retailer ?? '');
    setStoreLocation(item.store_location ?? '');
    setPostalCode(item.postal_code ?? '');
    setPriceAmount(item.price_amount == null ? '' : String(item.price_amount));
    setFinalQuantity(String(item.final_quantity));
    setSearchOpen(openInProductSearch);
    setSearchQuery(item.name_snapshot);
    setSearchResults([]);
    setError(null);
  }, [item, openInProductSearch]);

  useEffect(() => {
    if (!item || !searchOpen || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: searchQuery.trim(), limit: '8' });
        const response = await fetch(`/api/foods/search?${params.toString()}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Product search failed.');
        const body = (await response.json()) as { results?: FoodSearchResult[] };
        setSearchResults(body.results ?? []);
      } catch {
        if (!controller.signal.aborted) setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [item, searchOpen, searchQuery]);

  if (!item) return null;
  const editableItem: GroceryHaulItem = item;

  function chooseProduct(result: FoodSearchResult) {
    setSelectedFoodObjectId(result.food.id);
    setProductTitle(result.food.canonicalName);
    setBrandName(result.food.brandName ?? '');
    setPurchaseUnit(result.food.servingUnit ?? '');
    setSearchOpen(false);
    setError(null);
  }

  async function save() {
    if (saving) return;
    const quantity = Number(finalQuantity);
    const nextPackageSize = optionalNumber(packageSize);
    const nextPackageCount = optionalNumber(packageCount);
    const nextPrice = optionalNumber(priceAmount);
    if (!Number.isFinite(quantity) || quantity < 0) {
      setError('Final quantity must be zero or greater.');
      return;
    }
    if (
      [nextPackageSize, nextPackageCount].some((value) => value != null && (!Number.isFinite(value) || value <= 0))
      || (nextPrice != null && (!Number.isFinite(nextPrice) || nextPrice < 0))
    ) {
      setError('Package values must be positive and price must be zero or greater.');
      return;
    }

    const patch: Parameters<typeof planService.updateGroceryHaulItem>[2] = {};
    const textChanges: Array<[keyof typeof patch, string, string | null]> = [
      ['product_title', productTitle, editableItem.product_title],
      ['brand_name', brandName, editableItem.brand_name],
      ['purchase_unit', purchaseUnit, editableItem.purchase_unit],
      ['package_unit', packageUnit, editableItem.package_unit],
      ['retailer', retailer, editableItem.retailer],
      ['store_location', storeLocation, editableItem.store_location],
      ['postal_code', postalCode, editableItem.postal_code],
    ];
    for (const [key, value, original] of textChanges) {
      const normalized = value.trim() || null;
      if (normalized !== original) Object.assign(patch, { [key]: normalized });
    }
    if (selectedFoodObjectId !== editableItem.selected_food_object_id) {
      patch.selected_food_object_id = selectedFoodObjectId;
    }
    if (quantity !== editableItem.final_quantity) patch.final_quantity = quantity;
    if (nextPackageSize !== editableItem.package_size) patch.package_size = nextPackageSize;
    if (nextPackageCount !== editableItem.package_count) patch.package_count = nextPackageCount;
    if (nextPrice !== editableItem.price_amount) {
      patch.price_amount = nextPrice;
      if (nextPrice != null) patch.price_currency = editableItem.price_currency ?? 'USD';
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await planService.updateGroceryHaulItem(haulId, editableItem.id, patch);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save this Haul item.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppDialog
      open={Boolean(item)}
      onClose={onClose}
      labelledBy="haul-item-editor-title"
      panelClassName="border border-white/15 bg-[#211a14] p-6 text-white shadow-2xl"
    >
      <h2 id="haul-item-editor-title" className="text-2xl font-light text-brand-50">
        Edit {editableItem.name_snapshot}
      </h2>
      <p className="mt-2 text-sm text-white/50">
        These purchasing details belong to this Haul only. The source List stays unchanged.
      </p>

      <div className="mt-5">
        <button
          type="button"
          onClick={() => setSearchOpen((value) => !value)}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold hover:bg-white/[0.04]"
        >
          {productTitle ? 'Change Product' : 'Choose Product'}
        </button>
        {searchOpen && (
          <div className="mt-3 rounded-xl border border-white/15 p-3">
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search products"
              className="min-h-11 w-full rounded-lg bg-[#16110d] px-3 text-sm outline-none"
            />
            <div className="mt-2 max-h-52 overflow-y-auto">
              {searching && <p className="px-2 py-3 text-xs text-white/40">Searching…</p>}
              {!searching && searchResults.map((result) => (
                <button
                  key={result.food.id}
                  type="button"
                  onClick={() => chooseProduct(result)}
                  className="block w-full rounded-lg px-2 py-2 text-left hover:bg-white/[0.05]"
                >
                  <span className="block text-sm font-semibold">{result.food.canonicalName}</span>
                  {result.food.brandName && <span className="block text-xs text-white/45">{result.food.brandName}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {[
          ['Product', productTitle, setProductTitle],
          ['Brand', brandName, setBrandName],
          ['Purchase unit', purchaseUnit, setPurchaseUnit],
          ['Package unit', packageUnit, setPackageUnit],
          ['Retailer', retailer, setRetailer],
          ['Store location', storeLocation, setStoreLocation],
          ['ZIP code', postalCode, setPostalCode],
        ].map(([label, value, setter]) => (
          <label key={label as string} className="text-xs font-semibold text-white/50">
            {label as string}
            <input
              value={value as string}
              onChange={(event) => (setter as (value: string) => void)(event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-white/15 bg-[#16110d] px-3 text-sm font-normal text-white outline-none focus:border-white/45"
            />
          </label>
        ))}
        {[
          ['Package size', packageSize, setPackageSize],
          ['Package count', packageCount, setPackageCount],
          ['Manual price', priceAmount, setPriceAmount],
          ['Final Haul quantity', finalQuantity, setFinalQuantity],
        ].map(([label, value, setter]) => (
          <label key={label as string} className="text-xs font-semibold text-white/50">
            {label as string}
            <input
              type="number"
              min="0"
              step="any"
              value={value as string}
              onChange={(event) => (setter as (value: string) => void)(event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-white/15 bg-[#16110d] px-3 text-sm font-normal text-white outline-none focus:border-white/45"
            />
          </label>
        ))}
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={saving} className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold">
          Cancel
        </button>
        <button type="button" onClick={() => void save()} disabled={saving} className="rounded-full bg-brand-50 px-6 py-2.5 text-sm font-semibold text-[#16110d] disabled:opacity-50">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </AppDialog>
  );
}
