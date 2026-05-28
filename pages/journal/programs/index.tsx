'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import {
  PROGRAMS_MVP_CATEGORIES,
  PROGRAMS_MVP_HERO_IMAGE_URL,
  type AppProgramDefinition,
  type AppProgramSupportCategoryDefinition,
} from '@/lib/programs/appProgramsMvp';
import type { ProgramLibrary } from '@/lib/programs/programLibraryServerService';
import type {
  ProgramCapacity,
  ProgramRuntimeSummary,
  ProgramRuntimeSummaryList,
} from '@/lib/programs/runtimeTypes';
import { resolveBaselineCardRuntimeState } from '@/lib/programs/runtimeUi';

const BASELINE_SLUG = 'baseline';

type StartDateChoice = 'today' | 'monday' | 'custom';

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getComingMondayDate(): string {
  const date = new Date();
  const daysUntilMonday = (8 - date.getDay()) % 7 || 7;
  date.setDate(date.getDate() + daysUntilMonday);
  return toDateInputValue(date);
}

function formatDateLabel(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  try {
    return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

function CategoryAction({
  category,
}: {
  category: AppProgramSupportCategoryDefinition;
}) {
  return (
    <button
      type="button"
      disabled={category.categoryNavigationDisabled}
      aria-label={`${category.name} category navigation coming soon`}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 disabled:cursor-not-allowed disabled:opacity-70"
    >
      <svg
        aria-hidden
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

function RuntimeStatusPill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'ready' | 'active' | 'paused' | 'complete' | 'locked';
}) {
  const toneClass = {
    neutral: 'border-white/12 bg-white/[0.08] text-white/78',
    ready: 'border-sky-300/30 bg-sky-400/10 text-sky-100',
    active: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100',
    paused: 'border-amber-300/30 bg-amber-400/10 text-amber-100',
    complete: 'border-brand-50/30 bg-brand-50/15 text-brand-50',
    locked: 'border-white/12 bg-white/[0.06] text-white/62',
  }[tone];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}
    >
      {children}
    </span>
  );
}

