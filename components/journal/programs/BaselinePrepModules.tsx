'use client';

import type { ReactNode } from 'react';
import type { ProgramProgressSummary } from '@/lib/programs/progressTypes';
import type { ProgramRuntimeSummary } from '@/lib/programs/runtimeTypes';
import type { BaselinePrepModuleAccess } from '@/lib/programs/runtimeUi';

function capacityLabel(capacity: string | null | undefined): string {
  if (!capacity) return 'Not set';
  return capacity.charAt(0).toUpperCase() + capacity.slice(1);
}

function formatDateKey(dateKey: string | null | undefined): string {
  if (!dateKey) return 'Not selected';

  try {
    return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateKey;
  }
}

function ModuleShell({
  id,
  eyebrow,
  title,
  body,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="rounded-3xl border border-white/[0.07] bg-black/25 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.18)]"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
        {eyebrow}
      </p>
      <h3 className="mt-1 text-xl font-semibold leading-tight text-white">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-white/68">{body}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DetailPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </p>
      <p className="mt-0.5 text-xs font-semibold text-white/82">{value}</p>
    </div>
  );
}

function PlaceholderButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      disabled
      className="inline-flex rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white/65"
    >
      {children}
    </button>
  );
}

const roadmap = [
  {
    key: 'prep',
    label: 'Prep',
    range: 'Day 0',
    description: 'Arrive, map meals, and get the pantry ready.',
  },
  {
    key: 'week-1',
    label: 'Week 1',
    range: 'Days 1-7',
    description: 'Run the baseline rhythm with minimal changes.',
  },
  {
    key: 'day-7',
    label: 'Day 7 check-in',
    range: 'Day 7',
    description: 'Capture the first week of signals.',
  },
  {
    key: 'week-2',
    label: 'Week 2',
    range: 'Days 8-14',
    description: 'Keep the baseline steady and observe patterns.',
  },
  {
    key: 'day-14',
    label: 'Day 14 check-in',
    range: 'Day 14',
    description: 'Review the second weekly signal set.',
  },
  {
    key: 'week-3',
    label: 'Week 3',
    range: 'Days 15-21',
    description: 'Finish the baseline window before recommendations.',
  },
  {
    key: 'day-21',
    label: 'Day 21 check-in / recommendation',
    range: 'Day 21',
    description: 'Complete the final check-in and prepare the next step.',
  },
] as const;

