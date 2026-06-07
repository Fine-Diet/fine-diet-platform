'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StackedPageHero, StackedPageSection } from '@/components/layout/StackedPageSection';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import {
  PROGRAMS_MVP_CATEGORIES,
  PROGRAMS_MVP_HERO_IMAGE_URL,
  type AppProgramDefinition,
  type AppProgramSeriesDefinition,
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
const PROGRAMS_PAGE_MAX_WIDTH = 'max-w-[1000px]';

const PROGRAM_CTA_ACTIVE_CLASS =
  'bg-[#B8C6D1] text-[#1A1612] hover:bg-[#c5d0da]';
const PROGRAM_CTA_LOCKED_CLASS =
  'bg-[#6E757C] text-[#1A1612] cursor-not-allowed';

type StartDateChoice = 'today' | 'monday' | 'custom';

function formatProgramLengthLabel(lengthLabel: string): string {
  if (lengthLabel === '-- days') return '-- Day Program';
  const match = lengthLabel.match(/^(\d+)\s*days?$/i);
  if (match) return `${match[1]}-Day Program`;
  return lengthLabel;
}

function LockIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
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
  );
}

function ProgramCtaButton({
  children,
  disabled = false,
  locked = false,
  href,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  locked?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const className = `mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-3 text-sm font-semibold transition ${
    locked || disabled ? PROGRAM_CTA_LOCKED_CLASS : PROGRAM_CTA_ACTIVE_CLASS
  } ${disabled ? 'opacity-95' : ''}`;

  if (href && !disabled) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={className}
    >
      {children}
    </button>
  );
}

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
        className={`mt-4 inline-flex w-full items-center justify-center rounded-full px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-65 ${PROGRAM_CTA_ACTIVE_CLASS}`}
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
  const [showStartFlow, setShowStartFlow] = useState(false);

  if (runtimeLoading) {
    return (
      <div className="mt-4 rounded-[1.35rem] bg-black/25 p-4 animate-pulse">
        <div className="h-10 w-full rounded-full bg-white/[0.08]" />
      </div>
    );
  }

  const state = resolveBaselineCardRuntimeState({
    hasAccess,
    summary: runtimeSummary,
  });

  if (state === 'locked') {
    return (
      <ProgramCtaButton href="/programs">
        Get Started
      </ProgramCtaButton>
    );
  }

  if (state === 'start_ready') {
    return (
      <>
        {!showStartFlow ? (
          <ProgramCtaButton onClick={() => setShowStartFlow(true)}>
            Get Started
          </ProgramCtaButton>
        ) : (
          <BaselineStartFlow
            onStarted={async () => {
              await onEnrollmentCreated();
              setShowStartFlow(false);
            }}
          />
        )}
      </>
    );
  }

  if (state === 'pre_start') {
    return (
      <ProgramCtaButton href="/app/programs/baseline">
        Prepare for Baseline
      </ProgramCtaButton>
    );
  }

  if (state === 'active') {
    return (
      <ProgramCtaButton href="/app/programs/baseline">
        Continue Baseline
      </ProgramCtaButton>
    );
  }

  if (state === 'paused') {
    return (
      <ProgramCtaButton locked disabled>
        Paused
      </ProgramCtaButton>
    );
  }

  if (state === 'completed') {
    return (
      <ProgramCtaButton locked disabled>
        Completed
      </ProgramCtaButton>
    );
  }

  return (
    <ProgramCtaButton locked disabled>
      Enrollment closed
    </ProgramCtaButton>
  );
}

function ProgramCard({
  program,
  runtimeSummary,
  hasAccess,
  runtimeLoading,
  onEnrollmentCreated,
  dividerTop = false,
}: {
  program: AppProgramDefinition;
  runtimeSummary?: ProgramRuntimeSummary | null;
  hasAccess?: boolean;
  runtimeLoading?: boolean;
  onEnrollmentCreated: () => Promise<void>;
  dividerTop?: boolean;
}) {
  const isBaseline = program.slug === BASELINE_SLUG;
  const isLockedCta = program.cta.disabled || program.cta.label === 'Available Soon';

  return (
    <article
      className={`relative isolate min-h-[220px] overflow-hidden bg-[#1A1612] sm:min-h-[240px] ${
        dividerTop ? 'border-t border-white/10' : ''
      }`}
    >
      <Image
        src={program.imageUrl}
        alt=""
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, 750px"
      />
      {/* Top + bottom scrims so the copy stays legible over the image while the
          photo still reads through the middle (matches the Plans page modules). */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/30 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />

      <div className="relative z-10 flex min-h-[220px] flex-col justify-end px-5 pb-5 pt-24 sm:min-h-[240px] sm:px-6 sm:pb-6">
        <div>
          <h3 className="text-[1.65rem] font-semibold leading-tight text-white antialiased sm:text-[1.85rem]">
            {program.name}
          </h3>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white/92 backdrop-blur-sm">
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
            <span>{formatProgramLengthLabel(program.lengthLabel)}</span>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-snug text-white/88 antialiased">
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
        ) : isLockedCta ? (
          <ProgramCtaButton locked disabled>
            <LockIcon />
            {program.cta.label}
          </ProgramCtaButton>
        ) : (
          <ProgramCtaButton>{program.cta.label}</ProgramCtaButton>
        )}
      </div>
    </article>
  );
}

