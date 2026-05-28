'use client';

import type { ReactNode } from 'react';
import type { ProgramRuntimeSummary } from '@/lib/programs/runtimeTypes';
import {
  getBaselineWeekOneCapacityCopy,
  shouldShowBaselineWeekOneModules,
} from '@/lib/programs/runtimeUi';

function WeekOneCard({
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

function RhythmStep({ text }: { text: string }) {
  return (
    <li className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3 text-sm leading-snug text-white/78">
      {text}
    </li>
  );
}

export function BaselineWeekOneModules({
  runtimeSummary,
  checkinDue,
  checkinAnchorId,
}: {
  runtimeSummary: ProgramRuntimeSummary;
  checkinDue: boolean;
  checkinAnchorId: string;
}) {
  if (!shouldShowBaselineWeekOneModules(runtimeSummary)) return null;

  const currentDay = runtimeSummary.current_day;
  const capacityCopy = getBaselineWeekOneCapacityCopy(
    runtimeSummary.enrollment.current_capacity,
  );

  return (
    <section>
      <h2 className="mb-2 text-[11px] uppercase tracking-wider text-white/50">
        Week 1 in Baseline
      </h2>
      <div className="space-y-3">
        <WeekOneCard
          eyebrow="Week 1 focus"
          title="Eating Rhythm"
          body="This week is about finding a steady rhythm you can repeat. My body is not the problem; the work is to listen, nourish, and make the next meal easier to return to."
        >
          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.06] p-3">
            <p className="text-sm font-semibold text-white">
              Day {currentDay}: consistency over correctness
            </p>
            <p className="mt-1 text-xs leading-relaxed text-white/62">
              You are not trying to perfect your meals. You are collecting
              information about what helps you feel steady.
            </p>
          </div>
        </WeekOneCard>

        <WeekOneCard
          eyebrow="Today's practice"
          title="Nourish before you optimize"
          body="Choose the next simple meal or snack that helps today feel more steady. Repeat meals when repetition makes the day easier."
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            <RhythmStep text="Eat within 60-90 minutes of waking when you can." />
            <RhythmStep text="Aim to eat every 3-4 hours while you are awake." />
            <RhythmStep text="Include protein, carbs, and fat at meals." />
            <RhythmStep text="Repeat breakfast or lunch if that lowers friction." />
          </ul>
        </WeekOneCard>

        <WeekOneCard
          eyebrow="Eating rhythm guide"
          title="Make repeatable meals easier to find"
          body="A repeatable meal is not a rule. It is a useful option you can return to when the day is full."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3">
              <p className="text-sm font-semibold text-white">Timing</p>
              <p className="mt-1 text-xs leading-snug text-white/58">
                Notice whether earlier nourishment changes hunger, energy, or
                cravings later.
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3">
              <p className="text-sm font-semibold text-white">Balance</p>
              <p className="mt-1 text-xs leading-snug text-white/58">
                Protein, carbs, and fat can make meals feel more complete
                without making them complicated.
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3">
              <p className="text-sm font-semibold text-white">Repetition</p>
              <p className="mt-1 text-xs leading-snug text-white/58">
                Repeating a meal can create steadiness while you learn your
                Baseline signals.
              </p>
            </div>
          </div>
        </WeekOneCard>

        <WeekOneCard
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
        </WeekOneCard>

        {currentDay === 7 && (
          <WeekOneCard
            eyebrow="Day 7 check-in"
            title={checkinDue ? 'Your first check-in is ready' : 'Day 7 check-in'}
            body={
              checkinDue
                ? 'This is information, not a test. Use the check-in below to capture what you noticed this week.'
                : 'When the Day 7 check-in has been handled, keep using this week as information for what feels repeatable.'
            }
          >
            {checkinDue ? (
              <a
                href={`#${checkinAnchorId}`}
                className="inline-flex rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/15"
              >
                Go to Day 7 check-in
              </a>
            ) : (
              <p className="text-xs leading-snug text-white/52">
                No action is needed here right now.
              </p>
            )}
          </WeekOneCard>
        )}
      </div>
    </section>
  );
}
