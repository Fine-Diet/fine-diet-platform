'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import { CreateResourceDialogFooter } from '@/components/food/itemManagement/CreateResourceDialogFooter';
import { ItemManagementDialog } from '@/components/food/itemManagement/ItemManagementDialog';
import { planService } from '@/lib/plans';
import type { GroceryHaulItem, GroceryHaulStore, GroceryHaulStoreSearchCandidate } from '@/lib/plans/types';
import { haulStoreDisplayLabel, haulStoreLocationLine } from '@/lib/plans/groceryHaul/haulStoreIdentity';

const INPUT_CLASS =
  'mt-1.5 min-w-0 w-full rounded-full border border-white/20 bg-transparent px-4 py-2.5 text-base text-white outline-none placeholder:text-white/30 focus:border-white/60';

interface HaulStoreManagementDialogProps {
  open: boolean;
  haulId: string;
  stores: GroceryHaulStore[];
  items: GroceryHaulItem[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

function assignmentCount(items: GroceryHaulItem[], storeId: string): number {
  return items.filter((item) => item.haul_store_id === storeId).length;
}

export function HaulStoreManagementDialog({
  open,
  haulId,
  stores,
  items,
  onClose,
  onChanged,
}: HaulStoreManagementDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [locationContext, setLocationContext] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<GroceryHaulStoreSearchCandidate[]>([]);
  const [providerDisabled, setProviderDisabled] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualRetailer, setManualRetailer] = useState('');
  const [manualLocation, setManualLocation] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [manualCity, setManualCity] = useState('');
  const [manualRegion, setManualRegion] = useState('');
  const [manualPostal, setManualPostal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<GroceryHaulStore | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearchQuery('');
    setLocationContext('');
    setSearchResults([]);
    setSearchError(null);
    setProviderDisabled(false);
    setManualOpen(false);
    setManualRetailer('');
    setManualLocation('');
    setManualAddress('');
    setManualCity('');
    setManualRegion('');
    setManualPostal('');
    setError(null);
    setPendingRemove(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const query = searchQuery.trim();
    setSearchResults([]);
    setProviderDisabled(false);
    setSearchError(null);
    if (query.length < 2) {
      setSearchBusy(false);
      return;
    }
    setSearchBusy(true);
    const handle = window.setTimeout(async () => {
      setSearchBusy(true);
      setSearchError(null);
      try {
        const result = await planService.searchGroceryHaulStores(haulId, {
          query,
          location_context: locationContext.trim() || undefined,
        });
        if (cancelled) return;
        setSearchResults(result.results);
        setProviderDisabled(result.provider_disabled);
        if (result.provider_error) {
          setSearchError(result.provider_error);
        }
      } catch (err) {
        if (cancelled) return;
        setSearchResults([]);
        setSearchError(err instanceof Error ? err.message : 'Store search failed.');
      } finally {
        if (!cancelled) setSearchBusy(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, haulId, searchQuery, locationContext]);

  const removeAffectedCount = useMemo(
    () => (pendingRemove ? assignmentCount(items, pendingRemove.id) : 0),
    [items, pendingRemove],
  );

  async function addFromSearch(candidate: GroceryHaulStoreSearchCandidate) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await planService.addGroceryHaulStore(haulId, {
        source: 'serpapi',
        retailer: candidate.retailer,
        store_name: candidate.store_name,
        store_location: candidate.store_location,
        address_line1: candidate.address_line1,
        city: candidate.city,
        region: candidate.region,
        postal_code: candidate.postal_code,
        country_code: candidate.country_code,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        provider_place_id: candidate.provider_place_id,
        provider_data_id: candidate.provider_data_id,
        provider_location: candidate.provider_location,
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add this store.');
    } finally {
      setBusy(false);
    }
  }

  async function addManualStore() {
    if (busy || !manualRetailer.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await planService.addGroceryHaulStore(haulId, {
        source: 'manual',
        retailer: manualRetailer.trim(),
        store_location: manualLocation.trim() || null,
        address_line1: manualAddress.trim() || null,
        city: manualCity.trim() || null,
        region: manualRegion.trim() || null,
        postal_code: manualPostal.trim() || null,
      });
      setManualOpen(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add this store.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    if (!pendingRemove || busy) return;
    setBusy(true);
    setError(null);
    try {
      await planService.removeGroceryHaulStore(haulId, pendingRemove.id);
      setPendingRemove(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove this store.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ItemManagementDialog
      open={open}
      onClose={onClose}
      labelledBy="haul-stores-title"
      busy={busy}
      shell="create-resource"
      footer={(
        <CreateResourceDialogFooter
          primaryLabel="Done"
          onPrimary={onClose}
          onSecondary={onClose}
          primaryDisabled={busy}
        />
      )}
    >
      <h2 id="haul-stores-title" className="text-2xl font-semibold text-white">
        Stores
      </h2>
      <div className="mt-6 space-y-8">
        {stores.length > 0 && (
          <section aria-label="Current stores">
            <ul className="divide-y divide-white/10">
              {stores.map((store) => {
                const assigned = assignmentCount(items, store.id);
                return (
                  <li key={store.id} className="flex items-start justify-between gap-4 py-4 first:pt-0">
                    <div className="min-w-0 break-words">
                      <p className="text-sm font-medium text-white">{haulStoreDisplayLabel(store)}</p>
                      <p className="mt-1 text-xs text-white/45">{haulStoreLocationLine(store)}</p>
                      {assigned > 0 && (
                        <p className="mt-1 text-xs text-white/40">
                          {assigned} item{assigned === 1 ? '' : 's'} assigned
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPendingRemove(store)}
                      className="min-h-11 shrink-0 px-2 text-xs font-semibold text-white/55 hover:text-white/80 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {pendingRemove && (
          <div className="rounded-xl border border-white/15 bg-white/[0.03] px-4 py-4 text-sm text-white/70">
            <p>
              Remove {haulStoreDisplayLabel(pendingRemove)} from this Haul?
              {removeAffectedCount > 0 && (
                <>
                  {' '}
                  {removeAffectedCount} item{removeAffectedCount === 1 ? '' : 's'} will become unassigned
                  and store-scoped sourced prices will be cleared.
                </>
              )}
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmRemove()}
                className="rounded-full bg-brand-50 px-4 py-2 text-xs font-semibold text-[#16110d] disabled:opacity-50"
              >
                Remove store
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPendingRemove(null)}
                className="text-xs font-semibold text-white/55 hover:text-white/80"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <section aria-label="Search stores">
          <label className="block text-xs text-white/55">
            Search stores
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className={INPUT_CLASS}
                placeholder="Search stores"
              />
            </div>
          </label>
          <label className="mt-3 block text-xs text-white/55">
            Location context (optional)
            <input
              value={locationContext}
              onChange={(event) => setLocationContext(event.target.value)}
              className={INPUT_CLASS}
              placeholder="City, state, ZIP, or address"
            />
          </label>
          {searchBusy && <p className="mt-3 text-sm text-white/45">Searching…</p>}
          {providerDisabled && searchQuery.trim().length >= 2 && (
            <p className="mt-3 text-sm text-white/45">Provider search is unavailable. Add manually instead.</p>
          )}
          {searchError && <p className="mt-3 text-sm text-red-300/90">{searchError}</p>}
          {searchResults.length > 0 && (
            <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">
              {searchResults.map((candidate) => (
                <li key={candidate.provider_place_id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0 break-words">
                    <p className="text-sm text-white">{candidate.retailer}</p>
                    <p className="mt-1 text-xs text-white/45">
                      {candidate.store_location ?? haulStoreLocationLine(candidate)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void addFromSearch(candidate)}
                    className="min-h-11 min-w-11 shrink-0 text-xs font-semibold text-brand-50 hover:text-brand-50/80 disabled:opacity-40"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {!manualOpen ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setManualOpen(true)}
            className="text-sm font-semibold text-brand-50 hover:text-brand-50/80 disabled:opacity-40"
          >
            Add manually
          </button>
        ) : (
          <section className="space-y-3 border-t border-white/10 pt-6" aria-label="Manual store entry">
            <label className="block text-xs text-white/55">
              Store / retailer name
              <input
                value={manualRetailer}
                onChange={(event) => setManualRetailer(event.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <label className="block text-xs text-white/55">
              Location / branch label
              <input
                value={manualLocation}
                onChange={(event) => setManualLocation(event.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <label className="block text-xs text-white/55">
              Address
              <input
                value={manualAddress}
                onChange={(event) => setManualAddress(event.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-white/55">
                City
                <input
                  value={manualCity}
                  onChange={(event) => setManualCity(event.target.value)}
                  className={INPUT_CLASS}
                />
              </label>
              <label className="block text-xs text-white/55">
                State / region
                <input
                  value={manualRegion}
                  onChange={(event) => setManualRegion(event.target.value)}
                  className={INPUT_CLASS}
                />
              </label>
            </div>
            <label className="block text-xs text-white/55">
              Postal code
              <input
                value={manualPostal}
                onChange={(event) => setManualPostal(event.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <button
              type="button"
              disabled={busy || !manualRetailer.trim()}
              onClick={() => void addManualStore()}
              className="rounded-full bg-brand-50 px-5 py-2.5 text-sm font-semibold text-[#16110d] disabled:opacity-50"
            >
              Add Store
            </button>
          </section>
        )}

        {error && <p className="text-sm text-red-300/90">{error}</p>}
      </div>
    </ItemManagementDialog>
  );
}
