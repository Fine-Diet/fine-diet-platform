'use client';

/**
 * Persistent Grocery List detail — /app/food/groceries/[listId]
 *
 * Independent of any plan (plan_id IS NULL). Covers the default "My Grocery
 * List" and any user-named list: add/edit/check-off/remove items, rename,
 * archive/unarchive.
 *
 * If the requested list turns out to be plan-derived (plan_id set — e.g. a
 * stale link), this redirects to the rich plan-scoped experience at
 * APP_ROUTE_BUILDERS.planGrocery instead of duplicating that UI. A genuinely
 * planless list is rendered here and never redirected to the index.
 *
 * Requires scripts/sql/addGroceryListFoundation.sql to be applied. Until
 * then, the detail fetch will fail — this is a review-first packet.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { APP_ROUTES, APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { planService } from '@/lib/plans';
import type { GeneratedGroceryList, GroceryItem, GroceryItemStatus } from '@/lib/plans/types';

type LoadState = 'loading' | 'ready' | 'not_found' | 'error';

function nextStatus(current: GroceryItemStatus): GroceryItemStatus {
  return current === 'pending' ? 'bought' : 'pending';
}

function statusClass(status: GroceryItemStatus): string {
  if (status === 'bought') return 'line-through text-white/30';
  if (status === 'have') return 'line-through text-emerald-300/50';
  if (status === 'skipped') return 'line-through text-white/20';
  return 'text-white';
}

export default function PersistentGroceryListDetailPage() {
  const router = useRouter();
  const listId = typeof router.query.listId === 'string' ? router.query.listId : null;

  const [list, setList] = useState<GeneratedGroceryList | null>(null);
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);

  const [addingOpen, setAddingOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!listId) return;
    try {
      const result = await planService.getPersistentGroceryList(listId);
      if (result.list.plan_id) {
        router.replace(
          `${APP_ROUTE_BUILDERS.planGrocery(result.list.plan_id)}?date=${result.list.date_range_start ?? ''}&date_end=${result.list.date_range_end ?? ''}`,
        );
        return;
      }
      setList(result.list);
      setItems(result.items);
      setLoadState('ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load this list.';
      if (/not found/i.test(message)) {
        setLoadState('not_found');
        return;
      }
      setError(message);
      setLoadState('error');
    }
  }, [listId, router]);

  useEffect(() => {
    if (!router.isReady) return;
    load();
  }, [router.isReady, load]);

  const toggleItemStatus = async (item: GroceryItem) => {
    if (!listId) return;
    const next = nextStatus(item.status);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: next } : i)));
    try {
      await planService.updatePersistentGroceryItem(listId, item.id, { status: next });
    } catch (err) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: item.status } : i)));
      setError(err instanceof Error ? err.message : 'Unable to update item.');
    }
  };

  const removeItem = async (item: GroceryItem) => {
    if (!listId) return;
    if (!window.confirm(`Remove "${item.name}" from this list?`)) return;
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    try {
      await planService.deletePersistentGroceryItem(listId, item.id);
    } catch (err) {
      setItems(previous);
      setError(err instanceof Error ? err.message : 'Unable to remove item.');
    }
  };

  const handleAddItem = async () => {
    if (!listId) return;
    const name = newName.trim();
    if (!name) {
      setAddError('Item name is required.');
      return;
    }
    const quantity = newQuantity.trim() ? Number(newQuantity.trim()) : null;
    if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) {
      setAddError('Quantity must be a non-negative number.');
      return;
    }
    setAddBusy(true);
    setAddError(null);
    try {
      const item = await planService.addPersistentGroceryItem(listId, {
        name,
        quantity,
        unit: newUnit.trim() || null,
      });
      setItems((prev) => [...prev, item]);
      setNewName('');
      setNewQuantity('');
      setNewUnit('');
      setAddingOpen(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Unable to add item.');
    } finally {
      setAddBusy(false);
    }
  };

  const submitRename = async () => {
    if (!listId) return;
    const title = renameValue.trim();
    if (!title) return;
    setBusy(true);
    try {
      const updated = await planService.renameGroceryList(listId, title);
      setList(updated);
      setRenaming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to rename list.');
    } finally {
      setBusy(false);
    }
  };

  const handleArchiveToggle = async () => {
    if (!listId || !list) return;
    setBusy(true);
    try {
      const updated = list.archived_at
        ? await planService.unarchiveGroceryList(listId)
        : await planService.archiveGroceryList(listId);
      setList(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update list.');
    } finally {
      setBusy(false);
    }
  };

  if (loadState === 'not_found') {
    return (
      <div className="min-h-screen bg-[#16110d] text-white flex flex-col">
        <main className="flex-1 overflow-y-auto px-4 pb-28 pt-6 sm:px-5">
          <div className="mx-auto max-w-[760px] rounded-[28px] border border-white/[0.06] bg-white/[0.035] p-7 text-center shadow-large">
            <p className="text-lg font-semibold text-brand-50 antialiased">List not found.</p>
            <p className="mt-2 text-sm text-white/55 antialiased">
              It may have been deleted, or you don&rsquo;t have access to it.
            </p>
            <Link
              href={APP_ROUTES.foodGroceries}
              className="mt-5 inline-flex justify-center rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-50"
            >
              Back to Groceries
            </Link>
          </div>
        </main>
        <JournalFooterNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#16110d] text-white flex flex-col">
      <main className="flex-1 overflow-y-auto px-4 pb-28 pt-6 sm:px-5">
        <div className="mx-auto max-w-[760px]">
          <Link
            href={APP_ROUTES.foodGroceries}
            className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200/70 antialiased hover:text-emerald-200"
          >
            ← Groceries
          </Link>

          {loadState === 'loading' && (
            <div className="mt-4 space-y-3">
              <div className="h-20 animate-pulse rounded-[28px] bg-white/[0.04]" />
              <div className="h-16 animate-pulse rounded-2xl bg-white/[0.04]" />
              <div className="h-16 animate-pulse rounded-2xl bg-white/[0.04]" />
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100 antialiased">
              {error}
            </div>
          )}

          {loadState === 'ready' && list && (
            <>
              <section className="mt-4 rounded-[28px] border border-white/[0.06] bg-white/[0.035] p-5 shadow-large sm:p-7">
                {renaming ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      autoFocus
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitRename();
                        if (e.key === 'Escape') setRenaming(false);
                      }}
                      className="flex-1 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-lg font-semibold text-brand-50 antialiased focus:border-emerald-300/50 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={submitRename}
                        className="rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black hover:bg-brand-50 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenaming(false)}
                        className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/60 antialiased hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h1 className="text-2xl font-semibold leading-tight text-brand-50 antialiased sm:text-3xl">
                        {list.title?.trim() || 'Untitled list'}
                      </h1>
                      <p className="mt-2 text-sm text-white/50 antialiased">
                        {list.is_default
                          ? 'Your running list'
                          : list.archived_at
                            ? 'Archived'
                            : `${items.length} item${items.length === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    {!list.is_default && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRenaming(true);
                            setRenameValue(list.title ?? '');
                          }}
                          className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/60 antialiased hover:text-white"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={handleArchiveToggle}
                          className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/60 antialiased hover:text-white disabled:opacity-50"
                        >
                          {list.archived_at ? 'Unarchive' : 'Archive'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section className="mt-5 rounded-[28px] border border-white/[0.06] bg-black/15 p-4 shadow-large sm:p-5">
                {items.length === 0 && !addingOpen && (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-7 text-center">
                    <p className="text-base font-semibold text-brand-50 antialiased">
                      This list is empty.
                    </p>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/55 antialiased">
                      Add an item below to get started.
                    </p>
                  </div>
                )}

                {items.length > 0 && (
                  <ul className="divide-y divide-white/[0.06]">
                    {items.map((item) => (
                      <li key={item.id} className="flex items-center gap-3 py-3">
                        <button
                          type="button"
                          onClick={() => toggleItemStatus(item)}
                          aria-label={item.status === 'bought' ? 'Mark as not bought' : 'Mark as bought'}
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                            item.status === 'bought'
                              ? 'border-emerald-400/60 bg-emerald-500/30 text-emerald-100'
                              : 'border-white/20 bg-white/[0.03] text-transparent'
                          }`}
                        >
                          ✓
                        </button>
                        <div className={`min-w-0 flex-1 ${statusClass(item.status)}`}>
                          <p className="truncate text-sm font-medium antialiased">{item.name}</p>
                          {(item.quantity != null || item.unit) && (
                            <p className="text-xs text-white/40 antialiased">
                              {[item.quantity, item.unit].filter(Boolean).join(' ')}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(item)}
                          className="shrink-0 text-xs font-medium text-white/35 antialiased hover:text-red-300"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {addingOpen ? (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        autoFocus
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddItem();
                        }}
                        placeholder="Item name"
                        className="flex-1 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-brand-50 antialiased placeholder:text-white/30 focus:border-emerald-300/50 focus:outline-none"
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={newQuantity}
                        onChange={(e) => setNewQuantity(e.target.value)}
                        placeholder="Qty"
                        className="w-full rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-brand-50 antialiased placeholder:text-white/30 focus:border-emerald-300/50 focus:outline-none sm:w-20"
                      />
                      <input
                        type="text"
                        value={newUnit}
                        onChange={(e) => setNewUnit(e.target.value)}
                        placeholder="Unit"
                        className="w-full rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-brand-50 antialiased placeholder:text-white/30 focus:border-emerald-300/50 focus:outline-none sm:w-24"
                      />
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={addBusy}
                        onClick={handleAddItem}
                        className="rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-50 disabled:opacity-50"
                      >
                        {addBusy ? 'Adding…' : 'Add item'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingOpen(false);
                          setAddError(null);
                        }}
                        className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/60 antialiased hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                    {addError && <p className="mt-2 text-xs text-red-300 antialiased">{addError}</p>}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingOpen(true)}
                    className="mt-3 w-full rounded-2xl border border-dashed border-white/15 py-3 text-sm font-semibold text-emerald-200/80 antialiased hover:border-emerald-300/40 hover:text-emerald-200"
                  >
                    + Add item
                  </button>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      <JournalFooterNav />
    </div>
  );
}
