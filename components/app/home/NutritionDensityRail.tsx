'use client';

import type { AppHomeNdsViewModel } from '@/lib/app/home/types';

export function NutritionDensityRail({ nds }: { nds: AppHomeNdsViewModel }) {
  return (
    <section
      aria-label="Nutrition Density So Far Today"
      className="w-full border-y border-white/20 bg-[#3f362b]"
    >
      <div className="flex w-full items-stretch">
        <div className="flex-1 min-w-0" />
        <div className="flex w-full max-w-[1000px] shrink-0 items-stretch">
          {/* Fixed title column — metrics scroll behind it */}
          <div className="flex shrink-0 items-center border-r border-white/20 pr-8 px-4 py-4 sm:pr-8 sm:px-5">
            <p className="whitespace-nowrap text-base font-semibold leading-snug text-white">
              Nutrition Density Today
            </p>
          </div>

          {/* Scrollable metrics — hidden under the title when scrolled left */}
          <div className="min-w-0 flex-1 overflow-x-auto bg-[#4a4032] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max items-stretch">
              {nds.metrics.map((metric) => (
                <div
                  key={metric.id}
                  className="flex w-[12.5rem] shrink-0 flex-col items-center justify-center border-r border-white/20 bg-[#4a4032] px-4 py-5 text-center sm:w-[14rem] sm:px-5"
                >
                  <p className="whitespace-nowrap text-base text-white">{metric.label}: {metric.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 bg-[#4a4032]" aria-hidden="true" />
      </div>
    </section>
  );
}