function ProgramSeriesGroup({
  series,
  showSeriesLabel,
  runtimeBySlug,
  accessBySlug,
  runtimeLoading,
  onEnrollmentCreated,
}: {
  series: AppProgramSeriesDefinition;
  showSeriesLabel: boolean;
  runtimeBySlug: Map<string, ProgramRuntimeSummary>;
  accessBySlug: Map<string, boolean>;
  runtimeLoading: boolean;
  onEnrollmentCreated: () => Promise<void>;
}) {
  if (series.programs.length === 0) return null;

  return (
    <div className="space-y-3">
      {showSeriesLabel && (
        <h3 className="px-1 text-sm font-medium text-white/72 antialiased">
          {series.name}
        </h3>
      )}

      <div className="overflow-hidden rounded-[2rem] bg-[#17100c] shadow-large">
        {series.programs.map((program, index) => (
          <ProgramCard
            key={program.id}
            program={program}
            runtimeSummary={runtimeBySlug.get(program.slug) ?? null}
            hasAccess={accessBySlug.get(program.slug) ?? false}
            runtimeLoading={runtimeLoading}
            onEnrollmentCreated={onEnrollmentCreated}
            dividerTop={index > 0}
          />
        ))}
      </div>
    </div>
  );
}

function CategorySection({
  category,
  runtimeBySlug,
  accessBySlug,
  runtimeLoading,
  onEnrollmentCreated,
}: {
  category: AppProgramSupportCategoryDefinition;
  runtimeBySlug: Map<string, ProgramRuntimeSummary>;
  accessBySlug: Map<string, boolean>;
  runtimeLoading: boolean;
  onEnrollmentCreated: () => Promise<void>;
}) {
  const visibleSeries = category.series.filter((series) => series.programs.length > 0);
  const multipleVisibleSeries = visibleSeries.length > 1;

  return (
    <div className={`mx-auto w-full ${PROGRAMS_PAGE_MAX_WIDTH}`}>
      <div className="mb-4 flex items-center justify-between gap-4 px-1">
        <h2 className="text-base font-semibold leading-tight text-white antialiased">
          {category.headline}
        </h2>
        <CategoryAction category={category} />
      </div>
      <p className="sr-only">{category.description}</p>

      {visibleSeries.length === 0 ? (
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#17100c] p-5 shadow-large">
          <p className="text-sm text-white/75">
            No programs are available in this category yet.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {visibleSeries.map((series) => (
            <ProgramSeriesGroup
              key={series.id}
              series={series}
              showSeriesLabel={multipleVisibleSeries || series.visibleOnProgramsPage}
              runtimeBySlug={runtimeBySlug}
              accessBySlug={accessBySlug}
              runtimeLoading={runtimeLoading}
              onEnrollmentCreated={onEnrollmentCreated}
            />
          ))}
        </div>
      )}
    </div>
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
    <div className="min-h-screen bg-[#16110d] text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-[calc(8rem+env(safe-area-inset-bottom,0px))]">
        <StackedPageHero className="relative isolate min-h-[300px] overflow-hidden sm:min-h-[340px]">
          <Image
            src={PROGRAMS_MVP_HERO_IMAGE_URL}
            alt=""
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-black/45" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-[#16110d]" />

          <div className={`relative z-10 mx-auto flex min-h-[300px] w-full ${PROGRAMS_PAGE_MAX_WIDTH} flex-col items-center justify-center px-6 pb-16 pt-14 text-center sm:min-h-[340px] sm:pb-20 sm:pt-16`}>
            <h1 className="max-w-[900px] text-5xl font-semibold leading-[1.02] tracking-[-0.03em] text-white antialiased sm:text-7xl">
              Made for less dieting, more transformation.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-snug text-white/78 antialiased sm:text-[0.95rem]">
              The Fine Diet Method&trade; is designed tailor fit dietary and
              lifestyle programs to you.
            </p>
          </div>
        </StackedPageHero>

        {runtimeError && (
          <StackedPageSection layer={1} className="bg-[#16110d] pb-6" contentClassName="max-w-none">
            <div className={`mx-auto w-full ${PROGRAMS_PAGE_MAX_WIDTH}`}>
              <div className="rounded-[1.75rem] border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100">
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
          </StackedPageSection>
        )}

        {!hasAnyPrograms && (
          <StackedPageSection layer={1} className="bg-[#16110d] pb-6" contentClassName="max-w-none">
            <div className={`mx-auto w-full ${PROGRAMS_PAGE_MAX_WIDTH} overflow-hidden rounded-[2rem] border border-white/10 bg-[#17100c] p-5 text-sm text-white/75 shadow-large`}>
              No programs are available yet.
            </div>
          </StackedPageSection>
        )}

        {PROGRAMS_MVP_CATEGORIES.map((category, index) => (
          <StackedPageSection
            key={category.key}
            layer={index + 1}
            className={index === PROGRAMS_MVP_CATEGORIES.length - 1 ? 'bg-[#16110d] pb-10' : 'bg-[#16110d]'}
            contentClassName="max-w-none"
          >
            <CategorySection
              category={category}
              runtimeBySlug={runtimeBySlug}
              accessBySlug={accessBySlug}
              runtimeLoading={runtimeLoading}
              onEnrollmentCreated={loadProgramRuntime}
            />
          </StackedPageSection>
        ))}
      </div>

      <JournalFooterNav />
    </div>
  );
}
