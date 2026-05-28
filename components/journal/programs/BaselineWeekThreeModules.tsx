'use client';

import type { ReactNode } from 'react';
import type { ProgramRuntimeSummary } from '@/lib/programs/runtimeTypes';
import {
  getBaselineWeekThreeCapacityCopy,
  isDay21Handled,
  shouldShowBaselineWeekThreeModules,
} from '@/lib/programs/runtimeUi';

function WeekThreeCard({
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

function FlexStep({ text }: { text: string }) {
  return (
    <li className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3 text-sm leading-snug text-white/78">
      {text}
    </li>
  );
}

export function BaselineWeekThreeModules({
  runtimeSummary,
  checkinDue,
  checkinAnchorId,
  recommendationAnchorId,
}: {
  runtimeSummary: ProgramRuntimeSummary;
  checkinDue: boolean;
  checkinAnchorId: string;
  recommendationAnchorId: string;
}) {
  if (!shouldShowBaselineWeekThreeModules(runtimeSummary)) return null;

  const currentDay = runtimeSummary.current_day;
  const day21Handled = isDay21Handled(runtimeSummary);
  const capacityCopy = getBaselineWeekThreeCapacityCopy(
    runtimeSummary.enrollment.current_capacity,
  );

  return (
    <section>
      <h2 className="mb-2 text-[11px] uppercase tracking-wider text-white/50">
        Week 3 in Baseline
      </h2>
      <div className="space-y-3">
        <WeekThreeCard
          eyebrow="Week 3 focus"
          title="Real-Life Flexibility"
          body="This week is about returning to rhythm after disruption and noticing what helped. Flexibility is part of the process, never a setback."
        >
          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.06] p-3">
            <p className="text-sm font-semibold text-white">
              Day {currentDay}: continue and reinforce
            </p>
            <p className="mt-1 text-xs leading-relaxed text-white/62">
              If things feel messy, return to your most reliable meal.
            </p>
          </div>
        </WeekThreeCard>

        <WeekThreeCard
          eyebrow="Today's practice"
          title="Return to the anchor that worked"
          body="Choose one steady action that helps you return to rhythm. You do not need to fix the whole week at once."
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            <FlexStep text="Repeat the most reliable meal from Baseline so far." />
            <FlexStep text="Return to rhythm after disruption without judgment." />
            <FlexStep text="Observe patterns before choosing another change." />
            <FlexStep text="Choose one adjustment to continue or reinforce." />
          </ul>
        </WeekThreeCard>

        <WeekThreeCard
          eyebrow="Real-life flexibility guide"
          title="Make recovery part of the rhythm"
          body="Baseline is not asking for a perfect week. It is helping you see which anchors make real life easier to return from."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3">
              <p className="text-sm font-semibold text-white">Return</p>
              <p className="mt-1 text-xs leading-snug text-white/58">
                Use a reliable meal or timing cue as the first move back into
                rhythm.
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3">
              <p className="text-sm font-semibold text-white">Observe</p>
              <p className="mt-1 text-xs leading-snug text-white/58">
                Notice patterns without turning them into a judgment about your
                body.
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3">
              <p className="text-sm font-semibold text-white">Maintain</p>
              <p className="mt-1 text-xs leading-snug text-white/58">
                Choose maintenance anchors that feel repeatable after Baseline.
              </p>
            </div>
          </div>
        </WeekThreeCard>

        <WeekThreeCard
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
        </WeekThreeCard>

        {currentDay === 21 && (
          <WeekThreeCard
            eyebrow="Day 21 check-in / recommendation"
            title={
              checkinDue
                ? 'Your final Baseline check-in is ready'
                : day21Handled
                  ? 'Your next-step review is ready'
                  : 'Day 21 transition'
            }
            body={
              checkinDue
                ? 'This is information, not a test. Use the check-in below to complete the Baseline signal set.'
                : day21Handled
                  ? 'Your Day 21 check-in is handled. Review the recommendation section below when you are ready.'
                  : 'When Day 21 is handled, Fine Diet will prepare a conservative next-step review below.'
            }
          >
            {checkinDue ? (
              <a
                href={`#${checkinAnchorId}`}
                className="inline-flex rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/15"
              >
                Go to Day 21 check-in
              </a>
            ) : day21Handled ? (
              <a
                href={`#${recommendationAnchorId}`}
                className="inline-flex rounded-full border border-brand-50/25 bg-brand-50/10 px-3 py-1.5 text-xs font-semibold text-brand-50 hover:bg-brand-50/15"
              >
                Review recommendation
              </a>
            ) : (
              <p className="text-xs leading-snug text-white/52">
                No action is needed here right now.
              </p>
            )}
          </WeekThreeCard>
        )}
      </div>
    </section>
  );
}
