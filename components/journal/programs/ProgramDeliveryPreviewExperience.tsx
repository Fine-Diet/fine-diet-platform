'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Lock,
  Pause,
  Play,
  X,
} from 'lucide-react';
import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MemberDayInteraction } from '@/components/journal/programs/MemberDayInteraction';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { ProgramCheckinPanel } from '@/components/journal/programs/ProgramCheckinPanel';
import { ProgramDeliveryModules } from '@/components/journal/programs/ProgramDeliveryModules';
import {
  StackedPageHero,
  StackedPageSection,
} from '@/components/layout/StackedPageSection';
import { PROGRAMS_MVP_CATEGORIES } from '@/lib/programs/appProgramsMvp';
import {
  checkinPromptWithoutTemplate,
  heroForViewedDay,
  mediaForViewedDay,
  PROGRAM_PREVIEW_TEST_AUDIO_PATH,
  selectPreviewCheckinTemplate,
  shouldPreserveAuthoredOrder,
  type DeliveryCompositionSource,
} from '@/lib/programs/deliveryComposition';
import {
  isDeliveryModuleVisible,
  type ProgramDeliveryModuleDefinition,
  type ProgramDeliveryRoadmapBlock,
} from '@/lib/programs/deliveryModuleTypes';
import { memberDayPanelModel } from '@/lib/programs/memberDayInteractionClient';
import { getProgramBlueprintAsset, type ProgramBlueprintDeliveryConfig } from '@/lib/programs/programBlueprint';
import type { ProgramLibraryDetail } from '@/lib/programs/programLibraryServerService';
import {
  authorizedReturnDay,
  buildProgramDayRail,
  buildProgramEnrollmentRequest,
  deriveDayTabLabel,
  deriveHeroDayContext,
  getProgramRoadmapItems,
  localDateKey,
  numberedProgramDayRail,
  resolveCommentaryAudio,
  resolveInitialProgramDay,
  resolveProgramDuration,
  twoDigitDay,
  type ProgramDayRailItem,
} from '@/lib/programs/programDeliveryNavigation';
import type {
  ProgramProgressStatus,
  ProgramProgressSummary,
} from '@/lib/programs/progressTypes';
import type {
  ProgramCheckinTemplate,
  ProgramLifecycleAction,
  ProgramRuntimeSummary,
} from '@/lib/programs/runtimeTypes';
import {
  isCheckinDue,
  isDay21Handled,
  shouldShowRecommendationReveal,
  shouldOpenProgramStartGate,
} from '@/lib/programs/runtimeUi';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

type DeliveryView = 'day' | 'schedule';

function memberDayPanel(input: {
  runtimeSummary: ProgramRuntimeSummary | null;
  previewMode: boolean;
  day: number;
  modules: ProgramDeliveryModuleDefinition[];
  blueprint?: ProgramBlueprintDeliveryConfig;
}) {
  if (input.previewMode || !input.runtimeSummary) return null;
  return (
    <MemberDayInteraction
      {...memberDayPanelModel({
        status: input.runtimeSummary.resolved_status,
        day: input.day,
        enrollmentId: input.runtimeSummary.enrollment.id,
        versionId: input.runtimeSummary.version.id,
        modules: input.modules,
        interactions: input.blueprint?.interactions ?? null,
        latestCheckin: input.runtimeSummary.latest_checkin_response,
      })}
    />
  );
}

