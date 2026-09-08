'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';

import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { SignedInPageScroll } from '@/components/layout/SignedInPageShell';
import { AppDialog } from '@/components/ui/AppDialog';
import { GroceryPricePanel } from '@/components/grocery/GroceryPricingUi';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { planService } from '@/lib/plans';
import {
  groupGroceryAddSuggestions,
  parseGroceryAddIntent,
  type GroceryAddSuggestion,
} from '@/lib/plans/groceryListAddIntent';
import { formatGroceryCurrency } from '@/lib/plans/groceryPricingFormat';
import { listPriceToHaulObservation } from '@/lib/plans/groceryListPriceObservationDisplay';
import type {
  GeneratedGroceryList,
  GroceryItem,
  GroceryListPriceObservation,
  GroceryListPurchasingChoice,
} from '@/lib/plans/types';
import type { FoodSearchResult } from '@/lib/food/types';

type LoadState = 'loading' | 'ready' | 'error';
type ResolveCandidate = Pick<FoodSearchResult, 'food' | 'source' | 'source_label'>;

function listTitle(list: GeneratedGroceryList): string {
  return list.title?.trim() || (list.is_default ? 'Essentials' : 'Untitled List');
}

function productName(
  choice: GroceryListPurchasingChoice | undefined,
  price: GroceryListPriceObservation | undefined,
): string | null {
  return (
    choice?.shopping_display_name?.trim() ||
    choice?.preferred_product?.trim() ||
    price?.product_title?.trim() ||
    null
  );
}

function quantityLabel(item: GroceryItem): string {
  const quantity = item.quantity ?? 1;
  return item.unit ? `${quantity} ${item.unit}` : String(quantity);
}

