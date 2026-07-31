'use client';

/**
 * Reusable Programs Home hero carousel shell.
 * Controls/pagination only when multiple slides exist. No required autoplay.
 */

import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import type { ProgramsHomeHeroSlide, ProgramsHomeHeroViewModel } from '@/lib/programs/home/types';
import { cn } from '@/lib/utils';

const CTA_ACTIVE =
  'bg-[#BCCCDC] text-[#1A1612] hover:bg-[#c5d0da] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';
const CTA_DISABLED =
  'bg-[#6E757C] text-[#1A1612] cursor-not-allowed opacity-95';

function ClockIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg aria-hidden className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />
    </svg>
  );
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ProgramsHomeHero({
  hero,
  onOpenStartFlow,
  startFlowSlot,
}: {
  hero: ProgramsHomeHeroViewModel;
  onOpenStartFlow?: () => void;
  startFlowSlot?: ReactNode;
}) {
  const slides = hero.slides;
  const multi = slides.length > 1;
  const labelId = useId();
  const [index, setIndex] = useState(0);
  const pointerStartX = useRef<number | null>(null);
  const regionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIndex(0);
  }, [slides.map((s) => s.id).join('|')]);

  const goTo = useCallback(
    (next: number) => {
      if (!multi) return;
      const len = slides.length;
      setIndex(((next % len) + len) % len);
    },
    [multi, slides.length],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!multi) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(index - 1);
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!multi || event.pointerType === 'mouse') return;
    pointerStartX.current = event.clientX;
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!multi || pointerStartX.current == null) return;
    const delta = event.clientX - pointerStartX.current;
    pointerStartX.current = null;
    if (Math.abs(delta) < 40) return;
    goTo(delta < 0 ? index + 1 : index - 1);
  };

  const activeSlide: ProgramsHomeHeroSlide | undefined = slides[index] ?? slides[0];
  if (!activeSlide) return null;
  const slide = activeSlide;

  const reduceMotion = prefersReducedMotion();
  const loading = hero.status === 'loading';

  function handleCta() {
    if (slide.cta.disabled) return;
    if (slide.cta.action === 'open_start_flow') {
      onOpenStartFlow?.();
      return;
    }
    if (slide.cta.href && slide.cta.action !== 'none') {
      window.location.assign(slide.cta.href);
    }
  }

  return (
    <div
      ref={regionRef}
      role="region"
      aria-roledescription="carousel"
      aria-labelledby={labelId}
      tabIndex={multi ? 0 : undefined}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      className={cn(
        'relative z-0 w-full overflow-hidden bg-[#0d120f]',
        'min-h-[580px] md:min-h-[420px]',
        multi && 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white/70',
      )}
    >
      <span id={labelId} className="sr-only">
        Programs hero
      </span>

      <div className="absolute inset-0" aria-hidden>
        <Image
          src={slide.imageUrl}
          alt=""
          fill
          priority
          className={cn(
            'object-cover',
            !reduceMotion && 'transition-opacity duration-300',
          )}
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-[#0a1610]/70 to-[#0d120f]/92" />
        <div className="absolute inset-0 bg-[#06140e]/35" />
      </div>

      <div className="relative mx-auto flex h-full min-h-[580px] w-full max-w-[1000px] flex-col justify-end px-4 pb-16 pt-24 md:min-h-[420px] md:px-5 md:pb-20 md:pt-16">
        <div className="max-w-[760px]">
          <p className="text-sm font-semibold tracking-wide text-white md:text-base">
            {slide.eyebrow}
          </p>
          {slide.metaLabel ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-white/85 md:text-sm">
              <ClockIcon />
              <span>{slide.metaLabel}</span>
            </p>
          ) : null}
          <h1 className="mt-4 max-w-[22ch] text-[2rem] font-semibold leading-[1.15] tracking-tight text-white md:text-[2.75rem]">
            {slide.title}
          </h1>
          <p className="mt-4 max-w-[52ch] text-sm leading-relaxed text-white/80 md:text-base">
            {slide.description}
          </p>

          {loading ? (
            <div
              className="mt-8 h-12 w-full max-w-md animate-pulse rounded-full bg-white/15"
              aria-busy
              aria-label="Loading"
            />
          ) : slide.cta.href &&
            slide.cta.action === 'navigate' &&
            !slide.cta.disabled ? (
            <a
              href={slide.cta.href}
              className={cn(
                'mt-8 inline-flex h-12 w-full max-w-md items-center justify-center rounded-full px-6 text-sm font-semibold transition',
                CTA_ACTIVE,
              )}
            >
              {slide.cta.label}
            </a>
          ) : (
            <button
              type="button"
              disabled={slide.cta.disabled || slide.cta.action === 'none'}
              onClick={handleCta}
              className={cn(
                'mt-8 inline-flex h-12 w-full max-w-md items-center justify-center rounded-full px-6 text-sm font-semibold transition',
                slide.cta.disabled || slide.cta.action === 'none'
                  ? CTA_DISABLED
                  : CTA_ACTIVE,
              )}
            >
              {slide.cta.label}
            </button>
          )}

          {hero.startFlowOpen && startFlowSlot ? (
            <div className="mt-4 max-w-md">{startFlowSlot}</div>
          ) : null}
        </div>

        {multi ? (
          <div className="mt-8 flex items-center gap-3">
            <button
              type="button"
              aria-label="Previous slide"
              onClick={() => goTo(index - 1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/30 text-white hover:bg-black/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <span aria-hidden>‹</span>
            </button>
            <div className="flex items-center gap-2" role="tablist" aria-label="Hero slides">
              {slides.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Slide ${i + 1} of ${slides.length}`}
                  onClick={() => goTo(i)}
                  className={cn(
                    'h-2.5 rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                    i === index ? 'w-6 bg-white' : 'w-2.5 bg-white/40 hover:bg-white/70',
                  )}
                />
              ))}
            </div>
            <button
              type="button"
              aria-label="Next slide"
              onClick={() => goTo(index + 1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/30 text-white hover:bg-black/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <span aria-hidden>›</span>
            </button>
            <p className="sr-only" aria-live="polite">
              Slide {index + 1} of {slides.length}: {slide.title}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
