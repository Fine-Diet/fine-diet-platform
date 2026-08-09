'use client';

import Link from 'next/link';
import { useEffect, useRef, useCallback, useState } from 'react';

import type { AppHomeRhythmSlotState, AppHomeRhythmViewModel } from '@/lib/app/home/types';
import { cn } from '@/lib/utils';

function CheckIcon() {
  return (
    <svg aria-hidden className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function FilledCircleIcon() {
  return (
    <svg aria-hidden className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

function OpenCircleIcon() {
  return (
    <svg aria-hidden className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

function SlotStatusIcon({ state }: { state: AppHomeRhythmSlotState }) {
  if (state === 'logged') return <CheckIcon />;
  if (state === 'actionable') return <FilledCircleIcon />;
  return <OpenCircleIcon />;
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
        className="text-left text-[1.5rem] font-normal text-white md:text-[1.5rem]"
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
              ? "Today's rhythm is unavailable right now."
              : "Set meal times to personalize today's rhythm."}
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
          <div className="mt-5 md:hidden -mx-12 sm:-mx-12 px-0">
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

          {/* Desktop bordered container — flex scroll, grab-drag to reveal overflow */}
          <div className="mt-5 hidden overflow-hidden rounded-[24px] border border-white/25 md:block">
            <DesktopRhythmTrack slots={rhythm.slots} actionableRef={actionableRef} />
          </div>
        </>
      ) : null}
    </section>
  );
}

/**
 * Desktop scroll track — two modes:
 *
 * Fit mode: all cells share the full container width equally (flex-1),
 * no scroll needed, divided by lines matching the border.
 *
 * Overflow mode: cells are natural content-width (shrink-0), separated
 * by a gap like the mobile rail, grab-draggable to scroll.
 *
 * A ResizeObserver measures the container width and the natural content
 * width to pick the right mode automatically.
 */
function DesktopRhythmTrack({
  slots,
  actionableRef,
}: {
  slots: AppHomeRhythmViewModel['slots'];
  actionableRef: React.MutableRefObject<HTMLAnchorElement | HTMLDivElement | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  // Measure natural content width vs available container width
  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const check = () => {
      setOverflows(measure.scrollWidth > container.clientWidth);
    };

    check();
    const ro = new ResizeObserver(check);
    ro.observe(container);
    ro.observe(measure);
    return () => ro.disconnect();
  }, [slots]);

  // Pointer-drag-to-scroll (only active in overflow mode)
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (!el || !overflows) return;
    isDragging.current = true;
    startX.current = e.clientX;
    scrollLeft.current = el.scrollLeft;
    el.setPointerCapture(e.pointerId);
  }, [overflows]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || !trackRef.current) return;
    const dx = e.clientX - startX.current;
    trackRef.current.scrollLeft = scrollLeft.current - dx;
  }, []);

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  return (
    <div ref={containerRef} className="relative overflow-hidden">
      {/* Off-screen measure track — shrink-0 cells, no flex-1, tells us natural width */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute inset-0 flex gap-3"
      >
        {slots.map((slot) => (
          <div key={slot.slotKey} className="min-w-[9rem] shrink-0 px-3 py-6">
            <div className="flex items-center gap-2 text-2xl font-semibold whitespace-nowrap">
              {slot.label}
            </div>
          </div>
        ))}
      </div>

      {/* Visible track — switches mode based on overflow detection */}
      <div
        ref={trackRef}
        className={overflows
          ? 'flex gap-3 overflow-x-auto select-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden cursor-grab active:cursor-grabbing'
          : 'flex divide-x divide-white/25'
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {slots.map((slot) => (
          <RhythmCard
            key={slot.slotKey}
            slot={slot}
            className={overflows ? 'min-w-[9rem] shrink-0' : 'min-w-[9rem] flex-1'}
            refCallback={
              slot.actionable
                ? (node) => { actionableRef.current = node; }
                : undefined
            }
          />
        ))}
      </div>
    </div>
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
  const [timeDigits, period] = slot.targetTimeLabel.split(' ');

  const content = (
    <>
      {/* Meal name + status icon — never wraps */}
      <div className="flex items-center justify-center gap-2 text-2xl font-semibold text-white mx-8">
        <span className="whitespace-nowrap">{slot.label}</span>
        <SlotStatusIcon state={slot.state} />
      </div>

      {/* Time with AM/PM to the left */}
      <div className="mt-2 flex items-stretch justify-center gap-1">
        <span
          className={cn(
            'flex flex-col text-xs text-white/70',
            period === 'AM' ? 'justify-start pt-1' : 'justify-end pb-1',
          )}
        >
          {period}
        </span>
        <span className="text-5xl font-normal leading-none text-white">{timeDigits}</span>
      </div>

      {/* Log / edit extra-small button */}
      <span className="mt-2 flex h-[1.2rem] w-full max-w-[8rem] items-center justify-center rounded-full border border-white/35 px-2 text-xs font-normal lowercase text-white">
        {slot.state === 'logged' ? 'edit' : 'log'}
      </span>
    </>
  );

  const shell = cn(
    'flex flex-col items-center justify-center px-3 py-8 transition',
    slot.actionable
      ? 'rounded-[20px] border border-white bg-white/[0.04] md:rounded-none md:border-0 md:bg-transparent md:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.95)] md:first:rounded-l-[22px] md:last:rounded-r-[22px]'
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