export default function ListsManager() {
  const router = useRouter();
  const selectedFromRoute =
    typeof router.query.listId === 'string' ? router.query.listId : null;

  const [lists, setLists] = useState<GeneratedGroceryList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [list, setList] = useState<GeneratedGroceryList | null>(null);
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [choices, setChoices] = useState<Record<string, GroceryListPurchasingChoice>>({});
  const [prices, setPrices] = useState<Record<string, GroceryListPriceObservation>>({});
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);

  const [newListOpen, setNewListOpen] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [creatingList, setCreatingList] = useState(false);
  const [newListError, setNewListError] = useState<string | null>(null);

  const [addQuery, setAddQuery] = useState('');
  const [addSuggestions, setAddSuggestions] = useState<{
    ingredients: GroceryAddSuggestion[];
    products: GroceryAddSuggestion[];
  }>({ ingredients: [], products: [] });
  const [searchingAdd, setSearchingAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [editItem, setEditItem] = useState<GroceryItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [resolveItem, setResolveItem] = useState<GroceryItem | null>(null);
  const [resolveQuery, setResolveQuery] = useState('');
  const [resolveResults, setResolveResults] = useState<ResolveCandidate[]>([]);
  const [searchingResolve, setSearchingResolve] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [priceItem, setPriceItem] = useState<GroceryItem | null>(null);
  const [priceBusy, setPriceBusy] = useState(false);

  const [haulOpen, setHaulOpen] = useState(false);
  const [shoppingDate, setShoppingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startingHaul, setStartingHaul] = useState(false);
  const [haulError, setHaulError] = useState<string | null>(null);

  const addIntent = useMemo(() => parseGroceryAddIntent(addQuery), [addQuery]);

  const loadLists = useCallback(async () => {
    const overview = await planService.getGroceryListsOverview();
    const activeLists = [overview.default_list, ...overview.named_lists].filter(
      (candidate): candidate is GeneratedGroceryList => Boolean(candidate && !candidate.archived_at),
    );
    setLists(activeLists);
    return activeLists;
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    let cancelled = false;
    void loadLists()
      .then((activeLists) => {
        if (cancelled) return;
        const requested = activeLists.find((candidate) => candidate.id === selectedFromRoute);
        const selected = requested ?? activeLists.find((candidate) => candidate.is_default) ?? activeLists[0];
        setSelectedListId(selected?.id ?? null);
        if (selected && selected.id !== selectedFromRoute) {
          void router.replace(
            { pathname: '/app/food/lists', query: { listId: selected.id } },
            undefined,
            { shallow: true },
          );
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load Lists.');
          setLoadState('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadLists, router.isReady, selectedFromRoute]);

  const loadSelectedList = useCallback(async () => {
    if (!selectedListId) return;
    setLoadState('loading');
    setError(null);
    try {
      const [detail, listChoices] = await Promise.all([
        planService.getPersistentGroceryList(selectedListId),
        planService.getPersistentGroceryPurchasingChoices(selectedListId).catch(() => ({})),
      ]);
      setList(detail.list);
      setItems(detail.items);
      setChoices(listChoices);
      const summary = await planService
        .getPersistentGroceryHaulSummary(selectedListId)
        .catch(() => null);
      setPrices(summary?.list_prices_by_item_id ?? {});
      setLoadState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load this List.');
      setLoadState('error');
    }
  }, [selectedListId]);

  useEffect(() => {
    void loadSelectedList();
  }, [loadSelectedList]);

  useEffect(() => {
    const query = addIntent.name.trim() || addQuery.trim();
    if (query.length < 2) {
      setAddSuggestions({ ingredients: [], products: [] });
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchingAdd(true);
      try {
        const params = new URLSearchParams({
          q: query,
          limit: '10',
          consumer: 'flat',
          pageContext: 'grocery_list_add',
        });
        const response = await fetch(`/api/foods/search?${params.toString()}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        const body = (await response.json()) as { results?: FoodSearchResult[] };
        setAddSuggestions(
          groupGroceryAddSuggestions({
            intentName: addIntent.name || addQuery,
            results: body.results ?? [],
            correctionHint: addIntent.correction_hint,
          }),
        );
      } catch {
        if (!controller.signal.aborted) {
          setAddSuggestions({ ingredients: [], products: [] });
        }
      } finally {
        if (!controller.signal.aborted) setSearchingAdd(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [addIntent.correction_hint, addIntent.name, addQuery]);

  useEffect(() => {
    if (!resolveItem) return;
    const query = resolveQuery.trim();
    if (query.length < 2) {
      setResolveResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchingResolve(true);
      setResolveError(null);
      try {
        const params = new URLSearchParams({ q: query, limit: '10' });
        const response = await fetch(`/api/foods/search?${params.toString()}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        const body = (await response.json()) as { results?: ResolveCandidate[] };
        setResolveResults(body.results ?? []);
      } catch {
        if (!controller.signal.aborted) setResolveResults([]);
      } finally {
        if (!controller.signal.aborted) setSearchingResolve(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [resolveItem, resolveQuery]);

  function selectList(nextListId: string) {
    setSelectedListId(nextListId);
    setAddQuery('');
    setAddSuggestions({ ingredients: [], products: [] });
    void router.push(
      { pathname: '/app/food/lists', query: { listId: nextListId } },
      undefined,
      { shallow: true },
    );
  }

  async function createList() {
    const title = newListTitle.trim();
    if (!title || creatingList) return;
    setCreatingList(true);
    setNewListError(null);
    try {
      const created = await planService.createNamedGroceryList(title);
      await loadLists();
      setNewListOpen(false);
      setNewListTitle('');
      selectList(created.id);
    } catch (err) {
      setNewListError(err instanceof Error ? err.message : 'Unable to create this List.');
    } finally {
      setCreatingList(false);
    }
  }

  async function addItem(input: {
    name: string;
    quantity: number | null;
    unit: string | null;
    raw_entry: string;
    food_object_id?: string;
    create_purchasing_choice?: boolean;
  }) {
    if (!selectedListId || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const result = await planService.addPersistentGroceryItem(selectedListId, input);
      setItems((current) => [...current, result.item]);
      if (result.choice) {
        setChoices((current) => ({ ...current, [result.item.id]: result.choice! }));
      }
      setAddQuery('');
      setAddSuggestions({ ingredients: [], products: [] });
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Unable to add this item.');
    } finally {
      setAdding(false);
    }
  }

  function addUnresolved() {
    const intent = parseGroceryAddIntent(addQuery);
    if (!intent.raw_entry) return;
    void addItem({
      name: intent.name || intent.raw_entry,
      quantity: intent.quantity,
      unit: intent.unit,
      raw_entry: intent.raw_entry,
    });
  }

  function addSuggestion(suggestion: GroceryAddSuggestion) {
    const intent = parseGroceryAddIntent(addQuery);
    if (!intent.raw_entry) return;
    void addItem({
      name: intent.name || suggestion.label,
      quantity: intent.quantity,
      unit: intent.unit,
      raw_entry: intent.raw_entry,
      food_object_id: suggestion.food_object_id,
      create_purchasing_choice: suggestion.group === 'product',
    });
  }

  async function changeQuantity(item: GroceryItem, delta: number) {
    if (!selectedListId) return;
    const previous = item.quantity ?? 1;
    const quantity = Math.max(0, previous + delta);
    setItems((current) =>
      current.map((candidate) => (candidate.id === item.id ? { ...candidate, quantity } : candidate)),
    );
    try {
      const updated = await planService.updatePersistentGroceryItem(selectedListId, item.id, {
        quantity,
      });
      setItems((current) =>
        current.map((candidate) => (candidate.id === item.id ? updated : candidate)),
      );
    } catch {
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === item.id ? { ...candidate, quantity: item.quantity } : candidate,
        ),
      );
    }
  }

  function openEdit(item: GroceryItem) {
    setEditItem(item);
    setEditName(item.name);
    setEditQuantity(item.quantity == null ? '' : String(item.quantity));
    setEditUnit(item.unit ?? '');
    setEditNotes(item.notes ?? '');
    setEditError(null);
  }

  async function saveEdit() {
    if (!selectedListId || !editItem || savingEdit) return;
    const quantity = editQuantity.trim() === '' ? null : Number(editQuantity);
    if (!editName.trim()) {
      setEditError('Need is required.');
      return;
    }
    if (quantity != null && (!Number.isFinite(quantity) || quantity < 0)) {
      setEditError('Quantity must be zero or greater.');
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      const updated = await planService.updatePersistentGroceryItem(selectedListId, editItem.id, {
        name: editName.trim(),
        quantity,
        unit: editUnit.trim() || null,
        notes: editNotes.trim() || null,
      });
      setItems((current) =>
        current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
      setEditItem(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unable to save this item.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function removeItem() {
    if (!selectedListId || !editItem || savingEdit) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      await planService.deletePersistentGroceryItem(selectedListId, editItem.id);
      setItems((current) => current.filter((candidate) => candidate.id !== editItem.id));
      setEditItem(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unable to remove this item.');
    } finally {
      setSavingEdit(false);
    }
  }

  function openChooseProduct(item: GroceryItem) {
    setResolveItem(item);
    setResolveQuery(item.name);
    setResolveResults([]);
    setResolveError(null);
  }

  async function chooseProduct(candidate: ResolveCandidate) {
    if (!selectedListId || !resolveItem || resolving) return;
    setResolving(true);
    setResolveError(null);
    try {
      const result = await planService.resolvePersistentGroceryItemForList(
        selectedListId,
        resolveItem.id,
        {
          food_object_id: candidate.food.id,
          remember_for_future: false,
          save_to_source_plan: false,
        },
      );
      setChoices((current) => ({ ...current, [resolveItem.id]: result.choice }));
      setResolveItem(null);
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : 'Unable to choose this product.');
    } finally {
      setResolving(false);
    }
  }

  async function buildHaul() {
    if (!selectedListId || !shoppingDate || startingHaul) return;
    setStartingHaul(true);
    setHaulError(null);
    try {
      const result = await planService.startGroceryHaulFromList(selectedListId, {
        shopping_date: shoppingDate,
        creation_token: crypto.randomUUID(),
      });
      void router.push(APP_ROUTE_BUILDERS.foodHaul(result.haul_id));
    } catch (err) {
      setHaulError(err instanceof Error ? err.message : 'Unable to build this Haul.');
    } finally {
      setStartingHaul(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#16110d] text-white">
      <SignedInPageScroll className="px-6 pt-10 sm:px-12 sm:pt-14">
        <div className="mx-auto w-full max-w-[1000px]">
          <header>
            <p className="text-lg font-semibold text-white">Lists</p>
            <h1 className="mt-1 text-4xl font-light tracking-tight text-brand-50 sm:text-5xl">
              Manage your lists
            </h1>
          </header>

          <section className="mt-8" aria-label="Selected List">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
              Select a List
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={selectedListId ?? ''}
                onChange={(event) => selectList(event.target.value)}
                className="min-h-12 flex-1 rounded-xl border border-white/20 bg-[#211a14] px-4 text-sm font-semibold text-white outline-none focus:border-white/50"
                aria-label="Select a List"
              >
                {lists.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {listTitle(candidate)}
                    {candidate.is_default ? ' (Default List)' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setNewListOpen(true)}
                className="min-h-12 rounded-xl bg-brand-50 px-6 text-sm font-semibold text-[#16110d] hover:bg-white"
              >
                + New List
              </button>
            </div>
          </section>

          {error && (
            <p className="mt-5 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100" role="alert">
              {error}
            </p>
          )}

          <section className="mt-6" aria-label="Search and add items">
            <div className="flex gap-2 border-b border-white/25 pb-2">
              <input
                type="search"
                value={addQuery}
                onChange={(event) => setAddQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addUnresolved();
                }}
                disabled={Boolean(list?.plan_id)}
                placeholder={list?.plan_id ? 'Plan-generated Lists are read-only' : 'Search to add item(s)'}
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={addUnresolved}
                disabled={adding || !addQuery.trim() || Boolean(list?.plan_id)}
                className="rounded-full px-3 text-xl text-white/60 hover:text-white disabled:opacity-30"
                aria-label="Add requested item"
              >
                +
              </button>
            </div>
            {addError && <p className="mt-2 text-xs text-red-200" role="alert">{addError}</p>}
            {(searchingAdd ||
              addSuggestions.ingredients.length > 0 ||
              addSuggestions.products.length > 0) && (
              <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#211a14]">
                {searchingAdd ? (
                  <p className="px-4 py-3 text-sm text-white/45">Searching…</p>
                ) : (
                  [...addSuggestions.ingredients, ...addSuggestions.products].map((suggestion) => (
                    <button
                      key={`${suggestion.group}-${suggestion.food_object_id}`}
                      type="button"
                      disabled={adding}
                      onClick={() => addSuggestion(suggestion)}
                      className="block w-full border-b border-white/[0.06] px-4 py-3 text-left last:border-0 hover:bg-white/[0.04]"
                    >
                      <span className="block text-sm text-white">{suggestion.label}</span>
                      <span className="block text-[11px] text-white/40">
                        {suggestion.group === 'product' ? 'Purchasing product' : 'Requested need'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </section>

          <section className="mt-5" aria-label="List items">
            {loadState === 'loading' ? (
              <div className="space-y-3">
                {[0, 1, 2].map((value) => (
                  <div key={value} className="h-28 animate-pulse rounded-xl bg-white/[0.03]" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <p className="py-12 text-center text-sm text-white/40">
                This List is ready for its first item.
              </p>
            ) : (
              <div className="divide-y divide-white/[0.08]">
                {items.map((item) => {
                  const choice = choices[item.id];
                  const price = prices[item.id];
                  const product = productName(choice, price);
                  return (
                    <article key={item.id} className="relative py-5 pr-16">
                      <h2 className="text-base font-semibold text-brand-50">{item.name}</h2>
                      {product ? (
                        <>
                          <p className="mt-1 text-sm text-white/55">{product}</p>
                          {price?.retailer && (
                            <p className="mt-0.5 text-xs text-white/40">{price.retailer}</p>
                          )}
                          {price && (
                            <p className="mt-0.5 text-xs text-white/50">
                              {formatGroceryCurrency(price.line_total, price.currency)}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => setPriceItem(item)}
                            className="mt-1 text-xs text-white/35 hover:text-white/65"
                          >
                            {price ? 'Update Price' : 'Find Price'}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openChooseProduct(item)}
                          className="mt-2 rounded-full bg-brand-50 px-4 py-1 text-xs font-semibold text-[#16110d] hover:bg-white"
                        >
                          Choose Product
                        </button>
                      )}
                      <div className="mt-3 inline-flex items-center rounded-full border border-white/20 text-xs">
                        <button
                          type="button"
                          onClick={() => void changeQuantity(item, -1)}
                          className="px-3 py-1 text-white/60 hover:text-white"
                          aria-label={`Decrease ${item.name} quantity`}
                        >
                          −
                        </button>
                        <span className="min-w-14 text-center text-white/75">{quantityLabel(item)}</span>
                        <button
                          type="button"
                          onClick={() => void changeQuantity(item, 1)}
                          className="px-3 py-1 text-white/60 hover:text-white"
                          aria-label={`Increase ${item.name} quantity`}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="absolute right-0 top-5 rounded-full px-3 py-1 text-xs font-semibold text-white/55 hover:bg-white/[0.06] hover:text-white"
                      >
                        Edit
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
            <p className="mt-4 text-right text-xs text-white/35">
              {items.length} total item{items.length === 1 ? '' : 's'}
            </p>
          </section>

          <section className="mb-8 mt-8 rounded-[24px] border border-white/25 bg-white/[0.035] px-6 py-8 sm:px-10">
            <h2 className="text-xl font-semibold text-brand-50">Ready to shop?</h2>
            <p className="mt-1 text-sm text-white/45">
              Create a haul to combine items from one or more lists.
            </p>
            <button
              type="button"
              onClick={() => {
                setHaulError(null);
                setHaulOpen(true);
              }}
              disabled={items.length === 0}
              className="mt-5 w-full rounded-full bg-brand-50 px-5 py-2.5 text-sm font-semibold text-[#16110d] hover:bg-white disabled:opacity-40"
            >
              Build a Haul
            </button>
          </section>
        </div>
      </SignedInPageScroll>

      <AppDialog
        open={newListOpen}
        onClose={() => !creatingList && setNewListOpen(false)}
        labelledBy="new-list-title"
        panelClassName="border border-white/10 bg-[#211a14] shadow-2xl"
      >
        <div className="p-5">
          <h2 id="new-list-title" className="text-xl font-semibold text-white">New List</h2>
          <label className="mt-5 block">
            <span className="text-xs text-white/55">List name</span>
            <input
              autoFocus
              value={newListTitle}
              onChange={(event) => setNewListTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void createList();
              }}
              className="mt-1 w-full rounded-xl border border-white/15 bg-[#16110d] px-3 py-2 text-white outline-none focus:border-white/40"
            />
          </label>
          {newListError && <p className="mt-2 text-sm text-red-200" role="alert">{newListError}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setNewListOpen(false)} className="px-4 py-2 text-sm text-white/55">Cancel</button>
            <button
              type="button"
              onClick={() => void createList()}
              disabled={creatingList || !newListTitle.trim()}
              className="rounded-full bg-brand-50 px-5 py-2 text-sm font-semibold text-[#16110d] disabled:opacity-40"
            >
              {creatingList ? 'Creating…' : 'Create List'}
            </button>
          </div>
        </div>
      </AppDialog>

      <AppDialog
        open={Boolean(editItem)}
        onClose={() => !savingEdit && setEditItem(null)}
        labelledBy="edit-list-item-title"
        panelClassName="border border-white/10 bg-[#211a14] shadow-2xl"
      >
        <div className="p-5">
          <h2 id="edit-list-item-title" className="text-xl font-semibold text-white">Edit List item</h2>
          <div className="mt-5 space-y-3">
            <label className="block">
              <span className="text-xs text-white/55">Need</span>
              <input value={editName} onChange={(event) => setEditName(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-[#16110d] px-3 py-2 text-white outline-none" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="text-xs text-white/55">Quantity</span>
                <input type="number" min="0" step="0.01" value={editQuantity} onChange={(event) => setEditQuantity(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-[#16110d] px-3 py-2 text-white outline-none" />
              </label>
              <label>
                <span className="text-xs text-white/55">Unit</span>
                <input value={editUnit} onChange={(event) => setEditUnit(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-[#16110d] px-3 py-2 text-white outline-none" />
              </label>
            </div>
            <label className="block">
              <span className="text-xs text-white/55">Notes</span>
              <textarea value={editNotes} onChange={(event) => setEditNotes(event.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-white/15 bg-[#16110d] px-3 py-2 text-white outline-none" />
            </label>
          </div>
          {editError && <p className="mt-2 text-sm text-red-200" role="alert">{editError}</p>}
          <div className="mt-5 flex items-center justify-between gap-2">
            <button type="button" onClick={() => void removeItem()} disabled={savingEdit} className="text-sm text-red-200/80">Remove from List</button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => {
                  const item = editItem;
                  setEditItem(null);
                  if (item) openChooseProduct(item);
                }}
                className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/70"
              >
                {editItem && productName(choices[editItem.id], prices[editItem.id])
                  ? 'Change Product'
                  : 'Choose Product'}
              </button>
              <button type="button" onClick={() => void saveEdit()} disabled={savingEdit} className="rounded-full bg-brand-50 px-5 py-2 text-sm font-semibold text-[#16110d] disabled:opacity-40">
                {savingEdit ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </AppDialog>

      <AppDialog
        open={Boolean(resolveItem)}
        onClose={() => !resolving && setResolveItem(null)}
        labelledBy="choose-product-title"
        panelClassName="border border-white/10 bg-[#211a14] shadow-2xl"
      >
        <div className="p-5">
          <h2 id="choose-product-title" className="text-xl font-semibold text-white">Choose Product</h2>
          <p className="mt-1 text-sm text-white/45">
            The requested need stays “{resolveItem?.name}”.
          </p>
          <input
            autoFocus
            type="search"
            value={resolveQuery}
            onChange={(event) => setResolveQuery(event.target.value)}
            placeholder="Search products"
            className="mt-4 w-full rounded-xl border border-white/15 bg-[#16110d] px-3 py-2 text-white outline-none"
          />
          <div className="mt-3 max-h-72 overflow-y-auto">
            {searchingResolve ? (
              <p className="py-3 text-sm text-white/45">Searching…</p>
            ) : (
              resolveResults.map((candidate) => (
                <button
                  key={candidate.food.id}
                  type="button"
                  disabled={resolving}
                  onClick={() => void chooseProduct(candidate)}
                  className="block w-full border-b border-white/[0.06] px-2 py-3 text-left last:border-0 hover:bg-white/[0.04]"
                >
                  <span className="block text-sm text-white">
                    {candidate.food.brandName
                      ? `${candidate.food.brandName} — ${candidate.food.canonicalName}`
                      : candidate.food.canonicalName}
                  </span>
                  <span className="block text-xs text-white/35">
                    {candidate.source_label ?? candidate.source}
                  </span>
                </button>
              ))
            )}
          </div>
          {resolveError && <p className="mt-2 text-sm text-red-200" role="alert">{resolveError}</p>}
        </div>
      </AppDialog>

      <AppDialog
        open={haulOpen}
        onClose={() => !startingHaul && setHaulOpen(false)}
        labelledBy="build-haul-title"
        panelClassName="border border-white/10 bg-[#211a14] shadow-2xl"
      >
        <div className="p-5">
          <h2 id="build-haul-title" className="text-xl font-semibold text-white">Build a Haul</h2>
          <p className="mt-1 text-sm leading-relaxed text-white/45">
            This creates a dated snapshot. Your source List and its items stay intact.
          </p>
          <label className="mt-5 block">
            <span className="text-xs text-white/55">Shopping date</span>
            <input type="date" value={shoppingDate} onChange={(event) => setShoppingDate(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-[#16110d] px-3 py-2 text-white outline-none" />
          </label>
          {haulError && <p className="mt-2 text-sm text-red-200" role="alert">{haulError}</p>}
          <button type="button" onClick={() => void buildHaul()} disabled={startingHaul || !shoppingDate} className="mt-5 w-full rounded-full bg-brand-50 px-5 py-2.5 text-sm font-semibold text-[#16110d] disabled:opacity-40">
            {startingHaul ? 'Building…' : 'Build a Haul'}
          </button>
        </div>
      </AppDialog>

      {priceItem && selectedListId && (
        <GroceryPricePanel
          item={{
            ...priceItem,
            name: productName(choices[priceItem.id], prices[priceItem.id]) ?? priceItem.name,
          }}
          currentObservation={
            prices[priceItem.id]
              ? listPriceToHaulObservation(prices[priceItem.id])
              : null
          }
          entryMode="search"
          busy={priceBusy}
          onClose={() => !priceBusy && setPriceItem(null)}
          onSearch={async (input) => {
            setPriceBusy(true);
            try {
              return await planService.searchPersistentGroceryItemPrices(
                selectedListId,
                priceItem.id,
                input,
              );
            } finally {
              setPriceBusy(false);
            }
          }}
          onConfirmOffer={async (input) => {
            setPriceBusy(true);
            try {
              return await planService.confirmPersistentGroceryItemPrice(
                selectedListId,
                priceItem.id,
                input,
              );
            } finally {
              setPriceBusy(false);
            }
          }}
          onSaveManual={async (input) => {
            setPriceBusy(true);
            try {
              const observation = await planService.savePersistentGroceryItemManualPrice(
                selectedListId,
                priceItem.id,
                {
                  unit_price: input.unit_price,
                  package_count: input.package_count,
                  currency: input.currency,
                  product_title: input.product_title,
                  retailer: input.retailer,
                },
              );
              return listPriceToHaulObservation(observation);
            } finally {
              setPriceBusy(false);
            }
          }}
          onObservationSaved={() => {
            void planService
              .getPersistentGroceryHaulSummary(selectedListId)
              .then((summary) => setPrices(summary.list_prices_by_item_id ?? {}));
            setPriceItem(null);
          }}
        />
      )}

      <JournalFooterNav />
    </div>
  );
}