function RoadmapItem({
  item,
  currentDay,
}: {
  item: (typeof roadmap)[number];
  currentDay: number | null;
}) {
  const isCurrent =
    (item.key === 'prep' && currentDay === 0) ||
    (item.key === 'week-1' &&
      currentDay != null &&
      currentDay >= 1 &&
      currentDay < 7) ||
    (item.key === 'day-7' && currentDay === 7) ||
    (item.key === 'week-2' &&
      currentDay != null &&
      currentDay > 7 &&
      currentDay < 14) ||
    (item.key === 'day-14' && currentDay === 14) ||
    (item.key === 'week-3' &&
      currentDay != null &&
      currentDay > 14 &&
      currentDay < 21) ||
    (item.key === 'day-21' && currentDay === 21);

  return (
    <li
      className={`rounded-2xl border p-3 ${
        isCurrent
          ? 'border-emerald-300/25 bg-emerald-400/10'
          : 'border-white/[0.06] bg-white/[0.035]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{item.label}</p>
          <p className="mt-1 text-xs leading-snug text-white/58">
            {item.description}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/52">
          {item.range}
        </span>
      </div>
    </li>
  );
}

export function BaselinePrepModules({
  runtimeSummary,
  progressSummary,
  access,
}: {
  runtimeSummary: ProgramRuntimeSummary | null;
  progressSummary: ProgramProgressSummary | null;
  access: BaselinePrepModuleAccess;
}) {
  if (access === 'hidden') return null;

  const currentDay = runtimeSummary?.current_day ?? null;
  const isReference = access === 'reference';
  const progressValue = progressSummary
    ? `${progressSummary.items_completed}/${progressSummary.items_total} content items complete`
    : 'Program content progress will appear once items are started.';

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/45">
              {isReference ? 'Day 0 reference' : 'Baseline preparation'}
            </p>
            <h2 className="mt-1 text-2xl font-semibold leading-tight text-white">
              {isReference
                ? 'Prep modules remain available'
                : 'Set up your Baseline'}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/65">
              {isReference
                ? 'Return to these setup steps any time while Baseline is active.'
                : 'Use these modules to arrive, map your repeatable meals, and prepare your pantry before day 1.'}
            </p>
          </div>
          <span className="rounded-full border border-sky-300/25 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-sky-100">
            {isReference ? 'Reference' : 'Prep'}
          </span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <DetailPill
            label="Selected start"
            value={formatDateKey(runtimeSummary?.enrollment.selected_start_date)}
          />
          <DetailPill
            label="Current day"
            value={currentDay == null ? 'Not enrolled' : `Day ${currentDay}`}
          />
          <DetailPill
            label="Capacity"
            value={capacityLabel(runtimeSummary?.enrollment.current_capacity)}
          />
          <DetailPill label="Progress" value={progressValue} />
        </div>
      </section>

      <ModuleShell
        id="baseline-arrive"
        eyebrow="Orientation / Arrive"
        title="Arrive before the program starts"
        body="This area will hold the Day 0 orientation, including the future audio or video intro for the Baseline setup."
      >
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
            Future media area
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/65">
            Audio or video guidance will live here. For now, use this step as
            the arrival point before building the rest of your Day 0 setup.
          </p>
        </div>
      </ModuleShell>

      <ModuleShell
        id="baseline-meal-map"
        eyebrow="Build Your Meal Map"
        title="Turn preparation into a simple map"
        body="The meal map connects the setup work: create baseline meal placeholders first, then prepare the pantry around those choices."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <a
            href="#baseline-create-meals"
            className="rounded-2xl border border-white/[0.08] bg-white/[0.05] p-4 hover:bg-white/[0.08]"
          >
            <p className="text-sm font-semibold text-white">Create Meals</p>
            <p className="mt-1 text-xs leading-snug text-white/58">
              Start with repeatable meal shells. The full meal creation flow is
              coming later.
            </p>
          </a>
          <a
            href="#baseline-prepare-pantry"
            className="rounded-2xl border border-white/[0.08] bg-white/[0.05] p-4 hover:bg-white/[0.08]"
          >
            <p className="text-sm font-semibold text-white">Prepare Pantry</p>
            <p className="mt-1 text-xs leading-snug text-white/58">
              Review readiness without changing Plans or grocery logic.
            </p>
          </a>
        </div>
      </ModuleShell>

      <ModuleShell
        id="baseline-create-meals"
        eyebrow="Create Meals"
        title="Create baseline meal shells"
        body="This module will connect to a future meal creation flow. Packet 5 keeps it as a delivery shell and does not invent meal recommendation logic."
      >
        <PlaceholderButton>Create meals flow coming soon</PlaceholderButton>
      </ModuleShell>

      <ModuleShell
        id="baseline-prepare-pantry"
        eyebrow="Prepare Pantry"
        title="Prepare pantry and grocery readiness"
        body="This module will connect to future pantry and grocery readiness work without altering Plans or grocery behavior."
      >
        <PlaceholderButton>Pantry readiness flow coming soon</PlaceholderButton>
      </ModuleShell>

      <ModuleShell
        id="baseline-roadmap"
        eyebrow="Program Roadmap"
        title="Baseline sequence"
        body="Baseline runs as a three-week observation sequence with weekly check-ins and a final recommendation checkpoint."
      >
        <ol className="space-y-2">
          {roadmap.map((item) => (
            <RoadmapItem key={item.key} item={item} currentDay={currentDay} />
          ))}
        </ol>
      </ModuleShell>
    </div>
  );
}
