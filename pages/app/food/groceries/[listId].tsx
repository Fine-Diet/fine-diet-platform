'use client';

/**
 * Food → Grocery List detail — Persistent Grocery Lists v2.
 *
 * Manual item add/edit/check-off/remove on a persistent (planless) list.
 * Named lists support rename, archive/restore (with confirmation), and safe
 * delete when empty. The default "My Grocery List" stays protected.
 *
 * Generated ("planned_meal") contributions show their source plan and link
 * back to the full Plan grocery page for pricing, ingredient resolution,
 * pantry deduction, and shopping-override editing.
 *
 * If the requested id turns out to be a plan-derived list (plan_id set),
 * redirect to the plan-scoped grocery page instead of rendering here.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { planService } from '@/lib/plans';
import type { GeneratedGroceryList, GroceryItem, GroceryItemStatus, Plan } from '@/lib/plans/types';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextStatus(current: GroceryItemStatus): GroceryItemStatus {
  return current === 'pending' ? 'bought' : 'pending';
}

function statusClass(status: GroceryItemStatus): string {
  if (status === 'bought') return 'line-through text-white/30';
  if (status === 'have') return 'line-through text-emerald-300/50';
  if (status === 'skipped') return 'line-through text-white/20';
  return 'text-white';
}

function statusCheckClass(status: GroceryItemStatus): string {
  if (status === 'bought') return 'bg-denim-500/40 border-denim-500/60 text-denim-200';
  if (status === 'have') return 'bg-emerald-500/30 border-emerald-500/50 text-emerald-200';
  if (status === 'skipped') return 'bg-white/[0.04] border-white/10 text-white/20';
  return 'bg-white/[0.04] border-white/10 text-white/0';
}

function requiredLabel(item: GroceryItem): string {
  if (item.quantity != null && item.unit) return `${item.quantity} ${item.unit}`;
  if (item.quantity != null) return String(item.quantity);
  if (item.unit) return item.unit;
  return 'Amount not specified';
}

export default function PersistentGroceryListPage() {
  const router = useRouter();
  const listId = typeof router.query.listId === 'string' ? router.query.listId : null;

  const [list, setList] = useState<GeneratedGroceryList | null>(null);
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [newItemName, setNewItemName] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'archive' | 'delete' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Target-list generation: pull a Plan's pending needs into this list,
  // additively, without disturbing manual items or other batches.
  const [showPullFromPlan, setShowPullFromPlan] = useState(false);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [pullDateStart, setPullDateStart] = useState(todayIso());
  const [pullDateEnd, setPullDateEnd] = useState(todayIso());
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [pullMessage, setPullMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!listId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await planService.getPersistentGroceryList(listId);
      if (result.list.plan_id) {
        void router.replace(
          `${APP_ROUTE_BUILDERS.planGrocery(result.list.plan_id)}?date=${result.list.date_range_start ?? ''}&date_end=${result.list.date_range_end ?? ''}`,
        );
        return;
      }
      setList(result.list);
      setItems(result.items);
      setTitleDraft(result.list.title ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load grocery list.');
    } finally {
      setLoading(false);
    }
  }, [listId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleToggle(item: GroceryItem) {
    if (!listId || togglingId) return;
    const next = nextStatus(item.status);
    setTogglingId(item.id);
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: next } : it)));
    try {
      const updated = await planService.updatePersistentGroceryItem(listId, item.id, { status: next });
      setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
    } catch {
      setItems((prev) => prev.map((it) => (it.id === item.id ? item : it)));
    } finally {
      setTogglingId(null);
    }
  }

  async function handleRemove(item: GroceryItem) {
    if (!listId || removingId) return;
    setRemovingId(item.id);
    try {
      await planService.deletePersistentGroceryItem(listId, item.id);
      setItems((prev) => prev.filter((it) => it.id !== item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove item.');
    } finally {
      setRemovingId(null);
    }
  }

  async function handleAddItem() {
    if (!listId || adding) return;
    const name = newItemName.trim();
    if (!name) return;
    setAdding(true);
    setAddError(null);
    try {
      const item = await planService.addPersistentGroceryItem(listId, {
        name,
        quantity: newItemQuantity.trim() ? Number(newItemQuantity) : null,
        unit: newItemUnit.trim() || null,
      });
      setItems((prev) => [...prev, item]);
      setNewItemName('');
      setNewItemQuantity('');
      setNewItemUnit('');
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add item.');
    } finally {
      setAdding(false);
    }
  }

  async function handleSaveTitle() {
    if (!listId || !list || savingTitle) return;
    const title = titleDraft.trim();
    if (!title) return;
    setSavingTitle(true);
    setActionError(null);
    try {
      const updated = await planService.renameGroceryList(listId, title);
      setList(updated);
      setRenaming(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to rename list.');
    } finally {
      setSavingTitle(false);
    }
  }

  async function handleArchiveToggle() {
    if (!listId || !list || archiving) return;
    // Restore (unarchive) does not need a confirmation dialog.
    if (list.archived_at) {
      setArchiving(true);
      setActionError(null);
      try {
        const updated = await planService.unarchiveGroceryList(listId);
        setList(updated);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to restore list.');
      } finally {
        setArchiving(false);
      }
      return;
    }
    setConfirmAction('archive');
  }

  async function confirmArchive() {
    if (!listId || !list || archiving) return;
    setArchiving(true);
    setActionError(null);
    try {
      const updated = await planService.archiveGroceryList(listId);
      setList(updated);
      setConfirmAction(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to archive list.');
    } finally {
      setArchiving(false);
    }
  }

  async function confirmDelete() {
    if (!listId || !list || deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await planService.deletePersistentGroceryList(listId);
      setConfirmAction(null);
      void router.push('/app/food/groceries');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete list.';
      // Safe-delete only works on empty lists; guide the user honestly.
      if (/empty|items/i.test(message)) {
        setActionError('This list still has items. Remove all items first, or archive instead.');
      } else {
        setActionError(message);
      }
    } finally {
      setDeleting(false);
    }
  }

  async function openPullFromPlan() {
    setShowPullFromPlan(true);
    setPullMessage(null);
    setPullError(null);
    if (plans) return;
    setPlansLoading(true);
    setPlansError(null);
    try {
      const list = await planService.list();
      setPlans(list);
      if (list.length > 0) setSelectedPlanId(list[0].id);
    } catch (err) {
      setPlansError(err instanceof Error ? err.message : 'Failed to load your plans.');
    } finally {
      setPlansLoading(false);
    }
  }

  async function handlePullFromPlan() {
    if (!listId || !selectedPlanId || pulling) return;
    setPulling(true);
    setPullError(null);
    setPullMessage(null);
    try {
      const result = await planService.reconcilePlanGroceryList({
        plan_id: selectedPlanId,
        date: pullDateStart,
        date_end: pullDateEnd,
        target_list_id: listId,
      });
      setItems(result.items);
      const planTitle = plans?.find((p) => p.id === selectedPlanId)?.title ?? 'that plan';
      setPullMessage(`Added ${planTitle}'s pending needs for ${pullDateStart}${pullDateEnd !== pullDateStart ? ` – ${pullDateEnd}` : ''}.`);
    } catch (err) {
      setPullError(err instanceof Error ? err.message : 'Failed to pull needs from that plan.');
    } finally {
      setPulling(false);
    }
  }

  if (!listId) {
    return (
      <div className="min-h-screen bg-brand-900 text-white flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-white/50 antialiased">No list ID.</p>
        </div>
        <JournalFooterNav />
      </div>
    );
  }

  const checkedCount = items.filter((it) => it.status !== 'pending').length;

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">
          <div>
            <Link
              href="/app/food/groceries"
              className="text-[11px] text-white/40 hover:text-white/70 antialiased transition-colors"
            >
              ← Grocery lists
            </Link>
            {loading ? (
              <div className="mt-2 h-7 w-40 animate-pulse rounded-lg bg-white/[0.06]" />
            ) : list ? (
              <div className="mt-1 flex items-start justify-between gap-3">
                {renaming ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      className="flex-1 rounded-xl bg-brand-800 border border-white/10 px-2 py-1 text-lg font-semibold text-white antialiased focus:outline-none focus:border-denim-400"
                    />
                    <button
                      type="button"
                      disabled={savingTitle}
                      onClick={() => void handleSaveTitle()}
                      className="text-xs text-denim-300 hover:text-denim-200 antialiased"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <h1 className="text-lg font-semibold text-white antialiased">
                    {list.title?.trim() || 'Grocery list'}
                    {list.is_default && (
                      <span className="ml-2 align-middle rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/85 antialiased">
                        Default
                      </span>
                    )}
                  </h1>
                )}
                {!list.is_default && !renaming && (
                  <div className="flex items-center gap-3 mt-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setRenaming(true)}
                      className="text-[11px] text-white/45 hover:text-white/70 antialiased"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      disabled={archiving || deleting}
                      onClick={() => void handleArchiveToggle()}
                      className="text-[11px] text-white/45 hover:text-white/70 antialiased disabled:opacity-50"
                    >
                      {list.archived_at ? 'Restore' : 'Archive'}
                    </button>
                    {!list.plan_id && (
                      <button
                        type="button"
                        disabled={archiving || deleting}
                        onClick={() => setConfirmAction('delete')}
                        className="text-[11px] text-red-300/70 hover:text-red-200 antialiased disabled:opacity-50"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : null}
            {actionError && <p className="mt-1 text-[11px] text-red-300 antialiased">{actionError}</p>}
          </div>

          {error ? (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4">
              <p className="text-sm text-red-200 antialiased">{error}</p>
            </div>
          ) : loading ? (
            <div className="rounded-2xl bg-white/[0.04] p-5">
              <p className="text-sm text-white/50 antialiased">Loading…</p>
            </div>
          ) : (
            <>
              {items.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] text-white/40 antialiased">
                    {checkedCount} of {items.length} item{items.length === 1 ? '' : 's'}
                  </p>
                  <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-denim-400/70 transition-all"
                      style={{ width: `${Math.round((checkedCount / Math.max(items.length, 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="rounded-2xl bg-white/[0.04] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-wider text-white/35 antialiased">
                    Pull needs from a Plan
                  </p>
                  <button
                    type="button"
                    onClick={() => (showPullFromPlan ? setShowPullFromPlan(false) : void openPullFromPlan())}
                    className="text-[11px] text-denim-300 hover:text-denim-200 antialiased"
                  >
                    {showPullFromPlan ? 'Close' : 'Choose a plan'}
                  </button>
                </div>
                {showPullFromPlan && (
                  <div className="space-y-2 pt-1">
                    {plansError ? (
                      <p className="text-[11px] text-red-300 antialiased">{plansError}</p>
                    ) : plansLoading || !plans ? (
                      <p className="text-[11px] text-white/40 antialiased">Loading your plans…</p>
                    ) : plans.length === 0 ? (
                      <p className="text-[11px] text-white/40 antialiased">No plans yet.</p>
                    ) : (
                      <>
                        <select
                          value={selectedPlanId}
                          onChange={(e) => setSelectedPlanId(e.target.value)}
                          className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400"
                        >
                          {plans.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                              {plan.title?.trim() || 'Untitled plan'}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={pullDateStart}
                            onChange={(e) => setPullDateStart(e.target.value)}
                            className="flex-1 rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400"
                          />
                          <span className="text-white/30 text-xs">to</span>
                          <input
                            type="date"
                            value={pullDateEnd}
                            onChange={(e) => setPullDateEnd(e.target.value)}
                            className="flex-1 rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={pulling || !selectedPlanId}
                          onClick={() => void handlePullFromPlan()}
                          className="w-full rounded-xl bg-emerald-500/15 border border-emerald-400/25 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50 antialiased"
                        >
                          {pulling ? 'Adding…' : 'Add pending needs to this list'}
                        </button>
                        {pullError && <p className="text-[11px] text-red-300 antialiased">{pullError}</p>}
                        {pullMessage && <p className="text-[11px] text-emerald-300 antialiased">{pullMessage}</p>}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-white/[0.04] p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-white/35 antialiased">Add an item</p>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="Item name"
                    className="flex-1 min-w-[140px] rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/25 antialiased focus:outline-none focus:border-denim-400"
                  />
                  <input
                    value={newItemQuantity}
                    onChange={(e) => setNewItemQuantity(e.target.value)}
                    placeholder="Qty"
                    inputMode="decimal"
                    className="w-20 rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/25 antialiased focus:outline-none focus:border-denim-400"
                  />
                  <input
                    value={newItemUnit}
                    onChange={(e) => setNewItemUnit(e.target.value)}
                    placeholder="Unit"
                    className="w-24 rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/25 antialiased focus:outline-none focus:border-denim-400"
                  />
                  <button
                    type="button"
                    disabled={adding || !newItemName.trim()}
                    onClick={() => void handleAddItem()}
                    className="rounded-xl bg-denim-500/20 border border-denim-400/25 px-3 py-2 text-sm text-denim-100 hover:bg-denim-500/25 disabled:opacity-50 antialiased"
                  >
                    {adding ? 'Adding…' : 'Add'}
                  </button>
                </div>
                {addError && <p className="text-[11px] text-red-300 antialiased">{addError}</p>}
              </div>

              {items.length === 0 ? (
                <div className="rounded-2xl bg-white/[0.04] p-5">
                  <p className="text-sm text-white/60 antialiased">
                    No items yet. Add one above, or add this list's needs from a Plan's shopping
                    list.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl bg-white/[0.04] overflow-hidden divide-y divide-white/[0.04]">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="w-full text-left flex items-start gap-3 py-3 px-3 hover:bg-white/[0.04] transition-colors group"
                    >
                      <button
                        type="button"
                        disabled={togglingId === item.id}
                        onClick={() => void handleToggle(item)}
                        className="mt-0.5 flex-shrink-0 disabled:opacity-60"
                        aria-label={item.status === 'pending' ? 'Mark bought' : 'Mark pending'}
                      >
                        <span
                          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${statusCheckClass(item.status)}`}
                        >
                          {(item.status === 'bought' || item.status === 'have') && (
                            <span className="text-[10px] leading-none">✓</span>
                          )}
                        </span>
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`text-sm antialiased transition-colors ${statusClass(item.status)}`}>
                            {item.name}
                          </p>
                          {item.source_type === 'planned_meal' && (
                            <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[9px] bg-denim-500/15 text-denim-200/90 antialiased border border-denim-400/20">
                              from a plan
                            </span>
                          )}
                        </div>
                        <p className={`text-[11px] antialiased mt-1 ${item.status === 'pending' ? 'text-white/60' : 'text-white/25'}`}>
                          {requiredLabel(item)}
                        </p>
                        {item.notes && (
                          <p className="text-[10px] text-white/30 antialiased mt-0.5">{item.notes}</p>
                        )}
                        {item.source_type === 'planned_meal' && item.source_id && (
                          <Link
                            href={`${APP_ROUTE_BUILDERS.planGrocery(item.source_id)}`}
                            className="inline-block mt-1 text-[10px] text-denim-300 hover:text-denim-200 antialiased"
                          >
                            Open in source Plan for pricing &amp; resolution →
                          </Link>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={removingId === item.id}
                        onClick={() => void handleRemove(item)}
                        className="flex-shrink-0 text-[10px] text-white/30 hover:text-red-300 antialiased disabled:opacity-50 mt-1"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-white/25 antialiased px-1">
                Manual items are yours to edit freely. Items sourced from a Plan refresh
                automatically when you re-add that Plan's needs to this list; removing one here
                only removes it from this list — it does not change the Plan.
              </p>
            </>
          )}
        </div>
      </div>

      {confirmAction && list && (
        <div className="fixed inset-0 z-50 bg-brand-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center px-3 py-5">
          <div className="w-full max-w-md rounded-3xl bg-brand-900 border border-white/10 shadow-2xl overflow-hidden">
            <div className="p-4 space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/40 antialiased">
                  {confirmAction === 'archive' ? 'Archive list' : 'Delete list'}
                </p>
                <h2 className="text-base font-semibold text-white antialiased mt-1">
                  {confirmAction === 'archive'
                    ? `Archive “${list.title?.trim() || 'this list'}”?`
                    : `Delete “${list.title?.trim() || 'this list'}”?`}
                </h2>
                <p className="text-[12px] text-white/45 antialiased mt-2">
                  {confirmAction === 'archive'
                    ? 'This list will be hidden from your active lists. Items are kept, and you can restore it anytime from Archived lists.'
                    : items.length > 0
                      ? 'This list still has items. Remove all items first, or archive instead. Delete only works on empty lists.'
                      : 'This permanently removes the empty list. This cannot be undone.'}
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={archiving || deleting}
                  onClick={() => setConfirmAction(null)}
                  className="rounded-xl px-3 py-2 text-sm text-white/60 hover:text-white/85 antialiased disabled:opacity-50"
                >
                  Cancel
                </button>
                {confirmAction === 'archive' ? (
                  <button
                    type="button"
                    disabled={archiving}
                    onClick={() => void confirmArchive()}
                    className="rounded-xl bg-white/[0.08] border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/[0.12] disabled:opacity-50 antialiased"
                  >
                    {archiving ? 'Archiving…' : 'Archive list'}
                  </button>
                ) : items.length > 0 ? (
                  <button
                    type="button"
                    disabled={archiving}
                    onClick={() => {
                      setConfirmAction('archive');
                      setActionError(null);
                    }}
                    className="rounded-xl bg-white/[0.08] border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/[0.12] disabled:opacity-50 antialiased"
                  >
                    Archive instead
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => void confirmDelete()}
                    className="rounded-xl bg-red-500/15 border border-red-400/25 px-3 py-2 text-sm text-red-200 hover:bg-red-500/20 disabled:opacity-50 antialiased"
                  >
                    {deleting ? 'Deleting…' : 'Delete permanently'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <JournalFooterNav />
    </div>
  );
}
