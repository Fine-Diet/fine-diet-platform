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
          className="text-left text-[1.5rem] text-lg font-semibold text-white md:text-[1.5rem]"
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
          className="text-left text-[1.5rem] font-regular text-white md:text-[1.5rem]"
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
        className="text-left text-[1.5rem] font-semibold text-white md:text-[1.5rem]"
      >
        Featured Programs
      </h2>

      {/* Mobile rail */}
      <div className="mt-6 sm:-mx-6 sm:px-4 md:hidden -mx-10 px-0">
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {featured.items.map((item) => (
            <FeaturedCard
              key={item.id}
              item={item}
              onActivate={onActivate}
              className="w-[78%] shrink-0 snap-start max-w-[300px]"
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
    <article className={cn('flex flex-col bg-neutral-900 rounded-2xl', className)}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-t-2xl rounded-b-none bg-[#1c1712]">
        <Image
          src={item.imageUrl}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 768px) 78vw, 300px"
        />
      </div>
      <p className="mt-5 mx-6 text-sm font-regular text-white/50">{item.eyebrow}</p>
      <h3 className="mt-0 mx-6 text-xl font-regular text-white">{item.title}</h3>
      <button
        type="button"
        disabled={item.disabled}
        onClick={() => onActivate(item)}
        className={cn(
          'mt-2 mx-6 mb-6 inline-flex h-10 items-center justify-center rounded-full text-sm font-semibold transition',
          item.disabled ? CTA_DISABLED : CTA_ACTIVE,
        )}
      >
        {item.ctaLabel}
      </button>
    </article>
  );
}
