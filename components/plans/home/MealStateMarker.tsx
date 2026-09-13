'use client';

import { cn } from '@/lib/utils';

export function MealStateMarker({
  planned,
  size = 'sm',
  className,
}: {
  /** Planning intent only: hollow when absent, filled when present. */
  planned: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const dim = size === 'sm' ? 'h-1.5 w-1.5' : 'h-3 w-3';

  if (!planned) {
    return (
      <span
        aria-hidden
        className={cn('inline-block rounded-full border border-current opacity-70', dim, className)}
      />
    );
  }

  return (
    <span aria-hidden className={cn('inline-block rounded-full bg-current opacity-70', dim, className)} />
  );
}
