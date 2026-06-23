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
 */

import {
  Children,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

const AUTO_INTERVAL = 6000;
const RESUME_DELAY = 8000;

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
}

export default function SeriesPathwayRail({
  heading,
  intro,
  children,
}: SeriesPathwayRailProps) {
  const total = Children.count(children);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = usePrefersReducedMotion();

  const scrollRef = useRef<HTMLDivElement>(null);
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
    if (reduced || paused || total <= 1) return;
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
  }, [reduced, paused, total]);

  useEffect(
    () => () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    },
    [],
  );

  return (
    <section className="bg-neutral-950 px-0 pb-16 pt-16 text-white sm:pb-20 sm:pt-20">
      <div className="mx-auto max-w-3xl px-6 sm:px-10">
        <h2 className="text-3xl font-semibold leading-tight tracking-[-0.03em] text-white antialiased sm:text-4xl">
          {heading}
        </h2>
        {intro && (
          <p className="mt-4 text-sm leading-7 text-white/60 antialiased sm:text-base">
            {intro}
          </p>
        )}
      </div>

      <div
        ref={scrollRef}
        className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-4 pl-6 pr-6 sm:pl-10 sm:pr-10"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        onPointerDown={handleInteract}
      >
        {children}
      </div>

      {total > 1 && (
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
    </section>
  );
}
