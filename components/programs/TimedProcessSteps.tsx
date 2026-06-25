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
    <section className="bg-brand-50 px-6 py-14 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] antialiased sm:text-3xl">
          {heading}
        </h2>

        <div className="mt-8 overflow-hidden rounded-3xl border border-brand-900/20 divide-y divide-brand-900/20">
          {steps.map((step, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={step.stepNumber}
                type="button"
                onClick={() => handleSelect(index)}
                aria-current={isActive ? 'step' : undefined}
                className={`relative grid w-full grid-cols-[2rem_1fr] items-start gap-x-5 px-6 py-5 text-left transition-colors sm:grid-cols-[2rem_1.2fr_1.8fr] sm:gap-x-8 sm:px-8 sm:py-6 ${
                  isActive ? 'bg-white/80' : 'bg-white/20'
                }`}
              >
                <span
                  className={`pt-0.5 text-base leading-snug transition-colors ${
                    isActive ? 'font-semibold text-brand-900' : 'font-light text-brand-900/70'
                  }`}
                >
                  {step.stepNumber}
                </span>
                <h3
                  className={`text-base leading-snug antialiased transition-colors ${
                    isActive ? 'font-semibold text-brand-900' : 'font-light text-brand-900/70'
                  }`}
                >
                  {step.title}
                </h3>
                <p
                  className={`col-start-2 mt-2 text-base leading-snug transition-colors sm:col-start-auto sm:mt-0 ${
                    isActive ? 'font-semibold text-brand-900' : 'font-light text-brand-900/70'
                  }`}
                >
                  {step.description}
                </p>

                {/* Active bottom-border progress indicator */}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-[4px] bg-brand-900/10"
                  >
                    <span
                      ref={barRef}
                      className="block h-full bg-brand-900/90"
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