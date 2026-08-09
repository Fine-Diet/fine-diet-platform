'use client';

import Link from 'next/link';

import { PlansHomeColumn } from '@/components/plans/home/PlansHomeColumn';
import type { PlansPantryReadinessViewModel } from '@/lib/plans/home/types';
import { cn } from '@/lib/utils';

export function PantryReadinessModule({
  model,
}: {
  model: PlansPantryReadinessViewModel;
}) {
  return (
    <section className="relative w-full px-12 sm:px-12 bg-neutral-800 pb-20 pt-20 sm:pb-32 sm:pt-20">
      <PlansHomeColumn>
        <h2 className="text-4xl font-semibold text-white antialiased sm:text-5xl">
          Pantry Readiness
        </h2>
        <p className="mt-3 text-base font-light leading-relaxed text-white/55 antialiased">
          Connect your meal plans to what’s stocked, what’s missing, and what to add next.
        </p>

        {model.status === 'loading' && (
          <p className="mt-8 text-sm text-white/50 antialiased">Loading Pantry readiness…</p>
        )}

        {model.status === 'error' && (
          <p className="mt-8 text-sm text-semantic-error antialiased" role="alert">
            {model.errorMessage ?? 'Could not load Pantry readiness.'}
          </p>
        )}

        {(model.status === 'empty' || model.status === 'no_list' || model.status === 'no_pricing') &&
          model.message && (
            <p className="mt-6 text-sm text-white/55 antialiased">{model.message}</p>
          )}

        {model.status !== 'loading' && model.status !== 'error' && model.columns.length > 0 && (
          <>
            <div className="mt-4 overflow-hidden rounded-[28px] border border-white/15 bg-none">
              <div className="grid grid-cols-1 divide-y divide-white/15 md:grid-cols-3 md:divide-x md:divide-y-0">
                {model.columns.map((column) => (
                  <Link
                    key={column.id}
                    href={column.href}
                    className="group flex items-start justify-between gap-3 px-5 py-5 transition-colors hover:bg-white/[0.04] sm:px-6 sm:py-6"
                  >
                    <div>
                      <p className="font-semibold text-regular text-white/50 antialiased">{column.title}</p>
                      <p className="text-5xl font-normal text-white antialiased">
                        {column.primary}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {column.lines.map((line) => (
                          <li key={line} className="text-sm text-white/50 antialiased">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <span
                      aria-hidden
                      className="mt-1 text-white/40 transition-colors group-hover:text-white/70"
                    >
                      ›
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            <Link
              href={model.managePantryHref}
              className={cn(
                'mt-5 flex w-full items-center justify-center rounded-full border border-white/25 px-5 py-3',
                'text-base font-semibold text-white antialiased transition-colors hover:bg-white/10',
              )}
            >
              Manage Pantry
            </Link>
          </>
        )}
      </PlansHomeColumn>
    </section>
  );
}
