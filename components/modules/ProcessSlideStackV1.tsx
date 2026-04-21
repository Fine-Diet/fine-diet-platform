/**
 * Module: process.slide-stack.v1
 *
 * Interactive stacked panel process slideshow.
 * One step is open at a time; closed steps stack as vertical tabs to the side.
 *
 * Outer section: full-width, rounded-t-[2rem] so it overlaps ("tabs into")
 * the hero section above via -mt-8. overflow-hidden clips the tab's inner
 * corners. Background is a hard switch: brand-900 (dark) for the top portion
 * containing the heading + slideshow, neutral-0 (light) for the bottom gap.
 * No gradient — hard color split only.
 *
 * Hero must have flat bottom corners for the overlap effect to read correctly.
 *
 * Desktop slideshow layout:
 *   - Closed tabs get ascending bg colors by step order: brand-200 → brand-700
 *   - Tab labels are top-aligned with clear number/label separation
 *   - Open panel has no rounded corners (outer shell provides the shape)
 *   - Shorter aspect ratio than initial build (closer to the prototype)
 *
 * Inner content: max-w-3xl centered.
 *
 * Classification: new module
 * Behavior: tab/slideshow — NOT a generic accordion or tabs component.
 */

import { useState, useEffect } from 'react';
import Image from 'next/image';
import type { ProcessSlideStackV1Content } from '@/lib/modules/types';

interface Props {
  content: ProcessSlideStackV1Content;
}

// Ascending background colors by original step index (0-based)
const TAB_BG = ['bg-brand-200', 'bg-brand-400', 'bg-brand-500', 'bg-brand-700'] as const;

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
};

