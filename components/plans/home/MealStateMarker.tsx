'use client';

import { cn } from '@/lib/utils';
import type { PlansMealWindowState } from '@/lib/plans/home/types';

export function MealStateMarker({
  state,
  size = 'sm',
  className,
}: {
  state: PlansMealWindowState;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const dim = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';

  if (state === 'eaten') {
    return (
      <span
        aria-hidden
        className={cn(
          'inline-flex items-center justify-center text-white',
          dim,
          className,
        )}
      >
        <svg viewBox="0 0 12 12" className="h-full w-full" fill="none">
          <path
            d="M2.5 6.2 4.8 8.4 9.5 3.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  if (state === 'empty') {
    return (
      <span
        aria-hidden
        className={cn('inline-block rounded-full border border-current opacity-70', dim, className)}
      />
    );
  }

  if (state === 'pending') {
    return (
      <span aria-hidden className={cn('inline-block rounded-full bg-current opacity-55', dim, className)} />
    );
  }

  if (state === 'skipped') {
    return (
      <span
        aria-hidden
        className={cn('inline-block rounded-full bg-current opacity-25', dim, className)}
        title="Skipped"
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn('inline-block rounded-sm bg-current opacity-20', dim, className)}
      title="Unknown"
    />
  );
}
