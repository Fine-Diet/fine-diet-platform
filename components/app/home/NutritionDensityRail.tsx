'use client';

import type { AppHomeNdsViewModel } from '@/lib/app/home/types';
import { cn } from '@/lib/utils';

export function NutritionDensityRail({ nds }: { nds: AppHomeNdsViewModel }) {
  return (
    <section
      aria-label="Nutrition Density So Far Today"
      className="w-full border-y border-white/20 bg-[#1c1712]"
    >
      <div className="mx-auto w-full max-w-[1000px]">
        <div className="flex overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-stretch">
            <div className="flex w-[11.5rem] shrink-0 items-center border-r border-white/20 px-4 py-4 sm:w-[13rem] sm:px-5">
              <p className="text-sm font-semibold leading-snug text-white">
                Nutrition Density So Far Today
              </p>
            </div>
            {nds.metrics.map((metric, index) => (
              <div
                key={metric.id}
                className={cn(
                  'flex w-[10.5rem] shrink-0 flex-col justify-center px-4 py-4 sm:w-[12rem] sm:px-5',
                  index < nds.metrics.length - 1 && 'border-r border-white/20',
                )}
              >
                <p className="text-xs text-white/65">{metric.label}:</p>
                <p
                  className={cn(
                    'mt-1 text-base font-semibold text-white',
                    nds.status === 'loading' && 'animate-pulse text-white/50',
                  )}
                >
                  {metric.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
