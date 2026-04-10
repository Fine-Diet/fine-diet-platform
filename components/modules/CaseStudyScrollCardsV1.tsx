/**
 * Module: case-study.scroll-cards.v1
 *
 * Horizontal storytelling module with auto-scroll, dot navigation, and
 * pause-on-interact with read-timer resume.
 *
 * Auto-scroll behaviour:
 *   - Advances one card every AUTO_INTERVAL ms.
 *   - Any interaction (dot click, card tap/accordion open) pauses the timer.
 *   - After RESUME_DELAY ms of inactivity the timer resumes from the current card.
 *   - On reaching the last card, loops back to the first.
 *
 * Each card: image left, Before/Breakthrough/After accordion right.
 *   - Selected section label: dark
 *   - Selected copy: font-light, indented
 *   - Unselected labels: muted, no copy shown
 *
 * Section heading: max-w-3xl.
 *
 * Classification: new module — reusable storytelling module
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import type { CaseStudyScrollCardsV1Content } from '@/lib/modules/types';

interface Props {
  content: CaseStudyScrollCardsV1Content;
}

const AUTO_INTERVAL = 6000;  // ms between auto-advances
const RESUME_DELAY  = 8000;  // ms of inactivity before resuming auto-scroll

const SECTIONS = ['before', 'breakthrough', 'after'] as const;
type SectionKey = typeof SECTIONS[number];
const LABELS: Record<SectionKey, string> = {
  before: 'Before',
  breakthrough: 'Breakthrough',
  after: 'After',
};

// ─── Per-card accordion ───────────────────────────────────────────────────────

function CaseCard({
  card,
  index,
  onInteract,
}: {
  card: Props['content']['cards'][number];
  index: number;
  onInteract: () => void;
}) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const firstWithContent = SECTIONS.find((s) => card[s]);
  const [openSection, setOpenSection] = useState<SectionKey | null>(firstWithContent ?? 'before');

  const handleToggle = (section: SectionKey) => {
    onInteract();
    setOpenSection((prev) => (prev === section ? null : section));
  };

  const imgSrc = isMobile ? card.imageMobile : card.imageDesktop;

  return (
    <article
      className="flex flex-shrink-0 snap-start overflow-hidden rounded-2xl border border-brand-900/10 bg-neutral-0"
      style={{ width: 'min(560px, 85vw)' }}
    >
      {/* Image — left */}
      <div className="relative w-36 flex-shrink-0 sm:w-44">
        <Image
          src={imgSrc}
          alt={card.imageAlt ?? `Case study ${index + 1}`}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 144px, 176px"
        />
      </div>

      {/* Copy — right, accordion */}
      <div className="flex flex-1 flex-col divide-y divide-brand-900/10 overflow-hidden">
        {SECTIONS.map((section) => {
          const copy = card[section];
          const isOpen = openSection === section;
          const hasContent = !!copy;

          return (
            <div key={section}>
              <button
                type="button"
                onClick={() => handleToggle(section)}
                className="flex w-full items-start justify-between gap-3 px-5 py-3 text-left"
                aria-expanded={isOpen}
              >
                <span
                  className={`antialiased text-xs font-semibold uppercase tracking-widest transition-colors ${
                    isOpen ? 'text-brand-900' : 'text-brand-900/35'
                  }`}
                >
                  {LABELS[section]}
                </span>
                {hasContent && (
                  <span
                    className={`mt-px flex-shrink-0 text-brand-900/30 transition-transform duration-150 ${
                      isOpen ? 'rotate-45' : ''
                    }`}
                    aria-hidden="true"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </span>
                )}
              </button>

              {isOpen && copy && (
                <div className="px-5 pb-4 pl-8">
                  <p className="antialiased text-sm font-light leading-relaxed text-brand-900/70">
                    {copy}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}

// ─── Main module ──────────────────────────────────────────────────────────────

export function CaseStudyScrollCardsV1({ content }: Props) {
  const total = content.cards.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll to a card by index
  const scrollTo = useCallback((index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const card = container.children[index] as HTMLElement | undefined;
    if (!card) return;
    container.scrollTo({ left: card.offsetLeft - container.offsetLeft, behavior: 'smooth' });
    setActiveIndex(index);
  }, []);

  // Pause auto-scroll; restart resume timer
  const handleInteract = useCallback(() => {
    setPaused(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), RESUME_DELAY);
  }, []);

  // Dot click
  const handleDotClick = (i: number) => {
    handleInteract();
    scrollTo(i);
  };

  // Auto-scroll ticker
  useEffect(() => {
    if (paused || total <= 1) return;
    autoTimer.current = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % total;
        scrollTo(next);
        return next;
      });
    }, AUTO_INTERVAL);
    return () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
    };
  }, [paused, total, scrollTo]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, []);

  return (
    <section className="py-12 sm:py-16">
      {/* Section heading */}
      <div className="mx-auto max-w-3xl px-6 sm:px-10 mb-8">
        <h2 className="antialiased font-sans text-3xl font-semibold leading-tight text-brand-900 sm:text-4xl">
          {content.sectionHeading}
        </h2>
      </div>

      {/* Scroll track */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-4 pl-6 pr-6 sm:pl-10 sm:pr-10 snap-x snap-mandatory scroll-smooth"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        onPointerDown={handleInteract}
      >
        {content.cards.map((card, i) => (
          <CaseCard
            key={card.id ?? String(i)}
            card={card}
            index={i}
            onInteract={handleInteract}
          />
        ))}
      </div>

      {/* Dot navigation */}
      {total > 1 && (
        <div className="mt-5 flex justify-center gap-2">
          {content.cards.map((card, i) => (
            <button
              key={card.id ?? String(i)}
              type="button"
              onClick={() => handleDotClick(i)}
              aria-label={`Go to case study ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === activeIndex
                  ? 'w-6 bg-brand-900'
                  : 'w-1.5 bg-brand-900/25 hover:bg-brand-900/50'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
