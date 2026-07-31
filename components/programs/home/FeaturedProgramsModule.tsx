'use client';

import Image from 'next/image';

import type {
  ProgramsHomeFeaturedItem,
  ProgramsHomeFeaturedViewModel,
} from '@/lib/programs/home/types';
import { cn } from '@/lib/utils';

const CTA_ACTIVE =
  'bg-[#BCCCDC] text-[#1A1612] hover:bg-[#c5d0da]';
const CTA_DISABLED =
  'border border-white/25 bg-transparent text-white/70 cursor-not-allowed';

export function FeaturedProgramsModule({
  featured,
  onActivate,
}: {
  featured: ProgramsHomeFeaturedViewModel;
  onActivate: (item: ProgramsHomeFeaturedItem) => void;
}) {
  if (featured.status === 'empty') {
    return (
      <section aria-labelledby="featured-programs-heading">
        <h2
          id="featured-programs-heading"
          className="text-center text-lg font-semibold text-white md:text-xl"
        >
          Featured Programs
        </h2>
        <p className="mt-6 text-center text-sm text-white/60">
          Featured programs will appear here when the catalogue is connected.
        </p>
      </section>
    );
  }

  if (featured.status === 'error') {
    return (
      <section aria-labelledby="featured-programs-heading">
        <h2
          id="featured-programs-heading"
          className="text-center text-lg font-semibold text-white md:text-xl"
        >
          Featured Programs
        </h2>
        <p className="mt-6 text-center text-sm text-red-300">
          {featured.errorMessage ?? 'Featured programs could not load.'}
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="featured-programs-heading">
      <h2
        id="featured-programs-heading"
        className="text-center text-lg font-semibold text-white md:text-xl"
      >
        Featured Programs
      </h2>

      {/* Mobile rail */}
      <div className="mt-6 -mx-4 px-4 md:hidden">
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {featured.items.map((item) => (
            <FeaturedCard
              key={item.id}
              item={item}
              onActivate={onActivate}
              className="w-[78%] shrink-0 snap-start"
            />
          ))}
        </div>
      </div>

      {/* Desktop row */}
      <div className="mt-8 hidden gap-5 md:grid md:grid-cols-3">
        {featured.items.map((item) => (
          <FeaturedCard key={item.id} item={item} onActivate={onActivate} />
        ))}
      </div>
    </section>
  );
}

function FeaturedCard({
  item,
  onActivate,
  className,
}: {
  item: ProgramsHomeFeaturedItem;
  onActivate: (item: ProgramsHomeFeaturedItem) => void;
  className?: string;
}) {
  return (
    <article className={cn('flex flex-col', className)}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#1c1712]">
        <Image
          src={item.imageUrl}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 768px) 78vw, 300px"
        />
      </div>
      <p className="mt-3 text-xs font-medium text-white/65">{item.eyebrow}</p>
      <h3 className="mt-1 text-base font-semibold text-white">{item.title}</h3>
      <button
        type="button"
        disabled={item.disabled}
        onClick={() => onActivate(item)}
        className={cn(
          'mt-3 inline-flex h-10 w-full items-center justify-center rounded-full text-sm font-semibold transition',
          item.disabled ? CTA_DISABLED : CTA_ACTIVE,
        )}
      >
        {item.ctaLabel}
      </button>
    </article>
  );
}
