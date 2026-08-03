'use client';

/**
 * Non-persistent programme preview sheet for seeded Featured / Category items.
 * No enrollment, no fake activation success, no persistence.
 */

import Image from 'next/image';
import { useEffect } from 'react';

import type { ProgramsHomePreviewItem } from '@/lib/programs/home/types';
import { cn } from '@/lib/utils';

export function ProgrammePreviewSheet({
  item,
  onClose,
  onAction,
}: {
  item: ProgramsHomePreviewItem | null;
  onClose: () => void;
  /** Optional live navigation when the action is enabled. */
  onAction?: () => void;
}) {
  useEffect(() => {
    if (!item) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;

  const availabilityLabel =
    item.availability === 'coming_soon'
      ? 'Coming soon'
      : item.availability === 'available'
        ? 'Preview available'
        : item.availability.replace(/_/g, ' ');

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close preview"
        className="absolute inset-0 bg-black/65"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="programme-preview-title"
        className={cn(
          'relative z-[91] flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden',
          'rounded-t-[28px] border border-white/30 bg-brand-900 shadow-large sm:rounded-[28px]',
        )}
      >
        <div className="relative aspect-[16/10] w-full bg-[#1c1712]">
          <Image
            src={item.imageUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 512px"
          />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/45 text-white hover:bg-black/60"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">
          <p className="text-xs font-medium uppercase tracking-wide text-white/55">
            {item.categoryLabel}
          </p>
          <h2
            id="programme-preview-title"
            className="mt-1 text-xl font-semibold text-white"
          >
            {item.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/70">{item.description}</p>
          <p className="mt-4 text-xs font-semibold text-white/80">
            Availability: <span className="font-medium capitalize text-white/65">{availabilityLabel}</span>
          </p>
          <p className="mt-2 text-xs leading-relaxed text-white/50">
            {item.actionDisabled
              ? 'This programme is not available to start from here yet.'
              : 'Continue to the programme page for the live start or continue path.'}
          </p>
          <button
            type="button"
            disabled={item.actionDisabled}
            onClick={() => {
              if (item.actionDisabled) return;
              onAction?.();
            }}
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full border border-white/25 bg-transparent text-sm font-semibold text-white/70 disabled:cursor-not-allowed enabled:hover:bg-white/10 enabled:text-white"
          >
            {item.actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
