/**
 * TimedProcessSteps — input-defined "how it works" step list with an auto-
 * advancing highlight, modeled on the motion behavior of CaseStudyScrollCardsV1
 * and StartView's SystemCardsScroller.
 *
 * Behavior:
 *   - Auto-highlights one step at a time every STEP_INTERVAL ms.
 *   - The active step shows a bottom-border progress indicator that fills over
 *     the interval.
 *   - Click / tap a step to select it.
 *   - Any interaction pauses the auto cycle; it resumes after RESUME_DELAY ms.
 *   - Reduced-motion safe: when the user prefers reduced motion, there is no
 *     auto-advance and no animated progress bar (the active step still shows a
 *     static indicator and remains fully clickable).
 *
 * Input-defined: rendered entirely from the `steps` array (category content),
 * never hardcoded.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CategoryProcessStep } from '@/lib/programs/programCategoryContent';

const STEP_INTERVAL = 8000; // ms each step stays highlighted
const RESUME_DELAY = 8000; // ms of inactivity before auto-cycle resumes

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

export interface TimedProcessStepsProps {
  heading: string;
  steps: CategoryProcessStep[];
}

export default function TimedProcessSteps({ heading, steps }: TimedProcessStepsProps) {
  const total = steps.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = usePrefersReducedMotion();

  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLSpanElement | null>(null);

  const handleSelect = useCallback((index: number) => {
    setActiveIndex(index);
    setPaused(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), RESUME_DELAY);
  }, []);

  // Auto-advance cycle (disabled under reduced motion / when paused).
  useEffect(() => {
    if (reduced || paused || total <= 1) return;
    autoTimer.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % total);
    }, STEP_INTERVAL);
    return () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
    };
  }, [reduced, paused, total]);

  // Progress-bar fill for the active step.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    if (reduced) {
      bar.style.transition = 'none';
      bar.style.width = '100%';
      return;
    }

    if (paused) {
      // Freeze at the current fill instead of snapping back.
      const frozen = getComputedStyle(bar).width;
      bar.style.transition = 'none';
      bar.style.width = frozen;
      return;
    }

    bar.style.transition = 'none';
    bar.style.width = '0%';
    // Force reflow so the next style change animates from 0.
    void bar.offsetWidth;
    bar.style.transition = `width ${STEP_INTERVAL}ms linear`;
    bar.style.width = '100%';
  }, [activeIndex, paused, reduced]);

  useEffect(
    () => () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    },
    [],
  );

  if (total === 0) return null;

  return (
    <section className="border-b border-brand-100 bg-white px-6 py-14 sm:py-16">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] antialiased sm:text-3xl">
          {heading}
        </h2>

        <div className="mt-8 overflow-hidden rounded-3xl border border-brand-100 bg-neutral-0 divide-y divide-brand-100">
          {steps.map((step, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={step.stepNumber}
                type="button"
                onClick={() => handleSelect(index)}
                aria-current={isActive ? 'step' : undefined}
                className="relative flex w-full items-start gap-4 px-6 py-5 text-left transition-colors sm:gap-6 sm:px-8 sm:py-6"
              >
                <span
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                    isActive
                      ? 'bg-brand-900 text-white'
                      : 'bg-brand-100/60 text-brand-900/55'
                  }`}
                >
                  {step.stepNumber}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3
                      className={`text-lg font-semibold antialiased transition-colors ${
                        isActive ? 'text-brand-900' : 'text-brand-900/70'
                      }`}
                    >
                      {step.title}
                    </h3>
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-900/40">
                      {step.label}
                    </span>
                  </div>
                  <p
                    className={`mt-1 text-sm leading-relaxed transition-colors ${
                      isActive ? 'text-brand-900/70' : 'text-brand-900/45'
                    }`}
                  >
                    {step.description}
                  </p>
                </div>

                {/* Active bottom-border progress indicator */}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-[2px] bg-brand-900/10"
                  >
                    <span
                      ref={barRef}
                      className="block h-full bg-brand-900"
                      style={{ width: '0%' }}
                    />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
