'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Lock, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { ProgramCheckinPanel } from '@/components/journal/programs/ProgramCheckinPanel';
import { ProgramDeliveryModules } from '@/components/journal/programs/ProgramDeliveryModules';
import {
  StackedPageHero,
  StackedPageSection,
} from '@/components/layout/StackedPageSection';
import { PROGRAMS_MVP_CATEGORIES } from '@/lib/programs/appProgramsMvp';
import type { ProgramDeliveryModuleDefinition } from '@/lib/programs/deliveryModuleTypes';
import type { ProgramLibraryDetail } from '@/lib/programs/programLibraryServerService';
import {
  buildProgramDayRail,
  buildProgramEnrollmentRequest,
  getProgramRoadmapItems,
  localDateKey,
  resolveInitialProgramDay,
  resolveProgramDuration,
} from '@/lib/programs/programDeliveryNavigation';
import type {
  ProgramProgressStatus,
  ProgramProgressSummary,
} from '@/lib/programs/progressTypes';
import type {
  ProgramLifecycleAction,
  ProgramRuntimeSummary,
} from '@/lib/programs/runtimeTypes';
import {
  isCheckinDue,
  isDay21Handled,
  shouldShowRecommendationReveal,
} from '@/lib/programs/runtimeUi';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

type DeliveryView = 'day' | 'schedule';

interface ProgramDeliveryExperienceProps {
  data: ProgramLibraryDetail;
  runtimeSummary: ProgramRuntimeSummary | null;
  progressSummary: ProgramProgressSummary | null;
  deliveryModules: ProgramDeliveryModuleDefinition[];
  runtimeError?: string | null;
  previewMode?: boolean;
  initialStartGateOpen?: boolean;
  initialView?: DeliveryView;
  onRuntimeSummaryUpdate: (summary: ProgramRuntimeSummary) => void;
  onSetItemStatus?: (
    itemId: string,
    status: ProgramProgressStatus,
  ) => Promise<void>;
}

function programImage(slug: string): string | null {
  for (const category of PROGRAMS_MVP_CATEGORIES) {
    for (const series of category.series) {
      const program = series.programs.find((item) => item.slug === slug);
      if (program?.imageUrl) return program.imageUrl;
    }
  }
  return null;
}

function formatDate(dateKey: string | null | undefined): string | null {
  if (!dateKey) return null;
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function firstMedia(data: ProgramLibraryDetail) {
  for (const module of data.managed_content?.modules ?? []) {
    for (const item of module.items) {
      if (item.video_url) return item;
    }
  }
  return null;
}

function StartGate({
  programSlug,
  programTitle,
  open,
  previewMode,
  onClose,
  onStarted,
}: {
  programSlug: string;
  programTitle: string;
  open: boolean;
  previewMode: boolean;
  onClose: () => void;
  onStarted: (summary: ProgramRuntimeSummary) => void;
}) {
  const today = useMemo(() => localDateKey(), []);
  const [showDate, setShowDate] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function enroll(dateKey: string) {
    if (previewMode) {
      setError('Preview mode never creates an enrollment.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const response = await fetch('/api/journal/programs/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildProgramEnrollmentRequest({
            programSlug,
            selectedStartDate: dateKey,
            timezone,
          }),
        ),
      });
      const body = (await response.json().catch(() => ({}))) as
        | ProgramRuntimeSummary
        | { error?: string };
      if (!response.ok) {
        throw new Error(
          (body as { error?: string }).error ?? 'Could not start this program.',
        );
      }
      onStarted(body as ProgramRuntimeSummary);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not start this program.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center px-5 py-20">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="program-start-title"
        className="pointer-events-auto relative w-full max-w-md rounded-[2rem] border border-white/15 bg-[#f3f3ea] p-6 text-[#17100c] shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss Get Started"
          className="absolute right-4 top-4 rounded-full p-2 text-black/55 hover:bg-black/5"
        >
          <X className="h-5 w-5" />
        </button>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">
          {programTitle}
        </p>
        <h2 id="program-start-title" className="mt-2 pr-8 text-3xl font-semibold leading-tight">
          Get Started
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-black/65">
          Choose when your Program calendar begins. Opening or dismissing this
          window does not start your Program.
        </p>

        {showDate && (
          <label className="mt-5 block text-sm font-semibold">
            Start date
            <input
              type="date"
              min={today}
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-black/15 bg-white px-3 font-normal"
            />
          </label>
        )}
        {error && <p className="mt-3 text-xs text-red-700">{error}</p>}

        <div className="mt-6 space-y-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void enroll(showDate ? selectedDate : today)}
            className="h-11 w-full rounded-full bg-[#17100c] px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving
              ? 'Starting…'
              : showDate
                ? `Start on ${formatDate(selectedDate)}`
                : 'Start today'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => setShowDate((current) => !current)}
            className="h-11 w-full rounded-full border border-black/20 px-5 text-sm font-semibold"
          >
            {showDate ? 'Choose today instead' : 'Start another day'}
          </button>
          <Link
            href={APP_ROUTES.programs}
            className="flex h-11 w-full items-center justify-center text-sm font-semibold text-black/55 hover:text-black"
          >
            Back to Programs
          </Link>
        </div>
      </section>
    </div>
  );
}