function BaselineStartFlow({
  onStarted,
}: {
  onStarted: () => Promise<void>;
}) {
  const today = useMemo(() => toDateInputValue(new Date()), []);
  const monday = useMemo(() => getComingMondayDate(), []);
  const [startChoice, setStartChoice] = useState<StartDateChoice>('today');
  const [customDate, setCustomDate] = useState(today);
  const [capacity, setCapacity] = useState<ProgramCapacity>('steady');
  const [timezone, setTimezone] = useState('UTC');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setTimezone(detected);
    } catch {
      setTimezone('UTC');
    }
  }, []);

  const selectedStartDate =
    startChoice === 'today'
      ? today
      : startChoice === 'monday'
        ? monday
        : customDate;

  async function submitEnrollment() {
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch('/api/journal/programs/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program_slug: BASELINE_SLUG,
          selected_start_date: selectedStartDate,
          timezone,
          current_capacity: capacity,
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Could not start Baseline.');
      }
      await onStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Baseline.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-white/12 bg-black/25 p-4">
      <p className="text-sm font-semibold text-white">Choose Start Date</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {[
          { id: 'today' as const, label: 'Start now', value: today },
          { id: 'monday' as const, label: 'Coming Monday', value: monday },
          { id: 'custom' as const, label: 'Custom date', value: customDate },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setStartChoice(option.id)}
            className={`rounded-2xl border px-3 py-2 text-left transition ${
              startChoice === option.id
                ? 'border-brand-50 bg-brand-50 text-brand-900'
                : 'border-white/12 bg-white/[0.06] text-white hover:bg-white/[0.1]'
            }`}
          >
            <span className="block text-xs font-semibold">{option.label}</span>
            <span className="mt-0.5 block text-[11px] opacity-75">
              {formatDateLabel(option.value)}
            </span>
          </button>
        ))}
      </div>

      {startChoice === 'custom' && (
        <label className="mt-3 block text-xs text-white/70">
          Custom start date
          <input
            type="date"
            value={customDate}
            min={today}
            onChange={(event) => setCustomDate(event.target.value)}
            className="mt-1 w-full rounded-xl border border-white/12 bg-white/[0.08] px-3 py-2 text-sm text-white outline-none focus:border-brand-50"
          />
        </label>
      )}

      <div className="mt-4">
        <p className="text-sm font-semibold text-white">Current Capacity</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {[
            { id: 'low' as const, label: 'Low' },
            { id: 'steady' as const, label: 'Steady' },
            { id: 'high' as const, label: 'High' },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setCapacity(option.id)}
              className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                capacity === option.id
                  ? 'border-brand-50 bg-brand-50 text-brand-900'
                  : 'border-white/12 bg-white/[0.06] text-white/78 hover:bg-white/[0.1]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[11px] text-white/45">
        Timezone: {timezone}
      </p>
      {error && (
        <p className="mt-3 rounded-xl border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={saving || !selectedStartDate}
        onClick={submitEnrollment}
        className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-65"
      >
        {saving ? 'Starting Baseline...' : 'Start Baseline'}
      </button>
    </div>
  );
}

function BaselineRuntimeControls({
  hasAccess,
  runtimeSummary,
  runtimeLoading,
  onEnrollmentCreated,
}: {
  hasAccess: boolean;
  runtimeSummary: ProgramRuntimeSummary | null;
  runtimeLoading: boolean;
  onEnrollmentCreated: () => Promise<void>;
}) {
  if (runtimeLoading) {
    return (
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4 animate-pulse">
        <div className="h-3 w-28 rounded bg-white/[0.08]" />
        <div className="mt-2 h-4 w-44 rounded bg-white/[0.1]" />
      </div>
    );
  }

  const state = resolveBaselineCardRuntimeState({
    hasAccess,
    summary: runtimeSummary,
  });
  const selectedStart = formatDateLabel(
    runtimeSummary?.enrollment.selected_start_date,
  );

  if (state === 'locked') {
    return (
      <div className="mt-4">
        <RuntimeStatusPill tone="locked">Locked</RuntimeStatusPill>
        <p className="mt-2 text-sm leading-snug text-white/72">
          Baseline is ready for members with program access. Browse program
          options to unlock this guided start.
        </p>
        <a
          href="/programs"
          className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-brand-50/90 px-4 py-2.5 text-sm font-semibold text-brand-900"
        >
          View Program Options
        </a>
      </div>
    );
  }

  if (state === 'start_ready') {
    return (
      <>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <RuntimeStatusPill tone="ready">Program access active</RuntimeStatusPill>
          <RuntimeStatusPill>No runtime enrollment yet</RuntimeStatusPill>
        </div>
        <p className="mt-2 text-sm leading-snug text-white/72">
          Choose when Baseline should begin and how much capacity you have right
          now.
        </p>
        <BaselineStartFlow onStarted={onEnrollmentCreated} />
      </>
    );
  }

  if (state === 'pre_start') {
    return (
      <div className="mt-4">
        <RuntimeStatusPill tone="ready">Starts {selectedStart}</RuntimeStatusPill>
        <p className="mt-2 text-sm leading-snug text-white/74">
          Your Baseline enrollment is scheduled. Use the time before day 1 to
          get familiar with the path.
        </p>
        <a
          href="/app/programs/baseline"
          className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-900"
        >
          Prepare for Baseline
        </a>
      </div>
    );
  }

  if (state === 'active') {
    return (
      <div className="mt-4">
        <RuntimeStatusPill tone="active">
          Day {Math.max(1, runtimeSummary?.current_day ?? 1)}
        </RuntimeStatusPill>
        <p className="mt-2 text-sm leading-snug text-white/74">
          Baseline is active and tracking your current program day.
        </p>
        <a
          href="/app/programs/baseline"
          className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-900"
        >
          Continue Baseline
        </a>
      </div>
    );
  }

  if (state === 'paused') {
    return (
      <div className="mt-4">
        <RuntimeStatusPill tone="paused">Paused</RuntimeStatusPill>
        <p className="mt-2 text-sm leading-snug text-white/74">
          Baseline is paused for now. Your program day will resume when the
          pause ends.
        </p>
      </div>
    );
  }

  if (state === 'completed') {
    return (
      <div className="mt-4">
        <RuntimeStatusPill tone="complete">Completed</RuntimeStatusPill>
        <p className="mt-2 text-sm leading-snug text-white/74">
          Baseline is complete. Your next program step will appear here when the
          recommendation layer is ready.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <RuntimeStatusPill tone="locked">Enrollment closed</RuntimeStatusPill>
      <p className="mt-2 text-sm leading-snug text-white/70">
        This Baseline enrollment is no longer active.
      </p>
    </div>
  );
}

function ProgramCard({
  program,
  runtimeSummary,
  hasAccess,
  runtimeLoading,
  onEnrollmentCreated,
}: {
  program: AppProgramDefinition;
  runtimeSummary?: ProgramRuntimeSummary | null;
  hasAccess?: boolean;
  runtimeLoading?: boolean;
  onEnrollmentCreated: () => Promise<void>;
}) {
  const isBaseline = program.slug === BASELINE_SLUG;

  return (
    <article className="relative isolate min-h-[175px] overflow-hidden rounded-[1.35rem] bg-brand-800 shadow-large sm:min-h-[190px]">
      <Image
        src={program.imageUrl}
        alt=""
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, 760px"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/82 via-black/58 to-black/22" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/15" />

      <div className="relative z-10 flex min-h-[175px] flex-col justify-end px-5 pb-4 pt-16 sm:min-h-[190px] sm:px-6">
        <div className="max-w-2xl">
          <h3 className="text-2xl font-semibold leading-tight text-white antialiased sm:text-3xl">
            {program.name}
          </h3>
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-brand-50/92 px-2 py-0.5 text-[10px] font-semibold text-brand-900">
            <svg
              aria-hidden
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6l4 2m5-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
            <span>{program.lengthLabel}</span>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-snug text-white/86 antialiased">
            {program.objective}
          </p>
        </div>

        {isBaseline ? (
          <BaselineRuntimeControls
            hasAccess={Boolean(hasAccess)}
            runtimeSummary={runtimeSummary ?? null}
            runtimeLoading={Boolean(runtimeLoading)}
            onEnrollmentCreated={onEnrollmentCreated}
          />
        ) : (
          <div className="mt-3">
            <button
              type="button"
              disabled={program.cta.disabled}
              aria-label={`${program.cta.label} for ${program.name} is coming soon`}
              className="inline-flex w-full items-center justify-center rounded-full bg-brand-50/90 px-4 py-2.5 text-sm font-semibold text-brand-900 disabled:cursor-not-allowed disabled:opacity-85"
            >
              {program.cta.label === 'Available Soon' && (
                <svg
                  aria-hidden
                  className="mr-1.5 h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 10.5V7.5a4.5 4.5 0 0 0-9 0v3m-.75 0h10.5A1.5 1.5 0 0 1 18.75 12v7.5A1.5 1.5 0 0 1 17.25 21H6.75a1.5 1.5 0 0 1-1.5-1.5V12a1.5 1.5 0 0 1 1.5-1.5Z"
                  />
                </svg>
              )}
              {program.cta.label}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function CategorySection({
  category,
  featured = false,
  runtimeBySlug,
  accessBySlug,
  runtimeLoading,
  onEnrollmentCreated,
}: {
  category: AppProgramSupportCategoryDefinition;
  featured?: boolean;
  runtimeBySlug: Map<string, ProgramRuntimeSummary>;
  accessBySlug: Map<string, boolean>;
  runtimeLoading: boolean;
  onEnrollmentCreated: () => Promise<void>;
}) {
  const programs = category.series.flatMap((series) => series.programs);

  return (
    <section className="w-full max-w-[1000px] mx-auto rounded-[1.7rem] bg-[#17100c]/95 px-4 py-5 shadow-large sm:px-8 sm:py-7">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold leading-tight text-white antialiased sm:text-base">
            {category.headline}
          </h2>
          <p className="sr-only">
            {category.description}
          </p>
        </div>
        <CategoryAction category={category} />
      </div>

      <div className={featured ? 'space-y-0' : 'space-y-0'}>
        {programs.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-white/75">
              No programs are available in this category yet.
            </p>
          </div>
        ) : (
          programs.map((program) => (
            <ProgramCard
              key={program.id}
              program={program}
              runtimeSummary={runtimeBySlug.get(program.slug) ?? null}
              hasAccess={accessBySlug.get(program.slug) ?? false}
              runtimeLoading={runtimeLoading}
              onEnrollmentCreated={onEnrollmentCreated}
            />
          ))
        )}
      </div>
    </section>
  );
}

export default function JournalProgramsLibraryPage() {
  const [runtimeData, setRuntimeData] =
    useState<ProgramRuntimeSummaryList | null>(null);
  const [libraryData, setLibraryData] = useState<ProgramLibrary | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(true);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const loadProgramRuntime = useCallback(async () => {
    setRuntimeLoading(true);
    setRuntimeError(null);
    try {
      const [runtimeResp, libraryResp] = await Promise.all([
        fetch('/api/journal/programs/runtime-summary'),
        fetch('/api/journal/programs/library'),
      ]);

      if (!runtimeResp.ok) {
        const body = await runtimeResp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to load runtime summary.');
      }
      if (!libraryResp.ok) {
        const body = await libraryResp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to load program access.');
      }

      const [runtimeBody, libraryBody] = await Promise.all([
        runtimeResp.json() as Promise<ProgramRuntimeSummaryList>,
        libraryResp.json() as Promise<ProgramLibrary>,
      ]);
      setRuntimeData(runtimeBody);
      setLibraryData(libraryBody);
    } catch (err) {
      setRuntimeError(
        err instanceof Error ? err.message : 'Failed to load programs.',
      );
    } finally {
      setRuntimeLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProgramRuntime();
  }, [loadProgramRuntime]);

  const nutritionCategory = PROGRAMS_MVP_CATEGORIES.find(
    (category) => category.key === 'nutrition',
  );
  const remainingCategories = PROGRAMS_MVP_CATEGORIES.filter(
    (category) => category.key !== 'nutrition',
  );
  const runtimeBySlug = useMemo(() => {
    const map = new Map<string, ProgramRuntimeSummary>();
    for (const summary of runtimeData?.summaries ?? []) {
      map.set(summary.program.slug, summary);
    }
    return map;
  }, [runtimeData]);
  const accessBySlug = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const entry of libraryData?.entries ?? []) {
      map.set(
        entry.slug,
        entry.has_entitlement || entry.access_state === 'assigned_only',
      );
    }
    for (const summary of runtimeData?.summaries ?? []) {
      map.set(summary.program.slug, true);
    }
    return map;
  }, [libraryData, runtimeData]);
  const hasAnyPrograms = PROGRAMS_MVP_CATEGORIES.some((category) =>
    category.series.some((series) => series.programs.length > 0),
  );

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-[calc(8rem+env(safe-area-inset-bottom,0px))]">
        <section className="relative isolate mb-0 min-h-[330px] overflow-hidden bg-brand-900 sm:min-h-[360px]">
          <Image
            src={PROGRAMS_MVP_HERO_IMAGE_URL}
            alt=""
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-black/42" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/20 to-brand-900/92" />

          <div className="relative z-10 flex min-h-[330px] w-full max-w-[1000px] flex-col items-center justify-center mx-auto px-5 pt-14 pb-12 text-center sm:min-h-[360px]">
            <h1 className="max-w-3xl text-4xl font-semibold leading-[0.98] tracking-[-0.03em] text-white antialiased sm:text-6xl">
              Made for less dieting, more transformation.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-snug text-white/70 antialiased">
              Fine Diet programs are designed to tailor dietary and lifestyle
              support to you.
            </p>
          </div>
        </section>

        <div className="-mt-6 space-y-8 px-0 sm:px-0">
          {runtimeError && (
            <div className="mx-auto w-full max-w-[1000px] px-4">
              <div className="rounded-2xl border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100">
                <p className="font-semibold">Programs could not fully load.</p>
                <p className="mt-1 text-red-100/80">{runtimeError}</p>
                <button
                  type="button"
                  onClick={() => void loadProgramRuntime()}
                  className="mt-3 rounded-full border border-red-100/30 px-3 py-1.5 text-xs font-semibold text-red-50"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {!hasAnyPrograms && (
            <div className="mx-auto w-full max-w-[1000px] px-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-white/75">
                No programs are available yet.
              </div>
            </div>
          )}

          {nutritionCategory && (
            <CategorySection
              category={nutritionCategory}
              featured
              runtimeBySlug={runtimeBySlug}
              accessBySlug={accessBySlug}
              runtimeLoading={runtimeLoading}
              onEnrollmentCreated={loadProgramRuntime}
            />
          )}

          {remainingCategories.map((category) => (
            <CategorySection
              key={category.key}
              category={category}
              runtimeBySlug={runtimeBySlug}
              accessBySlug={accessBySlug}
              runtimeLoading={runtimeLoading}
              onEnrollmentCreated={loadProgramRuntime}
            />
          ))}
        </div>
      </div>

      <JournalFooterNav />
    </div>
  );
}
