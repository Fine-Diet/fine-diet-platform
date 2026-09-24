'use client';

import { useEffect, useState } from 'react';

import { ItemManagementDialog } from '@/components/food/itemManagement/ItemManagementDialog';
import { planService } from '@/lib/plans';
import { todayLocalDateKey } from '@/lib/plans/planDateRange';
import type { GeneratedGroceryList, GroceryHaulCreateResult } from '@/lib/plans/types';
import { groceryListTitle } from './presentation';

interface StartHaulDialogProps {
  open: boolean;
  lists: GeneratedGroceryList[];
  onClose: () => void;
  onCreated: (result: GroceryHaulCreateResult) => void;
}

export function StartHaulDialog({
  open,
  lists,
  onClose,
  onCreated,
}: StartHaulDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [shoppingDate, setShoppingDate] = useState(todayLocalDateKey);
  const [creationToken, setCreationToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedIds([]);
    setShoppingDate(todayLocalDateKey());
    setCreationToken(null);
    setError(null);
  }, [open]);

  function toggleList(listId: string) {
    setSelectedIds((current) =>
      current.includes(listId)
        ? current.filter((id) => id !== listId)
        : [...current, listId],
    );
    setCreationToken(null);
  }

  async function createHaul() {
    if (busy || selectedIds.length === 0 || !shoppingDate) return;
    setBusy(true);
    setError(null);
    const token = creationToken ?? crypto.randomUUID();
    if (!creationToken) setCreationToken(token);
    try {
      const result = await planService.startGroceryHaulFromLists({
        source_grocery_list_ids: selectedIds,
        shopping_date: shoppingDate,
        creation_token: token,
      });
      onCreated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create this Haul.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ItemManagementDialog
      open={open}
      onClose={onClose}
      labelledBy="start-haul-title"
      busy={busy}
      footer={(
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm text-white/55"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void createHaul()}
            disabled={busy || selectedIds.length === 0 || !shoppingDate}
            className="rounded-full bg-brand-50 px-5 py-2 text-sm font-semibold text-[#16110d] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Creating…' : 'Create Haul'}
          </button>
        </div>
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">
        Hauls
      </p>
      <h2 id="start-haul-title" className="mt-1 text-2xl font-semibold text-white">
        Create a new Haul
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-white/50">
        Choose one or more active Lists. Their current demand is preserved as the starting
        snapshot for this Haul.
      </p>

      <fieldset className="mt-6 space-y-2">
        <legend className="mb-2 text-xs font-semibold text-white/50">
          Source Lists
        </legend>
        {lists.length === 0 ? (
          <p className="rounded-xl border border-white/10 px-4 py-4 text-sm text-white/50">
            Create an active List with pending demand before starting a Haul.
          </p>
        ) : (
          lists.map((list) => (
            <label
              key={list.id}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-white/10 px-4 py-3 hover:bg-white/[0.04]"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(list.id)}
                onChange={() => toggleList(list.id)}
                className="h-4 w-4 accent-white"
              />
              <span className="text-sm font-semibold">{groceryListTitle(list)}</span>
            </label>
          ))
        )}
      </fieldset>

      <label className="mt-6 block">
        <span className="text-xs text-white/50">Shopping date</span>
        <input
          type="date"
          value={shoppingDate}
          onChange={(event) => {
            setShoppingDate(event.target.value);
            setCreationToken(null);
          }}
          className="mt-1.5 min-h-11 w-full rounded-full border border-white/20 bg-transparent px-4 text-base text-white outline-none focus:border-white/60 sm:text-xl"
        />
      </label>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      )}
    </ItemManagementDialog>
  );
}
