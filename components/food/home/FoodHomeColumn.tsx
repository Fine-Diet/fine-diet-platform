import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Shared Food Home interior column — matches geometry contract. */
export const FOOD_HOME_COLUMN =
  'mx-auto w-full max-w-[650px] px-4 sm:px-5';

export function FoodHomeColumn({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(FOOD_HOME_COLUMN, className)}>{children}</div>;
}