interface ProgramDeliveryExperienceProps {
  data: ProgramLibraryDetail;
  runtimeSummary: ProgramRuntimeSummary | null;
  progressSummary: ProgramProgressSummary | null;
  deliveryModules: ProgramDeliveryModuleDefinition[];
  blueprint?: ProgramBlueprintDeliveryConfig;
  runtimeError?: string | null;
  previewMode?: boolean;
  compositionSource?: DeliveryCompositionSource;
  previewCheckinTemplates?: ProgramCheckinTemplate[];
  previewVersionId?: string | null;
  initialStartGateOpen?: boolean;
  initialSelectedDay?: number;
  restartRequested?: boolean;
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

function withoutPreviewTestAudio(
  modules: readonly ProgramDeliveryModuleDefinition[],
): ProgramDeliveryModuleDefinition[] {
  return modules.map((module) => {
    if (
      !module.blocks?.some(
        (block) =>
          block.type === 'audio' &&
          block.url.trim() === PROGRAM_PREVIEW_TEST_AUDIO_PATH,
      )
    ) {
      return module;
    }
    return {
      ...module,
      blocks: module.blocks?.filter(
        (block) =>
          !(
            block.type === 'audio' &&
            block.url.trim() === PROGRAM_PREVIEW_TEST_AUDIO_PATH
          ),
      ),
    };
  });
}

function formatDate(dateKey: string | null | undefined): string | null {
  if (!dateKey) return null;
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function ProgramAudioPlayer({
  src,
  title,
  description,
  eyebrow = 'Commentary',
}: {
  src: string | null;
  title?: string | null;
  description?: string | null;
  eyebrow?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playableSrc = src?.trim() ? src.trim() : null;
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioUnavailable, setAudioUnavailable] = useState(!playableSrc);
  const playbackLabel = title?.trim() || eyebrow;

  useEffect(() => {
    setAudioUnavailable(!playableSrc);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [playableSrc]);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || audioUnavailable || !playableSrc) return;
    if (audio.paused) {
      void audio.play().catch(() => setAudioUnavailable(true));
    } else {
      audio.pause();
    }
  }

  function seek(nextTime: number) {
    const audio = audioRef.current;
    if (!audio || audioUnavailable || !playableSrc) return;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  const unavailable = !playableSrc || audioUnavailable;

  return (
    <div className="mt-6 max-w-xl text-white" role="group" aria-label={playbackLabel}>
      <p className="text-xs font-semibold text-white/75">
        {eyebrow}
      </p>
      {title?.trim() && (
        <p className="mt-2 text-2xl font-normal leading-tight">{title}</p>
      )}
      {playableSrc && !audioUnavailable && (
        <audio
          ref={audioRef}
          src={playableSrc}
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onTimeUpdate={() =>
            setCurrentTime(audioRef.current?.currentTime ?? 0)
          }
          onLoadedMetadata={() => {
            setDuration(audioRef.current?.duration ?? 0);
            setAudioUnavailable(false);
          }}
          onError={() => {
            setIsPlaying(false);
            setCurrentTime(0);
            setDuration(0);
            setAudioUnavailable(true);
          }}
        />
      )}
      {unavailable ? (
        <div className="mt-4">
          <p role="status" className="text-sm text-white/70">
            Audio unavailable
          </p>
          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              disabled
              aria-label={`Play ${playbackLabel} unavailable`}
              className="flex h-12 w-12 shrink-0 cursor-not-allowed items-center justify-center rounded-full bg-white/25 text-black/40"
            >
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            </button>
            <input
              type="range"
              min={0}
              max={0}
              value={0}
              disabled
              aria-label={`Seek ${playbackLabel} unavailable`}
              className="h-1 w-full cursor-not-allowed appearance-none rounded-full bg-white/20 accent-white/30"
            />
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-4">
          <button
            type="button"
            onClick={togglePlayback}
            aria-label={isPlaying ? `Pause ${playbackLabel}` : `Play ${playbackLabel}`}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 fill-current" />
            ) : (
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            )}
          </button>
          <div className="flex-1">
            <input
              type="range"
              min={0}
              max={duration > 0 ? duration : 0}
              step={0.1}
              value={duration > 0 ? currentTime : 0}
              disabled={duration <= 0}
              onChange={(event) => seek(Number(event.target.value))}
              aria-label={`Seek ${playbackLabel}`}
              className="h-11 w-full cursor-pointer appearance-none rounded-full bg-white/35 accent-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait"
            />
            {duration > 0 && (
              <div className="mt-1.5 flex justify-between text-[10px] text-white/60">
                <span>{formatAudioTime(currentTime)}</span>
                <span>
                  -{formatAudioTime(Math.max(0, duration - currentTime))}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
      {description?.trim() && (
        <p className="mt-4 max-w-xl text-xs leading-relaxed text-white/65">
          {description}
        </p>
      )}
    </div>
  );
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
              className="mt-2 h-11 w-full rounded-xl border border-black/15 bg-white px-3 text-xl font-normal"
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

function HorizontalRail({
  children,
  ariaLabel,
  className = '',
  chevronsOutsideContent = false,
  activeItemKey,
}: {
  children: ReactNode;
  ariaLabel: string;
  className?: string;
  /** Scroll track matches parent content width; chevrons sit in horizontal padding. */
  chevronsOutsideContent?: boolean;
  activeItemKey?: string;
}) {
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeItemKey || !railRef.current) return;
    const selected = railRef.current.querySelector<HTMLElement>(
      `[data-rail-key="${activeItemKey}"]`,
    );
    selected?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [activeItemKey]);

  function scroll(direction: -1 | 1) {
    railRef.current?.scrollBy({
      left: direction * Math.max(180, railRef.current.clientWidth * 0.65),
      behavior: 'smooth',
    });
  }

  const outsideChevronLayout =
    chevronsOutsideContent ? '-ml-8 w-[calc(100%+4rem)]' : '';
  const chevronClass =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:h-8 md:w-8 md:opacity-0 md:transition-opacity md:group-hover/rail:opacity-100';

  return (
    <div
      className={`group/rail relative flex min-w-0 items-center ${outsideChevronLayout} ${className}`}
    >
      <button
        type="button"
        onClick={() => scroll(-1)}
        aria-label={`Scroll ${ariaLabel} left`}
        className={chevronClass}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="relative min-w-0 flex-1">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-[var(--rail-fade,rgba(5,18,10,0.85))] to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-[var(--rail-fade,rgba(5,18,10,0.85))] to-transparent"
        />
        <div
          ref={railRef}
          aria-label={ariaLabel}
          className="overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {children}
        </div>
      </div>
      <button
        type="button"
        onClick={() => scroll(1)}
        aria-label={`Scroll ${ariaLabel} right`}
        className={chevronClass}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function dayRailAriaLabel(item: ProgramDayRailItem, selected: boolean): string {
  const state =
    item.state === 'current'
      ? 'current day'
      : item.state === 'locked'
        ? 'locked'
        : item.state === 'review'
          ? 'available to review'
          : 'setup';
  return `Day ${item.day}, ${selected ? 'selected, ' : ''}${state}`;
}

function dayBeadClass(item: ProgramDayRailItem, selected: boolean): string {
  const chrome =
    'flex h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:h-8 md:min-w-8 md:px-2.5';
  if (item.state === 'current') {
    return `${chrome} bg-[#55789b] text-black${
      selected ? ' ring-2 ring-white ring-offset-2 ring-offset-black/30' : ''
    }`;
  }
  if (selected) return `${chrome} bg-white text-black ring-2 ring-white`;
  if (item.accessible) return `${chrome} border border-transparent bg-white/50 text-black`;
  return `${chrome} border border-white/50 text-white/50`;
}

function scheduleWithSetupFirst(
  items: ProgramDeliveryRoadmapBlock['items'],
): ProgramDeliveryRoadmapBlock['items'] {
  const setupIndex = items.findIndex(
    (item) => item.dayStart === 0 && item.dayEnd === 0,
  );
  if (setupIndex === 0) return items;
  if (setupIndex > 0) {
    const setup = items[setupIndex];
    return [setup, ...items.filter((_, index) => index !== setupIndex)];
  }
  return [
    {
      key: 'setup',
      label: 'Setup',
      range: 'Day 0',
      description: 'Open Setup for this Program.',
      dayStart: 0,
      dayEnd: 0,
    },
    ...items,
  ];
}

function Schedule({
  modules,
  currentDay,
  setupReachable,
  onOpenSetup,
}: {
  modules: ProgramDeliveryModuleDefinition[];
  currentDay: number;
  setupReachable: boolean;
  onOpenSetup: () => void;
}) {
  const roadmap = scheduleWithSetupFirst(getProgramRoadmapItems(modules));
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
          const isSetup = item.dayStart === 0 && item.dayEnd === 0;
          const isCurrent =
            item.dayStart != null &&
            item.dayEnd != null &&
            currentDay >= item.dayStart &&
            currentDay <= item.dayEnd;
          const isPast = item.dayEnd != null && item.dayEnd < currentDay;
          const status = isCurrent ? 'Current' : isPast ? 'Review' : item.range;
          const body = (
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">{isSetup ? 'Setup' : item.label}</p>
                {item.description && (
                  <p className="mt-1 text-sm text-white/58">{item.description}</p>
                )}
              </div>
              <span className="shrink-0 text-xs text-white/45">{status}</span>
            </div>
          );
          return (
            <li
              key={item.key}
              className={`rounded-2xl border ${
                isCurrent
                  ? 'border-[#d7ecff]/50 bg-[#d7ecff]/10'
                  : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              {isSetup && setupReachable ? (
                <button
                  type="button"
                  onClick={onOpenSetup}
                  className="w-full rounded-2xl p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {body}
                </button>
              ) : (
                <div className="p-4">{body}</div>
              )}
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
  for (const progressModule of progressSummary?.modules ?? []) {
    for (const item of progressModule.item_states) {
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

export function ProgramDeliveryPreviewExperience({
  data,
  runtimeSummary,
  progressSummary,
  deliveryModules,
  blueprint,
  runtimeError = null,
  previewMode = false,
  compositionSource = 'delivery',
  previewCheckinTemplates = [],
  previewVersionId = null,
  initialStartGateOpen = true,
  initialSelectedDay,
  restartRequested = false,
  initialView = 'day',
  onRuntimeSummaryUpdate,
  onSetItemStatus,
}: ProgramDeliveryExperienceProps) {
  const hasAccess = data.has_entitlement || data.access_state === 'assigned_only';
  const needsEnrollment = hasAccess && !runtimeSummary && !runtimeError;
  const canOpenStartGate = shouldOpenProgramStartGate({
    hasAccess,
    runtimeSummary,
    runtimeError,
    restartRequested,
    previewMode,
  });
  const [startGateOpen, setStartGateOpen] = useState(
    canOpenStartGate && initialStartGateOpen,
  );
  const [view, setView] = useState<DeliveryView>(initialView);
  const [selectedDay, setSelectedDay] = useState(() =>
    initialSelectedDay ?? resolveInitialProgramDay(runtimeSummary),
  );
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);

  const resolvedInitialDay = initialSelectedDay ?? (
    runtimeSummary && ['active', 'paused', 'completed'].includes(runtimeSummary.resolved_status)
      ? Math.max(0, runtimeSummary.current_day)
      : 0
  );
  useEffect(() => {
    setSelectedDay(resolvedInitialDay);
  }, [initialSelectedDay, resolvedInitialDay, runtimeSummary?.enrollment.id]);

  const memberRuntime = !previewMode && blueprint && !('modules' in blueprint)
    ? blueprint
    : null;
  const duration = memberRuntime
    ? memberRuntime.version.durationDays
    : resolveProgramDuration(runtimeSummary, deliveryModules);
  const authorizedDay = memberRuntime && runtimeSummary?.resolved_status === 'pre_start'
    ? 0
    : runtimeSummary?.current_day ?? 0;
  const rail = buildProgramDayRail({
    durationDays: duration,
    runtimeStatus: runtimeSummary?.resolved_status ?? 'not_started',
    currentDay: authorizedDay,
  });
  const numberedRail = numberedProgramDayRail(rail);
  const returnDay = authorizedReturnDay(
    rail,
    runtimeSummary?.resolved_status ?? 'not_started',
    authorizedDay,
  );
  const viewedDay = selectedDay;
  const membershipCheckinDue =
    selectedDay === runtimeSummary?.current_day && isCheckinDue(runtimeSummary);
  const visibilityCtx = {
    runtimeSummary,
    checkinDue: membershipCheckinDue,
    day21Handled: isDay21Handled(runtimeSummary),
    viewedDay,
  };
  const authoredOrder = shouldPreserveAuthoredOrder(
    deliveryModules,
    visibilityCtx,
  );
  const rendererModules = withoutPreviewTestAudio(deliveryModules);
  const prepModules = rendererModules
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
  const prepWorkflowFrame = prepModules.find((module) =>
    module.blocks?.some((block) => block.type === 'cards'),
  );
  // Main's prep workflow omits orientation modules and replaces disabled CTA copy.
  // Render those modules through the same delivery renderer so authored text stays visible.
  const prepOrientationModules = prepModules.filter(
    (module) => module !== prepWorkflowFrame && !module.cta,
  );
  const prepDisabledModules = prepModules.filter((module) => Boolean(module.cta?.disabled));
  const prepWorkflowModules = prepModules.filter(
    (module) =>
      !prepOrientationModules.includes(module) && !prepDisabledModules.includes(module),
  );
  const activeModules = rendererModules.filter(
    (module) => module.moduleType !== 'prep' && module.moduleType !== 'roadmap',
  );
  const lightModules = activeModules.filter(
    (module) =>
      module.moduleType === 'week' || module.moduleType === 'practice_card',
  );
  const listeningModules = activeModules.filter(
    (module) => module.moduleType === 'guide',
  );
  const reflectionModules = activeModules.filter(
    (module) =>
      module.moduleType !== 'week' &&
      module.moduleType !== 'practice_card' &&
      module.moduleType !== 'guide',
  );
  const showDayZero = viewedDay === 0;
  const composedHero = authoredOrder
    ? heroForViewedDay(deliveryModules, viewedDay, visibilityCtx)
    : null;
  const viewedMedia = mediaForViewedDay(
    deliveryModules,
    viewedDay,
    visibilityCtx,
  );
  const setupReachable = deliveryModules.some(
    (module) =>
      module.moduleType === 'prep' &&
      isDeliveryModuleVisible(module, {
        ...visibilityCtx,
        viewedDay: 0,
      }),
  );
  const commentary = showDayZero
    ? resolveCommentaryAudio(
        viewedMedia?.type === 'audio' ? viewedMedia : null,
      )
    : null;
  const visibleModules = deliveryModules.filter((module) =>
    isDeliveryModuleVisible(module, visibilityCtx),
  );
  const previewTemplate = previewMode
    ? selectPreviewCheckinTemplate(
        previewCheckinTemplates,
        previewVersionId ?? runtimeSummary?.version.id ?? '',
        viewedDay,
        compositionSource === 'saved-draft',
      )
    : null;
  const previewTemplateMissing =
    previewMode &&
    checkinPromptWithoutTemplate(visibleModules, viewedDay, previewTemplate);
  const blueprintTokens = blueprint?.presentation.tokens;
  const heroAsset = blueprint ? getProgramBlueprintAsset(blueprint, 'delivery-hero') : null;
  const imageUrl = composedHero?.imageUrl ?? heroAsset?.src ?? programImage(data.slug);
  const activeWeekModule = deliveryModules.find(
    (module) =>
      module.moduleType === 'week' &&
      module.dayStart != null &&
      module.dayEnd != null &&
      selectedDay >= module.dayStart &&
      selectedDay <= module.dayEnd,
  );
  const activeBlueprintPhase = blueprint?.phases.find(
    (phase) => selectedDay >= phase.dayStart && selectedDay <= phase.dayEnd,
  );
  const checkinDue = previewMode
    ? Boolean(previewTemplate) || previewTemplateMissing
    : membershipCheckinDue;
  const panelSummary =
    runtimeSummary && previewTemplate
      ? { ...runtimeSummary, next_checkin_template: previewTemplate }
      : runtimeSummary;
  const headline =
    composedHero?.title ??
    (showDayZero
      ? `Let’s get you set up for ${data.title}`
      : activeBlueprintPhase
        ? `Let’s focus on ${activeBlueprintPhase.title}`
        : activeWeekModule
        ? `Let’s focus on ${activeWeekModule.title}`
        : `Day ${twoDigitDay(viewedDay)} in ${data.title}`);
  const derivedContextLine = activeBlueprintPhase
    ? `${twoDigitDay(selectedDay)} — ${activeBlueprintPhase.label ?? activeBlueprintPhase.title}`
    : deriveHeroDayContext(selectedDay, deliveryModules);

  function openRailDay(item: ProgramDayRailItem) {
    if (!runtimeSummary || !item.accessible) {
      setLockedMessage(
        runtimeSummary?.resolved_status === 'pre_start'
          ? `Day ${item.day} unlocks when your Program starts.`
          : `Day ${item.day} unlocks on its Program date.`,
      );
      return;
    }
    setLockedMessage(null);
    setView('day');
    setSelectedDay(item.day);
  }

  function openSetup() {
    const setup = rail.find((item) => item.day === 0);
    if (!setupReachable || !setup?.accessible) return;
    setLockedMessage(null);
    setView('day');
    setSelectedDay(0);
  }

  return (
    <div className="min-h-screen bg-[#0d1d0f] text-white" style={blueprintTokens ? { backgroundColor: blueprintTokens.pageSurface, color: blueprintTokens.darkForeground } : undefined}>
      <div className="pb-[calc(8rem+env(safe-area-inset-bottom,0px))]">
        <StackedPageHero
          className={
            showDayZero
              ? 'overflow-hidden bg-[#07170f]'
              : 'min-h-[90vh] overflow-hidden bg-[#07170f]'
          }
          style={blueprintTokens ? { backgroundColor: blueprintTokens.heroSurface } : undefined}
        >
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
          <div
            className={`relative mx-auto flex w-full max-w-[950px] flex-col px-10 pt-16 sm:px-[4rem] ${
              showDayZero
                ? 'pb-16'
                : 'min-h-[90vh] pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-20'
            }`}
          >
            <Link href={APP_ROUTES.programs} className="shrink-0 rounded-sm text-xs text-white/70 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              ← Programs
            </Link>
            <div className={showDayZero ? 'flex flex-col pb-8 pt-8' : 'flex min-h-0 flex-1 flex-col justify-center'}>
              <p className="text-[1.5rem] font-semibold text-white">{data.title}</p>
              <p className="mt-0 inline-flex items-center gap-2 font-semibold text-base text-white/75 md:text-base">
            <Clock3 aria-hidden="true" className="block h-3.5 w-3.5 shrink-0" />
                <span>{derivedContextLine}</span>
              </p>
              {composedHero?.eyebrow && (
                <p className="mt-3 text-[2.75rem] uppercase tracking-wider text-white/70">
                  {composedHero.eyebrow}
                </p>
              )}
              <h1 className="mt-2 text-[2.75rem] font-normal leading-[1] text-white md:text-[2.75rem]">
                {headline}
              </h1>
              {!showDayZero && activeWeekModule?.body && (
                <p className="mt-1 text-base leading-[1.2] font-light text-white/68">
                  {activeWeekModule.body}
                </p>
              )}
              {!showDayZero &&
                !viewedMedia &&
                authoredOrder &&
                compositionSource !== 'delivery' && (
                  <p className="mt-7 max-w-2xl text-sm text-white/60">
                    No media is authored for this day.
                  </p>
                )}
              {showDayZero && commentary && (
                <ProgramAudioPlayer
                  src={commentary.src}
                  title={commentary.title}
                  description={commentary.description}
                />
              )}
              {showDayZero && returnDay != null && (
                <button
                  type="button"
                  onClick={() => openRailDay(
                    rail.find((item) => item.day === returnDay) ?? {
                      day: returnDay,
                      label: String(returnDay),
                      state: 'current',
                      accessible: true,
                    },
                  )}
                  className="mt-6 self-start rounded-full px-1 py-2 text-sm font-semibold text-white/75 underline-offset-4 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Return to today
                </button>
              )}
              {!showDayZero && runtimeSummary && (
                  <HorizontalRail
                    ariaLabel="Program days"
                    activeItemKey={String(selectedDay)}
                    chevronsOutsideContent
                    className="mt-4 [--rail-fade:rgba(5,18,10,0.8)]"
                  >
                    <div className="py-1">
                      <div className="flex min-w-max gap-1">
                        {numberedRail.map((item) => {
                          const selected = selectedDay === item.day;
                          return (
                          <button
                            key={item.day}
                            type="button"
                            data-rail-key={String(item.day)}
                            aria-current={selected ? 'page' : undefined}
                            aria-pressed={selected}
                            aria-label={dayRailAriaLabel(item, selected)}
                            onClick={() => openRailDay(item)}
                            className={dayBeadClass(item, selected)}
                            style={item.state === 'current' && blueprintTokens ? {
                              backgroundColor: blueprintTokens.accentSurface,
                              color: blueprintTokens.accentForeground,
                              borderColor: blueprintTokens.accentSurface,
                            } : undefined}
                          >
                            {item.state === 'locked' && (
                              <Lock className="h-2.5 w-2.5" />
                            )}
                            {item.label}
                          </button>
                          );
                        })}
                      </div>
                    </div>
                  </HorizontalRail>
                )}
            </div>
          </div>

          {!showDayZero && runtimeSummary && (
            <>
              <div className="absolute inset-x-0 bottom-0 z-10 border-t border-white/15 bg-black/45 backdrop-blur-md md:hidden">
                <div
                  role="tablist"
                  aria-label="Day content and schedule"
                  className="mx-auto grid h-12 max-w-[950px] grid-cols-2"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={view === 'day'}
                    onClick={() => setView('day')}
                    className={`text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white ${
                      view === 'day' ? 'bg-white/15 text-white' : 'text-white/70'
                    }`}
                  >
                    Day content
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={view === 'schedule'}
                    onClick={() => setView('schedule')}
                    className={`text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white ${
                      view === 'schedule' ? 'bg-white/15 text-white' : 'text-white/70'
                    }`}
                  >
                    Schedule
                  </button>
                </div>
              </div>
              <div
                className="absolute inset-x-0 bottom-0 z-10 hidden overflow-hidden rounded-t-2xl border-t-[1px] border-white/15 bg-black/35 backdrop-blur-md [--rail-fade:rgba(5,12,8,0.72)] md:block"
              >
                <div
                  role="tablist"
                  aria-label="Program schedule and days"
                  className="mx-auto flex h-[50px] w-full max-w-[950px] items-stretch border-b-[1px] border-black/25 px-10 sm:px-[4rem]"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={view === 'schedule'}
                    onClick={() => setView('schedule')}
                    className={`relative z-20 shrink-0 pr-4 text-sm font-semibold backdrop-blur-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                      view === 'schedule'
                        ? 'text-white'
                        : 'text-white/75 hover:text-white'
                    }`}
                  >
                    Schedule
                  </button>
                  <HorizontalRail
                    ariaLabel="Program schedule and days"
                    activeItemKey={String(selectedDay)}
                    className="min-w-0 flex-1"
                  >
                    <div className="flex h-[50px] min-w-max">
                      {numberedRail.map((item) => {
                        const isSelected =
                          view === 'day' && selectedDay === item.day;
                        return (
                          <button
                            key={item.day}
                            type="button"
                            role="tab"
                            data-rail-key={String(item.day)}
                            aria-selected={isSelected}
                            disabled={!item.accessible}
                            onClick={() => openRailDay(item)}
                            className={`shrink-0 border-l border-white/15 px-5 text-sm font-regular transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white ${
                              isSelected
                                ? 'bg-[#f3f3ea] text-[#17100c] font-semibold'
                                : item.accessible
                                  ? 'text-white/65 hover:bg-white/5 hover:text-white'
                                  : 'cursor-not-allowed text-white/30'
                            }`}
                          >
                            {item.state === 'locked' && (
                              <Lock className="mr-1 inline h-3 w-3" />
                            )}
                            {deriveDayTabLabel(item.day, deliveryModules)}
                          </button>
                        );
                      })}
                    </div>
                  </HorizontalRail>
                </div>
              </div>
            </>
          )}
        </StackedPageHero>

        {view === 'schedule' ? (
          <StackedPageSection
            layer={1}
            className="mt-0 rounded-none bg-[#102312] pb-20"
            contentClassName="max-w-[950px] justify-center px-10 sm:px-[4rem]"
          >
            {lockedMessage && (
              <p role="status" className="mb-5 text-xs text-[#d7ecff]/75">
                {lockedMessage}
              </p>
            )}
            <Schedule
              modules={deliveryModules}
              currentDay={runtimeSummary?.current_day ?? 0}
              setupReachable={setupReachable}
              onOpenSetup={openSetup}
            />
            {runtimeSummary && (
              <LifecycleMenu
                runtimeSummary={runtimeSummary}
                previewMode={previewMode}
                onUpdated={onRuntimeSummaryUpdate}
              />
            )}
          </StackedPageSection>
        ) : authoredOrder ? (
          <StackedPageSection
            layer={1}
            className="mt-0 rounded-none bg-[#102312] pb-20 pt-12"
            contentClassName="max-w-[950px] justify-center px-10 sm:px-[4rem]"
          >
            {compositionSource !== 'delivery' && (
              <p className="mb-5 text-xs uppercase tracking-wider text-white/55">
                Preview source: {compositionSource}
              </p>
            )}
            {lockedMessage && (
              <p role="status" className="mb-5 text-xs text-[#d7ecff]/75">
                {lockedMessage}
              </p>
            )}
            {runtimeError && (
              <p className="mb-5 border-l-2 border-amber-200/35 pl-4 text-sm text-amber-100">
                Runtime details could not be confirmed. Interactive Program
                regions remain unavailable.
              </p>
            )}
            <div
              className={
                needsEnrollment ? 'pointer-events-none opacity-75' : undefined
              }
              aria-disabled={needsEnrollment || undefined}
            >
              <ProgramDeliveryModules
                runtimeSummary={runtimeSummary}
                progressSummary={progressSummary}
                modules={rendererModules}
                viewedDay={viewedDay}
                checkinDue={membershipCheckinDue}
                day21Handled={isDay21Handled(runtimeSummary)}
                anchors={{
                  checkin: 'program-checkin',
                  recommendation: 'program-recommendation',
                }}
              />
            </div>
            {needsEnrollment && (
              <div className="mt-5 flex items-center gap-3 border-t border-white/15 pt-5">
                <Lock className="h-5 w-5 text-white/65" />
                <p className="flex-1 text-xs text-white/60">
                  Day 00 stays readable. Start the Program to use setup actions.
                </p>
                <button
                  type="button"
                  onClick={() => setStartGateOpen(true)}
                  className="shrink-0 rounded-full bg-[#d7ecff] px-4 py-2 text-xs font-semibold text-black"
                >
                  Get Started
                </button>
              </div>
            )}
            {previewTemplateMissing && (
              <p id="program-checkin" className="mt-8 text-sm text-white/70">
                Check-in template is not available for this day.
              </p>
            )}
            {previewTemplate && panelSummary && (
              <div id="program-checkin" className="mt-8">
                <ProgramCheckinPanel
                  runtimeSummary={panelSummary}
                  onHandled={onRuntimeSummaryUpdate}
                  previewMode={previewMode}
                />
              </div>
            )}
            {!previewMode && checkinDue && runtimeSummary && (
              <div id="program-checkin" className="mt-8">
                <ProgramCheckinPanel
                  runtimeSummary={runtimeSummary}
                  onHandled={onRuntimeSummaryUpdate}
                  previewMode={previewMode}
                />
              </div>
            )}
            {data.slug === 'baseline' &&
              shouldShowRecommendationReveal(runtimeSummary) && (
                <div
                  id="program-recommendation"
                  className="mt-8 border-t border-[#d7ecff]/25 pt-7"
                >
                  <p className="text-xs uppercase tracking-wider text-white/55">
                    Recommendation
                  </p>
                  <h2 className="mt-2 text-2xl font-normal">
                    Your next-step review is ready
                  </h2>
                  <p className="mt-2 text-sm text-white/65">
                    Your stored Program recommendation remains available here
                    for review.
                  </p>
                </div>
              )}
            {runtimeSummary && (
              <LifecycleMenu
                runtimeSummary={runtimeSummary}
                previewMode={previewMode}
                onUpdated={onRuntimeSummaryUpdate}
              />
            )}
            {memberDayPanel({
              runtimeSummary,
              previewMode,
              day: viewedDay,
              modules: deliveryModules,
              blueprint,
            })}
            <ProgramResources
              data={data}
              progressSummary={progressSummary}
              onSetItemStatus={
                needsEnrollment || runtimeError ? undefined : onSetItemStatus
              }
            />
          </StackedPageSection>
        ) : showDayZero ? (
          <StackedPageSection
            layer={1}
            className="mt-0 rounded-none bg-[#102312] pb-20 pt-12"
            contentClassName="max-w-[950px] justify-center px-10 sm:px-[4rem]"
              style={blueprintTokens ? { backgroundColor: blueprintTokens.deepSurface, color: blueprintTokens.darkForeground } : undefined}
              >
            {lockedMessage && (
              <p role="status" className="mb-5 text-xs text-[#d7ecff]/75">
                {lockedMessage}
              </p>
            )}
            {runtimeError && (
              <p className="mb-5 border-l-2 border-amber-200/35 pl-4 text-sm text-amber-100">
                Runtime details could not be confirmed. Interactive Program
                regions remain unavailable.
              </p>
            )}
            <div
              className={needsEnrollment ? 'pointer-events-none opacity-75' : undefined}
              aria-disabled={needsEnrollment || undefined}
            >
              {prepOrientationModules.length > 0 && (
                <ProgramDeliveryModules
                  runtimeSummary={runtimeSummary}
                  progressSummary={progressSummary}
                  modules={prepOrientationModules}
                  presentation="default"
                  viewedDay={viewedDay}
                />
              )}
              {prepWorkflowModules.length > 0 && (
                <ProgramDeliveryModules
                  runtimeSummary={runtimeSummary}
                  progressSummary={progressSummary}
                  modules={prepWorkflowModules}
                  presentation="prep-workflow"
                  viewedDay={viewedDay}
                />
              )}
              {prepDisabledModules.length > 0 && (
                <ProgramDeliveryModules
                  runtimeSummary={runtimeSummary}
                  progressSummary={progressSummary}
                  modules={prepDisabledModules}
                  presentation="default"
                  viewedDay={viewedDay}
                />
              )}
            </div>
            {needsEnrollment && (
              <div className="mt-5 flex items-center gap-3 border-t border-white/15 pt-5">
                <Lock className="h-5 w-5 text-white/65" />
                <p className="flex-1 text-xs text-white/60">
                  Day 00 stays readable. Start the Program to use setup actions.
                </p>
                <button
                  type="button"
                  onClick={() => setStartGateOpen(true)}
                  className="shrink-0 rounded-full bg-[#d7ecff] px-4 py-2 text-xs font-semibold text-black"
                >
                  Get Started
                </button>
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
        ) : (
          <>
            <StackedPageSection
              layer={1}
            className="mt-0 rounded-none border-t-[1px] border-t-black/10 bg-[#f3f3ea] pb-20 pt-12 text-[#17100c] mt-0"
            contentClassName="max-w-[950px] justify-center px-10 sm:px-[4rem]"
            style={blueprintTokens ? { backgroundColor: blueprintTokens.lightSurface, color: blueprintTokens.lightForeground } : undefined}
            >
              {lockedMessage && (
                <p role="status" className="mb-5 text-xs text-black/55">
                  {lockedMessage}
                </p>
              )}
              <ProgramDeliveryModules
                runtimeSummary={runtimeSummary}
                progressSummary={progressSummary}
                modules={lightModules}
                presentation="light"
                checkinDue={checkinDue}
                day21Handled={isDay21Handled(runtimeSummary)}
                viewedDay={viewedDay}
              />
            </StackedPageSection>

            <StackedPageSection
              layer={2}
              className="bg-[#0d2110] pb-20 pt-12"
              contentClassName="max-w-[950px] justify-center px-10 sm:px-[4rem]"
              style={blueprintTokens ? { backgroundColor: blueprintTokens.darkSurface, color: blueprintTokens.darkForeground } : undefined}
            >
              <ProgramDeliveryModules
                runtimeSummary={runtimeSummary}
                progressSummary={progressSummary}
                modules={listeningModules}
                presentation="dark"
                checkinDue={checkinDue}
                day21Handled={isDay21Handled(runtimeSummary)}
                viewedDay={viewedDay}
              />
            </StackedPageSection>

            <StackedPageSection
              layer={3}
              className="bg-[#031205] pb-20 pt-12"
              contentClassName="max-w-[950px] justify-center px-10 sm:px-[4rem]"
              style={blueprintTokens ? { backgroundColor: blueprintTokens.deepSurface, color: blueprintTokens.darkForeground } : undefined}
            >
              <ProgramDeliveryModules
                runtimeSummary={runtimeSummary}
                progressSummary={progressSummary}
                modules={reflectionModules}
                presentation="deep"
                checkinDue={checkinDue}
                day21Handled={isDay21Handled(runtimeSummary)}
                viewedDay={viewedDay}
                anchors={{
                  checkin: 'program-checkin',
                  recommendation: 'program-recommendation',
                }}
              />
              {checkinDue && runtimeSummary && (
                <div id="program-checkin" className="mt-8">
                  <ProgramCheckinPanel
                    runtimeSummary={runtimeSummary}
                    onHandled={onRuntimeSummaryUpdate}
                    previewMode={previewMode}
                  />
                </div>
              )}
              {data.slug === 'baseline' &&
                shouldShowRecommendationReveal(runtimeSummary) && (
                <div
                  id="program-recommendation"
                  className="mt-8 border-t border-[#d7ecff]/25 pt-7"
                >
                  <p className="text-xs uppercase tracking-wider text-white/55">
                    Recommendation
                  </p>
                  <h2 className="mt-2 text-2xl font-normal">
                    Your next-step review is ready
                  </h2>
                  <p className="mt-2 text-sm text-white/65">
                    Your stored Program recommendation remains available here
                    for review.
                  </p>
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

            <StackedPageSection
              layer={4}
              className="bg-[#1b1711] pb-24 pt-10"
              contentClassName="max-w-[950px] justify-center px-10 sm:px-[4rem]"
              style={blueprintTokens ? { backgroundColor: blueprintTokens.completionSurface, color: blueprintTokens.darkForeground } : undefined}
            >
              {!previewMode && runtimeSummary ? (
                memberDayPanel({
                  runtimeSummary,
                  previewMode,
                  day: viewedDay,
                  modules: deliveryModules,
                  blueprint,
                })
              ) : !authoredOrder &&
              selectedDay === runtimeSummary?.current_day &&
              progressSummary?.resume_content_item_id &&
              onSetItemStatus ? (
                <button
                  type="button"
                  onClick={() =>
                    void onSetItemStatus(
                      progressSummary.resume_content_item_id!,
                      'completed',
                    )
                  }
                  className="h-12 w-full rounded-full border border-white/30 text-sm font-semibold hover:bg-white/5"
                >
                  Mark Day {twoDigitDay(selectedDay)} completed
                </button>
              ) : (
                <p className="text-center text-xs text-white/45">
                  Day {twoDigitDay(selectedDay)}
                </p>
              )}
            </StackedPageSection>
          </>
        )}
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
