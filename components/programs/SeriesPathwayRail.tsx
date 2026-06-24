/**
 * SeriesPathwayRail — dark, horizontally-scrolling rail for the public
 * /programs offer index. Mirrors the motion behavior of StartView's
 * SystemCardsScroller and CaseStudyScrollCardsV1 (auto-scroll, dot navigation,
 * pause-on-interact with read-timer resume).
 *
 * The rail is a presentational wrapper: the card content is passed in as
 * `children` (one element per item) so the actual links stay owned by the page.
 * The component only manages scroll position, dot navigation, and the timers.
 *
 * Reduced-motion safe: auto-scroll is disabled when the user prefers reduced
 * motion (cards remain fully scrollable + dot-navigable).
 *
 * Layout: copy uses the shared max-w-3xl column. Pathway cards center across
 * the available width when they fit; when they exceed it, the card row goes
 * full-bleed and left-aligns to the content-column edge as a scroll rail.
 */

import {
  Children,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { stackedLayerClasses } from '@/components/layout/StackedPageSection';
import { cn } from '@/lib/utils';
import { PrimaryPillCta } from './PrimaryPillCta';
import type { ProgramMarketingCtaResolution } from '@/lib/programs/programSeriesTypes';

const AUTO_INTERVAL = 6000;
const RESUME_DELAY = 8000;

/** Page copy column — max-w-3xl (48rem) + px-6. */
const CONTENT_SHELL = 'mx-auto w-full max-w-3xl px-6';

/** Left edge of the content column when the card row is full-bleed. */
const OVERFLOW_RAIL_LEFT =
  'pl-[max(1.5rem,calc((100vw-min(100vw,48rem))/2+1.5rem))]';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

export interface SeriesPathwayRailProps {
  heading: string;
  intro?: string;
  children: ReactNode;
  /** 1-based stacked-page layer (overlap + rounded top over the hero). */
  stackLayer?: number;
  /** Featured-product CTA rendered full-width beneath the card track. */
  cta?: ProgramMarketingCtaResolution;
  /** Short description shown directly above the CTA. */
  ctaNote?: string;
}

export default function SeriesPathwayRail({
  heading,
  intro,
  children,
  stackLayer,
  cta,
  ctaNote,
}: SeriesPathwayRailProps) {
  const total = Children.count(children);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const reduced = usePrefersReducedMotion();

  const scrollRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollTo = useCallback((index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const card = container.children[index] as HTMLElement | undefined;
    if (!card) return;
    container.scrollTo({
      left: card.offsetLeft - container.offsetLeft,
      behavior: 'smooth',
    });
    setActiveIndex(index);
  }, []);

  const handleInteract = useCallback(() => {
    setPaused(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), RESUME_DELAY);
  }, []);

  useEffect(() => {
    const track = scrollRef.current;
    const measure = measureRef.current;
    if (!track || !measure) return;

    // Measure against the full-width wrapper (measureRef), NOT the track: the
    // track's own width depends on hasOverflow, which would create a
    // measure → resize → re-measure feedback loop (the centering glitch).
    // The cards center across the available width when they fit and only
    // switch to the left-aligned scroll rail when they exceed it.
    const GAP = 16; // gap-4
    const COLUMN_PADDING = 48; // px-6 left + right gutter
    const checkOverflow = () => {
      const children = Array.from(track.children) as HTMLElement[];
      if (children.length === 0) {
        setHasOverflow(false);
        return;
      }
      const cardsWidth =
        children.reduce((sum, child) => sum + child.offsetWidth, 0) +
        GAP * (children.length - 1);
      const available = measure.clientWidth - COLUMN_PADDING;
      setHasOverflow(cardsWidth > available + 1);
    };

    checkOverflow();
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(measure);
    Array.from(track.children).forEach((child) => observer.observe(child));

    return () => observer.disconnect();
  }, [total]);

  useEffect(() => {
    if (reduced || paused || total <= 1 || !hasOverflow) return;
    autoTimer.current = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % total;
        const container = scrollRef.current;
        const card = container?.children[next] as HTMLElement | undefined;
        if (container && card) {
          container.scrollTo({
            left: card.offsetLeft - container.offsetLeft,
            behavior: 'smooth',
          });
        }
        return next;
      });
    }, AUTO_INTERVAL);
    return () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
    };
  }, [reduced, paused, total, hasOverflow]);

  useEffect(
    () => () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    },
    [],
  );

  return (
    <section
      className={cn(
        stackLayer != null
          ? stackedLayerClasses(
              stackLayer,
              'bg-neutral-950 px-0 pb-16 pt-16 text-white sm:pb-20 sm:pt-20',
            )
          : 'bg-neutral-950 px-0 pb-16 pt-16 text-white sm:pb-20 sm:pt-20',
      )}
    >
      <div className={CONTENT_SHELL}>
        <h2 className="text-3xl font-semibold leading-none tracking-none text-white antialiased sm:text-4xl">
          {heading}
        </h2>
        {intro && (
          <p className="mt-4 text-base leading-normal text-white/60 antialiased sm:text-base">
            {intro}
          </p>
        )}
      </div>

      <div ref={measureRef} className="w-full">
        <div
          ref={scrollRef}
          className={cn(
            'mt-8 flex gap-4 pb-4',
            hasOverflow
              ? cn(
                  'w-full snap-x snap-mandatory justify-start overflow-x-auto scroll-smooth pr-6',
                  OVERFLOW_RAIL_LEFT,
                  '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                )
              : 'justify-center overflow-x-visible px-6',
          )}
          onPointerDown={hasOverflow ? handleInteract : undefined}
        >
          {children}
        </div>
      </div>

      {hasOverflow && total > 1 && (
        <div className="mt-5 flex justify-center gap-2">
          {Array.from({ length: total }).map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => {
                handleInteract();
                scrollTo(index);
              }}
              aria-label={`Go to pathway ${index + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                index === activeIndex
                  ? 'w-6 bg-white'
                  : 'w-1.5 bg-white/30 hover:bg-white/60'
              }`}
            />
          ))}
        </div>
      )}

      {cta && (
        <div className={cn(CONTENT_SHELL, 'mt-10')}>
          {ctaNote && (
            <p className="mb-4 text-base leading-normal text-white/60 antialiased">
              {ctaNote}
            </p>
          )}
          <PrimaryPillCta cta={cta} wide className="max-w-none" />
        </div>
      )}
    </section>
  );
};
