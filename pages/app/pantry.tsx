'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { planService, type PantryOnHandItem } from '@/lib/plans';

type LoadState = 'loading' | 'ready' | 'error';

interface PantryDraft {
  quantity: string;
  unit: string;
}

function sortPantryItems(items: PantryOnHandItem[]): PantryOnHandItem[] {
  return [...items].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatAmount(item: PantryOnHandItem): string {
  if (item.quantity == null) return item.unit ? `Amount saved (${item.unit})` : 'Amount saved';
  return item.unit ? `${item.quantity} ${item.unit}` : String(item.quantity);
}

function draftFromItem(item: PantryOnHandItem): PantryDraft {
  return {
    quantity: item.quantity == null ? '' : String(item.quantity),
    unit: item.unit ?? '',
  };
}

function PantrySkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((idx) => (
        <div
          key={idx}
          className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4"
        >
          <div className="h-4 w-2/5 animate-pulse rounded-full bg-white/10" />
          <div className="mt-3 h-3 w-1/4 animate-pulse rounded-full bg-white/10" />
          <div className="mt-2 h-3 w-1/3 animate-pulse rounded-full bg-white/10" />
        </div>
      ))}
    </div>
  );
}

export default function PantryPage() {
  const [items, setItems] = useState<PantryOnHandItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, PantryDraft>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const pantryCountLabel = useMemo(() => {
    if (items.length === 1) return '1 item on hand';
    return `${items.length} items on hand`;
  }, [items.length]);

  const loadPantry = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const pantryItems = await planService.listPantryOnHandItems();
      setItems(sortPantryItems(pantryItems));
      setLoadState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load pantry.');
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void loadPantry();
  }, [loadPantry]);

  function beginEdit(item: PantryOnHandItem) {
    setEditingKey(item.key);
    setError(null);
    setDrafts((current) => ({
      ...current,
      [item.key]: current[item.key] ?? draftFromItem(item),
    }));
  }

  function cancelEdit() {
    setEditingKey(null);
    setError(null);
  }

  function updateDraft(key: string, patch: Partial<PantryDraft>) {
    setDrafts((current) => ({
      ...current,
      [key]: { ...(current[key] ?? { quantity: '', unit: '' }), ...patch },
    }));
  }

  async function saveEdit(item: PantryOnHandItem) {
    const draft = drafts[item.key] ?? draftFromItem(item);
    const quantity = Number(draft.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      setError('Quantity must be a non-negative number.');
      return;
    }

    setSavingKey(item.key);
    setError(null);
    try {
      const updated = await planService.updatePantryOnHandItem(item.key, {
        quantity,
        unit: draft.unit.trim() || null,
      });
      setItems((current) => sortPantryItems([
        ...current.filter((candidate) => candidate.key !== item.key && candidate.key !== updated.key),
        updated,
      ]));
      setDrafts((current) => {
        const next = { ...current };
        delete next[item.key];
        next[updated.key] = draftFromItem(updated);
        return next;
      });
      setEditingKey(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save pantry item.');
    } finally {
      setSavingKey(null);
    }
  }

  async function deleteItem(item: PantryOnHandItem) {
    if (!window.confirm(`Delete ${item.name} from your pantry?`)) return;

    setDeletingKey(item.key);
    setError(null);
    try {
      await planService.deletePantryOnHandItem(item.key);
      setItems((current) => current.filter((candidate) => candidate.key !== item.key));
      setEditingKey((current) => (current === item.key ? null : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete pantry item.');
    } finally {
      setDeletingKey(null);
    }
  }

  return (
    <main className="min-h-[calc(100vh-36px)] bg-[#16110d] px-4 pb-12 pt-6 sm:px-5">
      <div className="mx-auto max-w-[760px]">
        <section className="rounded-[28px] border border-white/[0.06] bg-white/[0.035] p-5 shadow-large sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200/70 antialiased">
                Pantry
              </p>
              <h1 className="mt-2 text-3xl font-semibold leading-tight text-brand-50 antialiased sm:text-4xl">
                On-hand items
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60 antialiased">
                Manage the explicit pantry quantities used by future grocery readiness.
                Required grocery amounts stay primary; deduction only applies when identity and unit match safely.
              </p>
            </div>
            <Link
              href={APP_ROUTES.plans}
              className="inline-flex justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-brand-50/80 transition-colors hover:bg-white/[0.08] hover:text-brand-50"
            >
              Back to Plans
            </Link>
          </div>
        </section>

        <section className="mt-5 rounded-[28px] border border-white/[0.06] bg-black/15 p-4 shadow-large sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3 px-1">
            <div>
              <h2 className="text-base font-semibold text-brand-50 antialiased">
                Current pantry
              </h2>
              <p className="text-xs text-white/45 antialiased">{pantryCountLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => void loadPantry()}
              disabled={loadState === 'loading'}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100 antialiased">
              {error}
            </div>
          )}

          {loadState === 'loading' && <PantrySkeleton />}

          {loadState === 'error' && (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 text-center">
              <p className="text-sm font-semibold text-brand-50">Pantry could not load.</p>
              <p className="mt-2 text-sm text-white/55">
                Try again, or return to Plans and reopen this page.
              </p>
            </div>
          )}

          {loadState === 'ready' && items.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-7 text-center">
              <p className="text-base font-semibold text-brand-50 antialiased">
                No pantry items yet.
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/55 antialiased">
                Add on-hand amounts from grounded grocery rows with "Set on hand."
                They will appear here for independent pantry management.
              </p>
            </div>
          )}

          {loadState === 'ready' && items.length > 0 && (
            <div className="space-y-3">
              {items.map((item) => {
                const isEditing = editingKey === item.key;
                const draft = drafts[item.key] ?? draftFromItem(item);
                const isSaving = savingKey === item.key;
                const isDeleting = deletingKey === item.key;

                return (
                  <article
                    key={item.key}
                    className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-base font-semibold text-brand-50 antialiased">
                          {item.name}
                        </h3>
                        {isEditing ? (
                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,140px)_minmax(0,180px)]">
                            <label className="block">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                                Quantity
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={draft.quantity}
                                onChange={(event) => updateDraft(item.key, { quantity: event.target.value })}
                                className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-brand-50 outline-none transition-colors focus:border-emerald-300/50"
                              />
                            </label>
                            <label className="block">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                                Unit
                              </span>
                              <input
                                type="text"
                                value={draft.unit}
                                onChange={(event) => updateDraft(item.key, { unit: event.target.value })}
                                placeholder="item, cup, g..."
                                className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-brand-50 outline-none transition-colors placeholder:text-white/25 focus:border-emerald-300/50"
                              />
                            </label>
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-emerald-100/80 antialiased">
                            {formatAmount(item)}
                          </p>
                        )}
                        <p className="mt-2 text-xs text-white/40 antialiased">
                          Updated {formatDateTime(item.updated_at)}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void saveEdit(item)}
                              disabled={isSaving || isDeleting}
                              className="rounded-full bg-[#d7ecff] px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-brand-50 disabled:opacity-60"
                            >
                              {isSaving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={isSaving}
                              className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => beginEdit(item)}
                              disabled={isDeleting}
                              className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteItem(item)}
                              disabled={isDeleting}
                              className="rounded-full border border-red-300/20 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-100/80 transition-colors hover:bg-red-500/15 hover:text-red-50 disabled:opacity-60"
                            >
                              {isDeleting ? 'Deleting...' : 'Delete'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
