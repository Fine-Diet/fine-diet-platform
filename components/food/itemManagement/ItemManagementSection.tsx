'use client';

import type { ReactNode } from 'react';

export function ItemManagementSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}