function LifecycleMenu({
  runtimeSummary,
  previewMode,
  onUpdated,
}: {
  runtimeSummary: ProgramRuntimeSummary;
  previewMode: boolean;
  onUpdated: (summary: ProgramRuntimeSummary) => void;
}) {
  const [pending, setPending] = useState<ProgramLifecycleAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actions: Partial<Record<ProgramRuntimeSummary['resolved_status'], ProgramLifecycleAction[]>> = {
    pre_start: ['cancel'],
    active: ['pause', 'complete', 'cancel'],
    paused: ['resume', 'cancel'],
  };
  const available = actions[runtimeSummary.resolved_status] ?? [];
  if (available.length === 0) return null;

  async function run(action: ProgramLifecycleAction) {
    if (previewMode) {
      setError('Preview mode does not change lifecycle state.');
      return;
    }
    setPending(action);
    setError(null);
    try {
      const response = await fetch(
        `/api/journal/programs/enrollments/${encodeURIComponent(
          runtimeSummary.enrollment.id,
        )}/lifecycle`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as
        | ProgramRuntimeSummary
        | { error?: string };
      if (!response.ok) {
        throw new Error((body as { error?: string }).error ?? 'Action failed.');
      }
      onUpdated(body as ProgramRuntimeSummary);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Action failed.');
    } finally {
      setPending(null);
    }
  }

  return (
    <details className="mt-8 border-t border-white/10 pt-4 text-xs text-white/55">
      <summary className="cursor-pointer font-semibold text-white/65">
        Program settings
      </summary>
      <div className="mt-3 flex flex-wrap gap-2">
        {available.map((action) => (
          <button
            key={action}
            type="button"
            disabled={pending !== null}
            onClick={() => void run(action)}
            className="rounded-full border border-white/15 px-3 py-1.5 capitalize"
          >
            {pending === action ? 'Working…' : action}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-amber-200">{error}</p>}
    </details>
  );
}

function Schedule({
  modules,
  currentDay,
}: {
  modules: ProgramDeliveryModuleDefinition[];
  currentDay: number;
}) {
  const roadmap = getProgramRoadmapItems(modules);
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
        Program roadmap
      </p>
      <h2 className="mt-2 text-3xl font-semibold">Your path through the Program</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/62">
        Schedule shows the Program sequence. Your runtime calendar remains
        authoritative and cannot be edited here.
      </p>
      <ol className="mt-6 space-y-3">
        {roadmap.map((item) => {
          const isCurrent =
            item.dayStart != null &&
            item.dayEnd != null &&
            currentDay >= item.dayStart &&
            currentDay <= item.dayEnd;
          const isPast = item.dayEnd != null && item.dayEnd < currentDay;
          return (
            <li
              key={item.key}
              className={`rounded-2xl border p-4 ${
                isCurrent
                  ? 'border-[#d7ecff]/50 bg-[#d7ecff]/10'
                  : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">{item.label}</p>
                  <p className="mt-1 text-sm text-white/58">{item.description}</p>
                </div>
                <span className="shrink-0 text-xs text-white/45">
                  {isCurrent ? 'Current' : isPast ? 'Review' : item.range}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ProgramResources({
  data,
  progressSummary,
  onSetItemStatus,
}: {
  data: ProgramLibraryDetail;
  progressSummary: ProgramProgressSummary | null;
  onSetItemStatus?: (
    itemId: string,
    status: ProgramProgressStatus,
  ) => Promise<void>;
}) {
  const modules = data.managed_content?.modules ?? [];
  if (modules.length === 0) return null;
  const statuses = new Map<string, ProgramProgressStatus>();
  for (const module of progressSummary?.modules ?? []) {
    for (const item of module.item_states) {
      statuses.set(item.content_item_id, item.status);
    }
  }

  return (
    <details className="mt-5 border-t border-white/10 pt-4">
      <summary className="cursor-pointer text-xs font-semibold text-white/65">
        Program resources and progress
      </summary>
      <div className="mt-4 space-y-4">
        {modules.map((module) => (
          <section key={module.id} className="rounded-2xl border border-white/10 p-4">
            <h3 className="font-semibold">{module.title}</h3>
            {module.description && (
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                {module.description}
              </p>
            )}
            <ul className="mt-3 space-y-3">
              {module.items.map((item) => {
                const status = statuses.get(item.id) ?? 'not_started';
                return (
                  <li key={item.id} id={`item-${item.id}`} className="border-t border-white/10 pt-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{item.title}</p>
                        {item.summary && (
                          <p className="mt-1 text-xs text-white/55">{item.summary}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-[10px] uppercase tracking-wider text-white/40">
                        {status.replace('_', ' ')}
                      </span>
                    </div>
                    {item.body && (
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-white/65">
                        {item.body}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-3 text-xs">
                      {item.video_url && (
                        <a
                          href={item.video_url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          Open media
                        </a>
                      )}
                      {onSetItemStatus && (
                        <button
                          type="button"
                          onClick={() =>
                            void onSetItemStatus(
                              item.id,
                              status === 'not_started'
                                ? 'in_progress'
                                : status === 'in_progress'
                                  ? 'completed'
                                  : 'in_progress',
                            )
                          }
                          className="underline underline-offset-2"
                        >
                          {status === 'not_started'
                            ? 'Start'
                            : status === 'in_progress'
                              ? 'Mark complete'
                              : 'Reopen'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}

export function ProgramDeliveryExperience({
  data,
  runtimeSummary,
  progressSummary,
  deliveryModules,
  runtimeError = null,
  previewMode = false,
  initialStartGateOpen = true,
  initialView = 'day',
  onRuntimeSummaryUpdate,
  onSetItemStatus,
}: ProgramDeliveryExperienceProps) {
  const hasAccess = data.has_entitlement || data.access_state === 'assigned_only';
  const needsEnrollment = hasAccess && !runtimeSummary && !runtimeError;
  const [startGateOpen, setStartGateOpen] = useState(
    needsEnrollment && initialStartGateOpen,
  );
  const [view, setView] = useState<DeliveryView>(initialView);
  const [selectedDay, setSelectedDay] = useState(() =>
    resolveInitialProgramDay(runtimeSummary),
  );
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);

  useEffect(() => {
    setSelectedDay(resolveInitialProgramDay(runtimeSummary));
  }, [runtimeSummary?.enrollment.id, runtimeSummary?.current_day]);

  const duration = resolveProgramDuration(runtimeSummary, deliveryModules);
  const rail = buildProgramDayRail({
    durationDays: duration,
    runtimeStatus: runtimeSummary?.resolved_status ?? 'not_started',
    currentDay: runtimeSummary?.current_day ?? 0,
  });
  const displaySummary =
    runtimeSummary && selectedDay > 0
      ? { ...runtimeSummary, current_day: selectedDay }
      : runtimeSummary;
  const prepModules = deliveryModules
    .filter((module) => module.moduleType === 'prep')
    .map((module) =>
      runtimeSummary
        ? module
        : {
            ...module,
            statusVisibility: Array.from(
              new Set([...module.statusVisibility, 'not_started' as const]),
            ),
          },
    );
  const activeModules = deliveryModules.filter(
    (module) => module.moduleType !== 'prep' && module.moduleType !== 'roadmap',
  );
  const showDayZero = selectedDay === 0;
  const imageUrl = programImage(data.slug);
  const media = firstMedia(data);
  const checkinDue =
    selectedDay === runtimeSummary?.current_day && isCheckinDue(runtimeSummary);
  const headline = showDayZero
    ? `Let’s get you set up for ${data.title}`
    : `Day ${selectedDay} in ${data.title}`;
  const statusLine = !runtimeSummary
    ? 'Day 0 · Setup'
    : runtimeSummary.resolved_status === 'pre_start'
      ? `Day 0 · Starts ${formatDate(runtimeSummary.enrollment.selected_start_date)}`
      : `Day ${selectedDay} of ${duration}`;

  return (
    <div className="min-h-screen bg-[#0d1d0f] text-white">
      <div className="pb-[calc(8rem+env(safe-area-inset-bottom,0px))]">
        <StackedPageHero className="min-h-[520px] overflow-hidden bg-[#07170f] sm:min-h-[460px]">
          {imageUrl && (
            <Image
              src={imageUrl}
              alt=""
              fill
              priority
              className="object-cover"
              sizes="100vw"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/25" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#07170f]/75 via-transparent to-black/20" />
          <div className="relative mx-auto flex min-h-[520px] w-full max-w-[1000px] flex-col justify-end px-6 pb-20 pt-20 sm:min-h-[460px] sm:px-5">
            <Link href={APP_ROUTES.programs} className="mb-auto text-xs text-white/70 hover:text-white">
              ← Programs
            </Link>
            <p className="text-lg font-semibold">{data.title}</p>
            <p className="mt-1 text-xs text-white/62">{statusLine}</p>
            <h1 className="mt-3 max-w-3xl text-[2.6rem] font-normal leading-[0.98] tracking-[-0.03em] sm:text-5xl">
              {headline}
            </h1>
            <div className="mt-7 max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/65">
                Orientation
              </p>
              {media ? (
                <a
                  href={media.video_url!}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 flex items-center gap-3 rounded-2xl border border-white/25 bg-black/25 p-3 backdrop-blur-sm hover:bg-black/35"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black">▶</span>
                  <span>
                    <span className="block text-sm font-semibold">{media.title}</span>
                    <span className="text-xs text-white/60">Open Program media</span>
                  </span>
                </a>
              ) : (
                <div className="mt-2 rounded-2xl border border-white/20 bg-black/20 p-3 text-sm text-white/65 backdrop-blur-sm">
                  Guided media will appear here when it is available.
                </div>
              )}
            </div>
          </div>
        </StackedPageHero>

        <StackedPageSection
          layer={1}
          className="bg-[#102312] pb-14"
          contentClassName="max-w-[1000px]"
        >
          {runtimeSummary && (
            <>
              <div className="-mx-1 overflow-x-auto pb-2">
                <div className="flex min-w-max gap-2 px-1" aria-label="Program days">
                  {rail.map((item) => (
                    <button
                      key={item.day}
                      type="button"
                      aria-current={selectedDay === item.day ? 'page' : undefined}
                      onClick={() => {
                        if (!item.accessible) {
                          setLockedMessage(
                            runtimeSummary.resolved_status === 'pre_start'
                              ? `Day ${item.day} unlocks when your Program starts.`
                              : `Day ${item.day} unlocks on its Program date.`,
                          );
                          return;
                        }
                        setLockedMessage(null);
                        setView('day');
                        setSelectedDay(item.day);
                      }}
                      className={`flex h-10 min-w-10 items-center justify-center gap-1 rounded-full border px-3 text-xs font-semibold ${
                        selectedDay === item.day
                          ? 'border-[#d7ecff] bg-[#d7ecff] text-[#17100c]'
                          : item.accessible
                            ? 'border-white/20 text-white'
                            : 'border-white/10 text-white/35'
                      }`}
                    >
                      {item.state === 'locked' && <Lock className="h-3 w-3" />}
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              {lockedMessage && (
                <p role="status" className="mt-2 text-xs text-[#d7ecff]/75">
                  {lockedMessage}
                </p>
              )}
              <div className="mt-5 flex gap-6 border-b border-white/10">
                <button
                  type="button"
                  onClick={() => setView('schedule')}
                  className={`pb-3 text-sm ${view === 'schedule' ? 'border-b-2 border-white font-semibold' : 'text-white/50'}`}
                >
                  Schedule
                </button>
                <button
                  type="button"
                  onClick={() => setView('day')}
                  className={`pb-3 text-sm ${view === 'day' ? 'border-b-2 border-white font-semibold' : 'text-white/50'}`}
                >
                  {showDayZero ? 'Setup' : `Day ${selectedDay}`}
                </button>
              </div>
            </>
          )}

          {runtimeError && (
            <p className="rounded-2xl border border-amber-200/20 bg-amber-300/10 p-4 text-sm text-amber-100">
              Runtime details could not be confirmed. Interactive Program
              regions remain unavailable.
            </p>
          )}

          {view === 'schedule' ? (
            <div className="mt-8">
              <Schedule
                modules={deliveryModules}
                currentDay={runtimeSummary?.current_day ?? 0}
              />
            </div>
          ) : showDayZero ? (
            <div className="relative mt-8">
              <div
                className={needsEnrollment ? 'pointer-events-none opacity-75' : undefined}
                aria-disabled={needsEnrollment || undefined}
              >
                <ProgramDeliveryModules
                  runtimeSummary={runtimeSummary}
                  progressSummary={progressSummary}
                  modules={prepModules}
                />
              </div>
              {needsEnrollment && (
                <div className="mt-5 rounded-2xl border border-white/15 bg-black/25 p-4">
                  <div className="flex items-center gap-3">
                    <Lock className="h-5 w-5 text-white/65" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold">Setup actions are locked</p>
                      <p className="mt-1 text-xs text-white/55">
                        Day 0 stays readable. Start the Program to use its
                        enrollment-dependent actions.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStartGateOpen(true)}
                      className="shrink-0 rounded-full bg-[#d7ecff] px-4 py-2 text-xs font-semibold text-black"
                    >
                      Get Started
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-8">
              <ProgramDeliveryModules
                runtimeSummary={displaySummary}
                progressSummary={progressSummary}
                modules={activeModules}
                checkinDue={checkinDue}
                day21Handled={isDay21Handled(displaySummary)}
                anchors={{
                  checkin: 'program-checkin',
                  recommendation: 'program-recommendation',
                }}
              />
              {checkinDue && runtimeSummary && (
                <div id="program-checkin" className="mt-6">
                  <ProgramCheckinPanel
                    runtimeSummary={runtimeSummary}
                    onHandled={onRuntimeSummaryUpdate}
                    previewMode={previewMode}
                  />
                </div>
              )}
              {data.slug === 'baseline' &&
                shouldShowRecommendationReveal(displaySummary) && (
                <div
                  id="program-recommendation"
                  className="mt-6 rounded-3xl border border-[#d7ecff]/25 bg-[#d7ecff]/10 p-5"
                >
                  <p className="text-xs uppercase tracking-wider text-white/55">
                    Recommendation
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">
                    Your next-step review is ready
                  </h2>
                  <p className="mt-2 text-sm text-white/65">
                    Your stored Program recommendation remains available here
                    for review.
                  </p>
                </div>
              )}
              {selectedDay === runtimeSummary?.current_day &&
                progressSummary?.resume_content_item_id &&
                onSetItemStatus && (
                  <button
                    type="button"
                    onClick={() =>
                      void onSetItemStatus(
                        progressSummary.resume_content_item_id!,
                        'completed',
                      )
                    }
                    className="mt-8 h-12 w-full rounded-full border border-white/30 text-sm font-semibold hover:bg-white/5"
                  >
                    Mark current content completed
                  </button>
                )}
            </div>
          )}

          {runtimeSummary && (
            <LifecycleMenu
              runtimeSummary={runtimeSummary}
              previewMode={previewMode}
              onUpdated={onRuntimeSummaryUpdate}
            />
          )}
          <ProgramResources
            data={data}
            progressSummary={progressSummary}
            onSetItemStatus={
              needsEnrollment || runtimeError ? undefined : onSetItemStatus
            }
          />
        </StackedPageSection>
      </div>

      <StartGate
        programSlug={data.slug}
        programTitle={data.title}
        open={startGateOpen}
        previewMode={previewMode}
        onClose={() => setStartGateOpen(false)}
        onStarted={(summary) => {
          onRuntimeSummaryUpdate(summary);
          setStartGateOpen(false);
        }}
      />
      {!previewMode && <JournalFooterNav />}
    </div>
  );
}