export function ProcessSlideStackV1({ content }: Props) {
  const [activeIndex, setActiveIndex] = useState(content.defaultOpenIndex ?? 0);
  const isMobile = useIsMobile();
  const activeStep = content.steps[activeIndex];

  return (
    /*
     * overflow-hidden + rounded-t-[2rem] clips everything to the tab shape.
     * -mt-8 overlaps the flat-bottomed hero above.
     * bg-brand-900 is the base; a gradient overlay fades to neutral-0 at ~55%.
     */
    <section className="relative -mt-8 w-full overflow-hidden rounded-t-[2rem] bg-brand-900">

      {/* Gradient: dark top → neutral-0 bottom */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, transparent 65%, #f3f3ea 65%)' }}
        aria-hidden="true"
      />

      {/* ── Content ── */}
      <div className="relative px-6 pb-10 pt-10 sm:px-6 sm:pt-14">
        <div className="mx-auto max-w-3xl">

          {content.heading && (
            <h2 className="antialiased mb-8 font-sans text-3xl font-semibold leading-tight text-white sm:text-4xl">
              {content.heading}
            </h2>
          )}

          {/* Desktop: horizontal stacked tabs */}
          <div className="hidden md:flex overflow-hidden rounded-[1.5rem] shadow-large">
            {/* Left stacked closed tabs (steps before active) */}
            {content.steps.slice(0, activeIndex).map((step, i) => {
              const originalIndex = i;
              const bg = TAB_BG[originalIndex] ?? 'bg-brand-500';
              return (
                <button
                  key={step.stepNumber}
                  type="button"
                  onClick={() => setActiveIndex(originalIndex)}
                  className={`flex w-12 flex-shrink-0 flex-col items-center justify-end gap-4 border-r border-white/10 pb-4 transition-opacity hover:brightness-90 ${bg}`}
                  aria-label={`Go to step ${step.stepNumber}: ${step.label}`}
                >
                  <span className="[writing-mode:vertical-rl] rotate-180 antialiased text-xs font-semibold uppercase tracking-widest text-white/80">{step.label}</span>
                  <span className="[writing-mode:vertical-rl] rotate-180 antialiased text-xs font-semibold text-white/80">{step.stepNumber}</span>
                </button>
              );
            })}

            {/* Open panel — no rounded corners, outer shell owns the shape */}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-neutral-0">
              {/*
               * Ghost-stack copy region: all steps rendered in the same grid cell.
               * Inactive steps are opacity-0 + pointer-events-none so they are
               * invisible but still occupy their natural height, anchoring the
               * panel to the tallest step's copy on first render.
               */}
              <div className="relative grid flex-1">
                {content.steps.map((step, i) => (
                  <div
                    key={step.stepNumber}
                    aria-hidden={i !== activeIndex}
                    className={`col-start-1 row-start-1 px-7 py-6 sm:px-8 sm:py-7 transition-opacity duration-200 ${
                      i === activeIndex ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                  >
                    <p className="antialiased mb-2 text-sm font-semibold uppercase tracking-widest text-brand-900/40">
                      {step.stepNumber}&nbsp;&nbsp;{step.label}
                    </p>
                    {step.title && (
                      <h3 className="antialiased mb-3 font-sans text-xl font-semibold leading-snug text-brand-900">
                        {step.title}
                      </h3>
                    )}
                    <ul className="space-y-1">
                      {step.lines.map((line, li) => (
                        <li key={li} className="antialiased flex items-start gap-3 text-base font-light leading-relaxed text-brand-900/70">
                          <span className="mt-px flex-shrink-0 text-brand-900/40">&mdash;</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {/* Image region — no rounded corners */}
              <div className="relative h-44 w-full overflow-hidden sm:h-52">
                <Image
                  src={isMobile ? activeStep.imageMobile : activeStep.imageDesktop}
                  alt={activeStep.label}
                  fill
                  className="object-cover object-top"
                  sizes="48rem"
                />
              </div>
            </div>

            {/* Right stacked closed tabs (steps after active) */}
            {content.steps.slice(activeIndex + 1).map((step, i) => {
              const originalIndex = activeIndex + 1 + i;
              const bg = TAB_BG[originalIndex] ?? 'bg-brand-700';
              return (
                <button
                  key={step.stepNumber}
                  type="button"
                  onClick={() => setActiveIndex(originalIndex)}
                  className={`flex w-12 flex-shrink-0 flex-col items-center gap-4 border-l border-white/10 pt-4 transition-opacity hover:brightness-90 ${bg}`}
                  aria-label={`Go to step ${step.stepNumber}: ${step.label}`}
                >
                  <span className="[writing-mode:vertical-rl] antialiased text-xs font-semibold text-white/60">{step.stepNumber}</span>
                  <span className="[writing-mode:vertical-rl] antialiased text-xs font-semibold uppercase tracking-widest text-white/60">{step.label}</span>
                </button>
              );
            })}
          </div>

          {/* Mobile: single rounded container, all steps inside, no gaps */}
          <div className="overflow-hidden rounded-[1.5rem] md:hidden">
            {content.steps.map((step, i) => {
              const isOpen = activeIndex === i;
              const bg = TAB_BG[i] ?? 'bg-brand-700';
              return (
                <div key={step.stepNumber}>
                  {/* Tab row — no rounded corners */}
                  <button
                    type="button"
                    onClick={() => setActiveIndex(i)}
                    className={`flex w-full gap-4 px-6 py-4 text-left transition-colors hover:brightness-90 ${isOpen ? 'items-end bg-neutral-0 text-brand-900' : `items-center ${bg} text-white`}`}
                  >
                    <span className={`antialiased text-xs font-semibold uppercase tracking-widest ${isOpen ? 'text-brand-900/40' : ''}`}>
                      {step.stepNumber}
                    </span>
                    <span className={`antialiased flex-1 text-xs font-semibold uppercase tracking-widest ${isOpen ? 'text-brand-900/40' : ''}`}>
                      {step.label}
                    </span>
                    <span className={`flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </span>
                  </button>

                  {/* Open content — no rounded corners */}
                  {isOpen && (
                    <div className="bg-neutral-0">
                      <div className="pl-6 pr-5 pt-0 pb-5">
                        {step.title && (
                          <h3 className="antialiased mb-3 font-sans text-lg font-semibold leading-snug text-brand-900">
                            {step.title}
                          </h3>
                        )}
                        <ul className="space-y-0">
                          {step.lines.map((line, li) => (
                            <li key={li} className="antialiased flex items-start gap-3 text-sm font-light leading-relaxed text-brand-900/70">
                              <span className="mt-px flex-shrink-0 text-brand-900/40">&mdash;</span>
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="relative h-48 w-full overflow-hidden">
                        <Image
                          src={step.imageMobile}
                          alt={step.label}
                          fill
                          className="object-cover object-top"
                          sizes="100vw"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </div>

    </section>
  );
}
