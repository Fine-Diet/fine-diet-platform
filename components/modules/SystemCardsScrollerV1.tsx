import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

export interface SystemCardsScrollerV1Content {
  heading: string;
  intro?: string;
  cards: Array<{
    id?: string;
    eyebrow?: string;
    headline: string;
    description: string;
    image: string;
    imageAlt?: string;
  }>;
  surface?: 'dark' | 'light';
}

interface Props {
  content: SystemCardsScrollerV1Content;
}

const AUTO_INTERVAL = 6000;
const RESUME_DELAY = 8000;

export function SystemCardsScrollerV1({ content }: Props) {
  const cards = content.cards ?? [];
  const total = cards.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDark = (content.surface ?? 'dark') === 'dark';

  const scrollTo = useCallback((index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const card = container.children[index] as HTMLElement | undefined;
    if (!card) return;
    container.scrollTo({ left: card.offsetLeft - container.offsetLeft, behavior: 'smooth' });
    setActiveIndex(index);
  }, []);

  const handleInteract = useCallback(() => {
    setPaused(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), RESUME_DELAY);
  }, []);

  useEffect(() => {
    if (paused || total <= 1) return;
    autoTimer.current = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % total;
        const container = scrollRef.current;
        const card = container?.children[next] as HTMLElement | undefined;
        if (container && card) {
          container.scrollTo({ left: card.offsetLeft - container.offsetLeft, behavior: 'smooth' });
        }
        return next;
      });
    }, AUTO_INTERVAL);

    return () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
    };
  }, [paused, total]);

  useEffect(() => {
    return () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, []);

  if (total === 0) return null;

  return (
    <section
      className={cn(
        'px-0 pb-16 pt-24 sm:pb-20 sm:pt-28',
        isDark ? 'bg-neutral-950 text-white' : 'bg-brand-50 text-brand-900',
      )}
    >
      <div className="mx-auto max-w-3xl px-6 sm:px-10">
        <h2
          className={cn(
            'text-3xl font-semibold leading-tight antialiased sm:text-4xl',
            isDark ? 'text-white' : 'text-brand-900',
          )}
        >
          {content.heading}
        </h2>
        {content.intro && (
          <p
            className={cn(
              'mt-4 text-sm leading-7 antialiased sm:text-base',
              isDark ? 'text-white/60' : 'text-brand-900/66',
            )}
          >
            {content.intro}
          </p>
        )}
      </div>

      <div
        ref={scrollRef}
        className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 pl-6 pr-6 scroll-smooth sm:pl-10 sm:pr-10"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        onPointerDown={handleInteract}
      >
        {cards.map((card, index) => (
          <article
            key={card.id ?? `${card.headline}-${index}`}
            className={cn(
              'flex min-h-[220px] flex-shrink-0 snap-start overflow-hidden rounded-2xl border bg-transparent',
              isDark ? 'border-white/50 text-white' : 'border-brand-900/15 text-brand-900',
            )}
            style={{ width: 'min(560px, 86vw)' }}
          >
            <div className="relative w-36 flex-shrink-0 overflow-hidden bg-brand-100 sm:w-44">
              <img
                src={card.image}
                alt={card.imageAlt ?? card.headline}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-1 flex-col justify-center px-5 py-5 sm:px-6">
              {card.eyebrow && (
                <p
                  className={cn(
                    'mb-2 text-xs font-semibold uppercase tracking-[0.18em]',
                    isDark ? 'text-white/45' : 'text-brand-900/38',
                  )}
                >
                  {card.eyebrow}
                </p>
              )}
              <h3
                className={cn(
                  'text-lg font-semibold leading-snug antialiased sm:text-xl',
                  isDark ? 'text-white' : 'text-brand-900',
                )}
              >
                {card.headline}
              </h3>
              <div className="mt-2 pl-3">
                <p
                  className={cn(
                    'text-sm font-light leading-relaxed antialiased',
                    isDark ? 'text-white/70' : 'text-brand-900/64',
                  )}
                >
                  {card.description}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>

      {total > 1 && (
        <div className="mt-5 flex justify-center gap-2">
          {cards.map((card, index) => (
            <button
              key={card.id ?? `${card.headline}-dot-${index}`}
              type="button"
              onClick={() => {
                handleInteract();
                scrollTo(index);
              }}
              aria-label={`Go to system card ${index + 1}`}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                index === activeIndex
                  ? isDark
                    ? 'w-6 bg-white'
                    : 'w-6 bg-brand-900'
                  : isDark
                    ? 'w-1.5 bg-white/30 hover:bg-white/60'
                    : 'w-1.5 bg-brand-900/25 hover:bg-brand-900/45',
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}
