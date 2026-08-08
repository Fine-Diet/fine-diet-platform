import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export const PLANS_HOME_COLUMN = 'mx-auto w-full max-w-[950px] px-4 sm:px-5';

export function PlansHomeColumn({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(PLANS_HOME_COLUMN, className)}>{children}</div>;
}
