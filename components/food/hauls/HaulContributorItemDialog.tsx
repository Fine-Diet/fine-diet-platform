'use client';

import { useEffect, useState } from 'react';

import { CreateResourceDialogFooter } from '@/components/food/itemManagement/CreateResourceDialogFooter';
import { ItemManagementDialog } from '@/components/food/itemManagement/ItemManagementDialog';
import { planService } from '@/lib/plans';
import type { GroceryHaulItem } from '@/lib/plans/types';

interface HaulContributorItemDialogProps {
  open: boolean;
  haulId: string;
  item: GroceryHaulItem | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

export function HaulContributorItemDialog({
  open,
  haulId,
  item,
  onClose,
  onSaved,
}: HaulContributorItemDialogProps) {
  const isEdit = item != null;
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(item?.name_snapshot ?? '');
    setQuantity(item ? String(item.final_quantity) : '1');
    setUnit(item?.unit_snapshot ?? '');
    setError(null);
  }, [open, item]);

  async function save() {
    if (busy || !name.trim()) return;
    const parsedQuantity = quantity.trim() === '' ? null : Number(quantity);
    if (parsedQuantity != null && (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0)) {
      setError('Enter a positive quantity or leave it blank.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isEdit && item) {
        await planService.updateHaulContributorItem(haulId, item.id, {
          name: name.trim(),
          quantity: parsedQuantity ?? undefined,
          unit: unit.trim() || null,
        });
      } else {
        await planService.addHaulContributorItem(haulId, {
          name: name.trim(),
          quantity: parsedQuantity,
          unit: unit.trim() || null,
        });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save this item.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ItemManagementDialog
      open={open}
      onClose={onClose}
      labelledBy="haul-contributor-item-title"
      busy={busy}
      shell="create-resource"
      footer={(
        <CreateResourceDialogFooter
          primaryLabel={busy ? 'Saving…' : isEdit ? 'Save' : 'Add item'}
          onPrimary={() => void save()}
          primaryDisabled={!name.trim()}
          primaryBusy={busy}
          onSecondary={onClose}
          secondaryDisabled={busy}
        />
      )}
    >
      <h2 id="haul-contributor-item-title" className="text-2xl font-semibold text-white">
        {isEdit ? 'Edit Haul item' : 'Add Haul item'}
      </h2>

      <label className="mt-4 block">
        <span className="text-xs text-white/50">Name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-1.5 min-h-11 w-full rounded-full border border-white/20 bg-transparent px-4 text-base text-white outline-none focus:border-white/60 sm:text-sm"
        />
      </label>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <label className="block flex-1">
          <span className="text-xs text-white/50">Quantity</span>
          <input
            type="number"
            min="0"
            step="any"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="mt-1.5 min-h-11 w-full rounded-full border border-white/20 bg-transparent px-4 text-base text-white outline-none focus:border-white/60 sm:text-sm"
          />
        </label>
        <label className="block flex-1">
          <span className="text-xs text-white/50">Unit</span>
          <input
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            placeholder="Optional"
            className="mt-1.5 min-h-11 w-full rounded-full border border-white/20 bg-transparent px-4 text-base text-white outline-none focus:border-white/60 sm:text-sm"
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      )}
    </ItemManagementDialog>
  );
}
