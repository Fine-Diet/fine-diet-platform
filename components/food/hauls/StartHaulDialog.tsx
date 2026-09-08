'use client';

import { useEffect, useState } from 'react';

import { AppDialog } from '@/components/ui/AppDialog';
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
    <AppDialog
      open={open}
      onClose={onClose}
      labelledBy="start-haul-title"
      panelClassName="border border-white/15 bg-[#211a14] p-6 text-white shadow-2xl"
    >
      <h2 id="start-haul-title" className="text-2xl font-light text-brand-50">
        Create a new Haul
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-white/55">
        Choose at least one active List. Fine Diet will preserve its current demand as
        a source snapshot and create an editable Draft.
      </p>

      <fieldset className="mt-6 space-y-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
          Source Lists
        </legend>
        {lists.length === 0 ? (
          <p className="rounded-xl border border-white/10 px-4 py-3 text-sm text-white/55">
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

      <label className="mt-5 block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
        Shopping date
        <input
          type="date"
          value={shoppingDate}
          onChange={(event) => {
            setShoppingDate(event.target.value);
            setCreationToken(null);
          }}
          className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-[#16110d] px-4 text-sm text-white outline-none focus:border-white/45"
        />
      </label>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="min-h-11 rounded-full border border-white/15 px-5 text-sm font-semibold hover:bg-white/[0.04]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void createHaul()}
          disabled={busy || selectedIds.length === 0 || !shoppingDate}
          className="min-h-11 rounded-full bg-brand-50 px-6 text-sm font-semibold text-[#16110d] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Creating…' : 'Create Haul'}
        </button>
      </div>
    </AppDialog>
  );
}
