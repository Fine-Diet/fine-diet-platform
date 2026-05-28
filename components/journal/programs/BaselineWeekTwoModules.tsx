'use client';

import type { ReactNode } from 'react';
import type { ProgramRuntimeSummary } from '@/lib/programs/runtimeTypes';
import {
  getBaselineWeekTwoCapacityCopy,
  shouldShowBaselineWeekTwoModules,
} from '@/lib/programs/runtimeUi';

function WeekTwoCard({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/[0.07] bg-white/[0.04] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/42">
        {eyebrow}
      </p>
      <h3 className="mt-1 text-xl font-semibold leading-tight text-white">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-white/68">{body}</p>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

function RecoveryStep({ text }: { text: string }) {
  return (
    <li className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3 text-sm leading-snug text-white/78">
      {text}
    </li>
  );
}

export function BaselineWeekTwoModules({
  runtimeSummary,
  checkinDue,
  checkinAnchorId,
}: {
  runtimeSummary: ProgramRuntimeSummary;
  checkinDue: boolean;
  checkinAnchorId: string;
}) {
  if (!shouldShowBaselineWeekTwoModules(runtimeSummary)) return null;

  const currentDay = runtimeSummary.current_day;
  const capacityCopy = getBaselineWeekTwoCapacityCopy(
    runtimeSummary.enrollment.current_capacity,
  );

  return (
    <section>
      <h2 className="mb-2 text-[11px] uppercase tracking-wider text-white/50">
        Week 2 in Baseline
      </h2>
      <div className="space-y-3">
        <WeekTwoCard
          eyebrow="Week 2 focus"
          title="Digestion & Recovery Support"
          body="This week keeps the rhythm steady and adds calm around meals. Your body responds to how you eat, not just what you eat."
        >
          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.06] p-3">
            <p className="text-sm font-semibold text-white">
              Day {currentDay}: pace, warmth, recovery, and rhythm
            </p>
            <p className="mt-1 text-xs leading-relaxed text-white/62">
              If digestion feels off, slow down before changing foods.
            </p>
          </div>
        </WeekTwoCard>

        <WeekTwoCard
          eyebrow="Today's practice"
          title="Slow down before you switch foods"
          body="Use the same low-pressure Baseline rhythm, with more attention to pace and recovery cues around meals."
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            <RecoveryStep text="Slow the first few bites of a meal." />
            <RecoveryStep text="Eat seated when possible." />
            <RecoveryStep text="Choose warm or simple meals when digestion feels off." />
            <RecoveryStep text="Keep meal rhythm steady before changing the menu." />
          </ul>
        </WeekTwoCard>

        <WeekTwoCard
          eyebrow="Digestion & recovery guide"
          title="Support calm without making stricter rules"
          body="Digestion and recovery often respond to the conditions around eating. Treat this as information, not a test."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3">
              <p className="text-sm font-semibold text-white">Pace</p>
              <p className="mt-1 text-xs leading-snug text-white/58">
                Start slower and notice whether the meal feels easier to
                receive.
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3">
              <p className="text-sm font-semibold text-white">Warmth</p>
              <p className="mt-1 text-xs leading-snug text-white/58">
                Warm or simple meals can be useful options when digestion feels
                variable.
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3">
              <p className="text-sm font-semibold text-white">Recovery</p>
              <p className="mt-1 text-xs leading-snug text-white/58">
                A consistent wake time or wind-down cue can support the rhythm
                around meals.
              </p>
            </div>
          </div>
        </WeekTwoCard>

        <WeekTwoCard
          eyebrow={capacityCopy.label}
          title={capacityCopy.title}
          body={capacityCopy.body}
        >
          <div className="rounded-2xl border border-sky-300/15 bg-sky-400/[0.06] p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-100/75">
              Capacity-aware practice
            </p>
            <p className="mt-1 text-sm leading-relaxed text-white/72">
              {capacityCopy.practice}
            </p>
          </div>
        </WeekTwoCard>

        {currentDay === 14 && (
          <WeekTwoCard
            eyebrow="Day 14 check-in"
            title={checkinDue ? 'Your Week 2 check-in is ready' : 'Day 14 check-in'}
            body={
              checkinDue
                ? 'This is information, not a test. Use the check-in below to capture how pace, rhythm, and recovery felt this week.'
                : 'When the Day 14 check-in has been handled, keep using this week as information for what supports steadiness.'
            }
          >
            {checkinDue ? (
              <a
                href={`#${checkinAnchorId}`}
                className="inline-flex rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/15"
              >
                Go to Day 14 check-in
              </a>
            ) : (
              <p className="text-xs leading-snug text-white/52">
                No action is needed here right now.
              </p>
            )}
          </WeekTwoCard>
        )}
      </div>
    </section>
  );
}
