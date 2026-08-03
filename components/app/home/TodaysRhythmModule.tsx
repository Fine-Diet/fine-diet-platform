'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

import type { AppHomeRhythmViewModel } from '@/lib/app/home/types';
import { cn } from '@/lib/utils';

function CheckIcon() {
  return (
    <svg aria-hidden className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

export function TodaysRhythmModule({ rhythm }: { rhythm: AppHomeRhythmViewModel }) {
  const actionableRef = useRef<HTMLAnchorElement | HTMLDivElement | null>(null);

  useEffect(() => {
    if (rhythm.actionableSlotKey && actionableRef.current) {
      actionableRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [rhythm.actionableSlotKey, rhythm.slots.length]);

  return (
    <section aria-labelledby="todays-rhythm-heading" className="w-full">
      <h2
        id="todays-rhythm-heading"
        className="text-center text-lg font-semibold text-[#e7dfd2] md:text-xl"
      >
        Today&apos;s Rhythm
      </h2>

      {rhythm.status === 'loading' ? (
        <div className="mt-5 h-36 animate-pulse rounded-[24px] border border-white/20 bg-white/[0.04]" />
      ) : null}

      {rhythm.status === 'no_schedule' || rhythm.status === 'error' ? (
        <div className="mt-5 rounded-[24px] border border-white/20 bg-white/[0.04] px-5 py-8 text-center">
          <p className="text-sm font-semibold text-white">
            {rhythm.status === 'error'
              ? 'Today’s rhythm is unavailable right now.'
              : 'Set meal times to personalize today’s rhythm.'}
          </p>
          <Link
            href={rhythm.setupHref}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-white/35 px-5 text-sm font-semibold text-white hover:bg-white/10"
          >
            Set Meal Times
          </Link>
        </div>
      ) : null}

      {rhythm.status === 'ready' ? (
        <>
          {/* Mobile scroll rail */}
          <div className="mt-5 md:hidden">
            <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {rhythm.slots.map((slot) => (
                <RhythmCard
                  key={slot.slotKey}
                  slot={slot}
                  className="w-[46%] shrink-0 snap-center"
                  refCallback={
                    slot.actionable
                      ? (node) => {
                          actionableRef.current = node;
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          </div>

          {/* Desktop bordered container */}
          <div className="mt-5 hidden overflow-hidden rounded-[24px] border border-white/25 md:block">
            <div
              className="grid"
              style={{ gridTemplateColumns: `repeat(${Math.max(rhythm.slots.length, 1)}, minmax(0, 1fr))` }}
            >
              {rhythm.slots.map((slot, index) => (
                <RhythmCard
                  key={slot.slotKey}
                  slot={slot}
                  className={cn(
                    index < rhythm.slots.length - 1 && 'border-r border-white/20',
                  )}
                />
              ))}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function RhythmCard({
  slot,
  className,
  refCallback,
}: {
  slot: AppHomeRhythmViewModel['slots'][number];
  className?: string;
  refCallback?: (node: HTMLAnchorElement | null) => void;
}) {
  const content = (
    <>
      <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-white/70">
        <span className="truncate">{slot.label}</span>
        {slot.state === 'logged' ? <CheckIcon /> : null}
      </div>
      <p className="mt-3 text-center text-xl font-semibold text-white sm:text-2xl">
        {slot.targetTimeLabel}
      </p>
      <span className="mt-4 inline-flex h-8 items-center justify-center rounded-full border border-white/35 px-4 text-xs font-semibold lowercase text-white">
        {slot.state === 'logged' ? 'edit' : 'log'}
      </span>
    </>
  );

  const shell = cn(
    'flex flex-col items-center justify-center px-3 py-6 transition',
    slot.actionable
      ? 'rounded-[20px] border border-white bg-white/[0.04] md:rounded-none md:border-0 md:bg-transparent md:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.95)]'
      : 'rounded-[20px] border border-white/15 bg-white/[0.03] md:rounded-none md:border-0 md:bg-transparent',
    slot.state === 'past_unlogged' && !slot.actionable && 'opacity-80',
    slot.state === 'future_unlogged' && !slot.actionable && 'opacity-70',
    className,
  );

  return (
    <Link ref={refCallback} href={slot.href} className={shell}>
      {content}
    </Link>
  );
}
