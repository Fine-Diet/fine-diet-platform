'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import { CreateResourceDialogFooter } from '@/components/food/itemManagement/CreateResourceDialogFooter';
import { ItemManagementDialog } from '@/components/food/itemManagement/ItemManagementDialog';
import { HaulSourceListPicker } from '@/components/food/hauls/HaulSourceListPicker';
import { planService } from '@/lib/plans';
import { buildEligibleHaulSourceCandidates } from '@/lib/plans/groceryHaul/sourceListSelection';
import { todayLocalDateKey } from '@/lib/plans/planDateRange';
import type {
  GeneratedGroceryList,
  GroceryHaulCreateResult,
} from '@/lib/plans/types';
import type { GroceryListReadinessDecision } from '@/lib/plans/groceryListReadiness/policy';

interface StartHaulDialogProps {
  open: boolean;
  lists: GeneratedGroceryList[];
  persistentListSummaries: Record<string, GroceryListReadinessDecision>;
  defaultListId: string | null;
  onClose: () => void;
  onCreated: (result: GroceryHaulCreateResult) => void;
}

export function StartHaulDialog({
  open,
  lists,
  persistentListSummaries,
  defaultListId,
  onClose,
  onCreated,
}: StartHaulDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [listSearch, setListSearch] = useState('');
  const [shoppingDate, setShoppingDate] = useState(todayLocalDateKey);
  const [creationToken, setCreationToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedIds([]);
    setListSearch('');
    setShoppingDate(todayLocalDateKey());
    setCreationToken(null);
    setError(null);
  }, [open]);

  const hasEligibleLists = useMemo(
    () =>
      buildEligibleHaulSourceCandidates(lists, persistentListSummaries).length > 0,
    [lists, persistentListSummaries],
  );

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
      shell="create-resource"
      footer={(
        <CreateResourceDialogFooter
          primaryLabel={busy ? 'Creating…' : 'Create Haul'}
          onPrimary={() => void createHaul()}
          primaryDisabled={selectedIds.length === 0 || !shoppingDate}
          primaryBusy={busy}
          onSecondary={onClose}
          secondaryDisabled={busy}
        />
      )}
    >
      <h2 id="start-haul-title" className="text-2xl font-semibold text-white">
        Create a new Haul
      </h2>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-3">
        <label className="block w-full shrink-0 lg:w-auto lg:min-w-[9rem]">
          <span className="text-xs text-white/50">Shopping date</span>
          <input
            type="date"
            value={shoppingDate}
            onChange={(event) => {
              setShoppingDate(event.target.value);
              setCreationToken(null);
            }}
            className="mt-1.5 min-h-11 w-full rounded-full border border-white/20 bg-transparent px-2 text-base text-white outline-none focus:border-white/60 lg:px-2 lg:text-sm"
          />
        </label>
        <label className="block min-w-0 flex-1">
          <span className="sr-only">Search Lists</span>
          <div className="relative lg:mt-[1.375rem]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <input
              type="search"
              value={listSearch}
              onChange={(event) => setListSearch(event.target.value)}
              placeholder="Search Lists"
              className="min-h-11 w-full rounded-full border border-white/20 bg-transparent pl-10 pr-4 text-base text-white outline-none focus:border-white/60 sm:text-xl"
            />
          </div>
        </label>
      </div>

      <div className="mt-4">
        {!hasEligibleLists ? (
          <p className="rounded-xl border border-white/10 px-4 py-4 text-sm text-white/50">
            Create an active List with pending demand before starting a Haul.
          </p>
        ) : (
          <HaulSourceListPicker
            lists={lists}
            summaries={persistentListSummaries}
            defaultListId={defaultListId}
            selectedIds={selectedIds}
            onToggle={toggleList}
            searchQuery={listSearch}
            emptyMessage="No Lists match that search."
          />
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      )}
    </ItemManagementDialog>
  );
}
