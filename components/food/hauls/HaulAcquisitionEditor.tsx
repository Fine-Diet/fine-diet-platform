'use client';

import { useEffect, useState } from 'react';

import { AppDialog } from '@/components/ui/AppDialog';
import { planService } from '@/lib/plans';
import type { GroceryHaulExecutionItem } from '@/lib/plans/types';
import {
  acquisitionFormFromItem,
  buildAcquisitionPatch,
  executionSourceDemandLabel,
  preparedInstructionLabel,
  type AcquisitionFormDraft,
} from './presentation';

export function HaulAcquisitionEditor({
  haulId,
  item,
  onClose,
  onSaved,
}: {
  haulId: string;
  item: GroceryHaulExecutionItem | null;
  onClose: () => void;
  onSaved: (item: GroceryHaulExecutionItem) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<AcquisitionFormDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) {
      setDraft(null);
      return;
    }
    setDraft(acquisitionFormFromItem(item));
    setError(null);
  }, [item]);

  if (!item || !draft) return null;
  const editorItem = item;
  const editorDraft = draft;

  function update<K extends keyof AcquisitionFormDraft>(key: K, value: AcquisitionFormDraft[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function save() {
    if (saving) return;
    const quantity = editorDraft.quantity.trim() === '' ? null : Number(editorDraft.quantity);
    const packageSize = editorDraft.packageSize.trim() === '' ? null : Number(editorDraft.packageSize);
    const packageCount = editorDraft.packageCount.trim() === '' ? null : Number(editorDraft.packageCount);
    const price = editorDraft.priceAmount.trim() === '' ? null : Number(editorDraft.priceAmount);
    if (quantity != null && (!Number.isFinite(quantity) || quantity < 0)) {
      setError('Acquired quantity must be empty or zero or greater.');
      return;
    }
    if (
      [packageSize, packageCount].some((value) => value != null && (!Number.isFinite(value) || value <= 0))
      || (price != null && (!Number.isFinite(price) || price < 0))
    ) {
      setError('Package values must be positive and price must be zero or greater.');
      return;
    }

    // Acquisition outcome only. Prepared snapshots and source demand stay read-only.
    const acquisition = buildAcquisitionPatch(editorDraft, editorItem);
    if (Object.keys(acquisition).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await planService.updateGroceryHaulExecutionItem(haulId, editorItem.id, {
        acquisition,
      });
      await onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the acquired outcome.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppDialog
      open={Boolean(item)}
      onClose={onClose}
      labelledBy="haul-acquisition-editor-title"
      panelClassName="border border-white/15 bg-[#211a14] p-6 text-white shadow-2xl"
    >
      <h2 id="haul-acquisition-editor-title" className="text-2xl font-light text-brand-50">
        Substitute {editorItem.source_name_snapshot}
      </h2>
      <p className="mt-2 text-sm text-white/50">
        Prepared instruction stays as context. Only the acquired outcome is saved.
      </p>
      <p className="mt-4 text-xs text-white/40">{executionSourceDemandLabel(editorItem)}</p>
      <p className="mt-1 text-sm text-white/65">{preparedInstructionLabel(editorItem)}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {[
          ['Product', 'productTitle'] as const,
          ['Brand', 'brandName'] as const,
          ['Purchase unit', 'purchaseUnit'] as const,
          ['Package unit', 'packageUnit'] as const,
          ['Retailer', 'retailer'] as const,
          ['Store location', 'storeLocation'] as const,
          ['ZIP code', 'postalCode'] as const,
          ['Currency', 'priceCurrency'] as const,
        ].map(([label, key]) => (
          <label key={key} className="text-xs font-semibold text-white/50">
            {label}
            <input
              value={editorDraft[key]}
              onChange={(event) => update(key, event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-white/15 bg-[#16110d] px-3 text-sm font-normal text-white outline-none focus:border-white/45"
            />
          </label>
        ))}
        {[
          ['Acquired quantity', 'quantity'] as const,
          ['Package size', 'packageSize'] as const,
          ['Package count', 'packageCount'] as const,
          ['Actual price', 'priceAmount'] as const,
        ].map(([label, key]) => (
          <label key={key} className="text-xs font-semibold text-white/50">
            {label}
            <input
              type="number"
              min="0"
              step="any"
              value={editorDraft[key]}
              onChange={(event) => update(key, event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-white/15 bg-[#16110d] px-3 text-sm font-normal text-white outline-none focus:border-white/45"
            />
          </label>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-full bg-brand-50 px-6 py-2.5 text-sm font-semibold text-[#16110d] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save acquired outcome'}
        </button>
      </div>
    </AppDialog>
  );
}
