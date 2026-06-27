'use client';

/**
 * /journal/programs/[slug] — Phase 11 Program detail
 *
 * Shows one program's:
 *   - identity + tagline/description
 *   - current runtime state (active now / scheduled / inactive / …)
 *   - a clearly separated "Currently affecting your plan" block
 *     (reused Packet 10 bullets, scoped to this slug)
 *   - the program's content/module outline from the catalogue
 *   - a compact history of all assignments for this slug
 *
 * §6d copy rule: "program content" and "program effect on your plan"
 * are rendered as two distinct sections.
 */

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { ProgramCheckinPanel } from '@/components/journal/programs/ProgramCheckinPanel';
import { ProgramDeliveryModules } from '@/components/journal/programs/ProgramDeliveryModules';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { getCodeDeliveryModuleSet } from '@/lib/programs/deliveryModuleSetRegistry';
import { isProgramRuntimeEnabled } from '@/lib/programs/programRuntimeRegistry';
import type { ProgramDeliveryModuleDefinition } from '@/lib/programs/deliveryModuleTypes';
import type {
  ProgramLibraryAssignmentView,
  ProgramLibraryDetail,
  ProgramRuntimeState,
} from '@/lib/programs/programLibraryServerService';
import type {
  ProgramProgressStatus,
  ProgramProgressSummary,
} from '@/lib/programs/progressTypes';
import type { ProgramContentProgress } from '@/lib/programs/progressTypes';
import type {
  ProgramEnrollmentStatus,
  ProgramRuntimeSummary,
  ProgramRuntimeSummaryList,
} from '@/lib/programs/runtimeTypes';
import {
  formatRecommendedStepLabel,
  getRecommendationRevealDetails,
  isCheckinDue,
  isDay21Handled,
  resolveProgramDetailRuntimeState,
  shouldShowRecommendationReveal,
} from '@/lib/programs/runtimeUi';

const BASELINE_SLUG = 'baseline';
const RECOMMENDATION_ANCHOR_ID = 'baseline-recommendation-reveal';
const CHECKIN_ANCHOR_ID = 'program-checkin';

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatDateKey(dateKey: string | null | undefined): string | null {
  if (!dateKey) return null;
  return formatDate(`${dateKey}T00:00:00`);
}

function capacityLabel(capacity: string | null | undefined): string {
  if (!capacity) return 'Not set';
  return capacity.charAt(0).toUpperCase() + capacity.slice(1);
}

function StateBadge({ state }: { state: ProgramRuntimeState }) {
  const map: Record<
    ProgramRuntimeState,
    { label: string; className: string }
  > = {
    active_now: {
      label: 'Active now',
      className:
        'border-emerald-300/30 bg-emerald-400/10 text-emerald-200',
    },
    scheduled: {
      label: 'Scheduled',
      className: 'border-sky-300/30 bg-sky-400/10 text-sky-200',
    },
    inactive: {
      label: 'Inactive',
      className: 'border-white/10 bg-white/[0.04] text-white/60',
    },
    completed: {
      label: 'Completed',
      className: 'border-white/10 bg-white/[0.04] text-white/60',
    },
    cancelled: {
      label: 'Cancelled',
      className: 'border-white/10 bg-white/[0.04] text-white/50',
    },
    none: {
      label: 'Available',
      className: 'border-white/10 bg-white/[0.04] text-white/70',
    },
  };
  const m = map[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${m.className}`}
    >
      {m.label}
    </span>
  );
}

function RuntimeEnrollmentBadge({
  status,
}: {
  status: ProgramEnrollmentStatus | 'not_started';
}) {
  const map: Record<
    ProgramEnrollmentStatus | 'not_started',
    { label: string; className: string }
  > = {
    not_started: {
      label: 'Ready to start',
      className: 'border-sky-300/30 bg-sky-400/10 text-sky-100',
    },
    pre_start: {
      label: 'Pre-start',
      className: 'border-sky-300/30 bg-sky-400/10 text-sky-100',
    },
    active: {
      label: 'Active',
      className: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100',
    },
    paused: {
      label: 'Paused',
      className: 'border-amber-300/30 bg-amber-400/10 text-amber-100',
    },
    completed: {
      label: 'Completed',
      className: 'border-brand-50/30 bg-brand-50/15 text-brand-50',
    },
    cancelled: {
      label: 'Cancelled',
      className: 'border-white/10 bg-white/[0.04] text-white/55',
    },
  };
  const m = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${m.className}`}
    >
      {m.label}
    </span>
  );
}

function RuntimeMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3">
      <p className="text-[10px] uppercase tracking-wider text-white/45">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function ProgramRuntimeHeader({
  data,
  runtimeSummary,
  progressSummary,
  runtimeError,
}: {
  data: ProgramLibraryDetail;
  runtimeSummary: ProgramRuntimeSummary | null;
  progressSummary: ProgramProgressSummary | null;
  runtimeError: string | null;
}) {
  const selectedStart = formatDateKey(
    runtimeSummary?.enrollment.selected_start_date,
  );
  const currentDay =
    runtimeSummary && runtimeSummary.current_day > 0
      ? `Day ${runtimeSummary.current_day}`
      : runtimeSummary
        ? 'Day 0'
        : 'Not enrolled';
  const status = runtimeSummary?.resolved_status ?? 'not_started';
  const progressValue = progressSummary
    ? `${progressSummary.items_completed}/${progressSummary.items_total} items (${progressSummary.percent_complete}%)`
    : 'No content progress yet';

  return (
    <section className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-white/45">
            Program delivery
          </p>
          <h1 className="mt-1 text-3xl font-semibold leading-tight text-white antialiased">
            {data.title}
          </h1>
          {data.tagline && (
            <p className="mt-2 text-sm leading-snug text-white/65">
              {data.tagline}
            </p>
          )}
        </div>
        <RuntimeEnrollmentBadge status={status} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <RuntimeMetric
          label="Selected start"
          value={selectedStart ?? 'Choose from Programs'}
        />
        <RuntimeMetric label="Current day" value={currentDay} />
        <RuntimeMetric
          label="Capacity"
          value={capacityLabel(runtimeSummary?.enrollment.current_capacity)}
        />
        <RuntimeMetric label="Progress" value={progressValue} />
      </div>

      {progressSummary?.resume_content_item_id && (
        <a
          href={`#item-${progressSummary.resume_content_item_id}`}
          className="mt-4 inline-flex rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/[0.1]"
        >
          Resume program content
        </a>
      )}

      {runtimeError && (
        <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          Runtime details could not fully load: {runtimeError}
        </p>
      )}
    </section>
  );
}

function RecommendationRevealRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3">
      <p className="text-[10px] uppercase tracking-wider text-white/45">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function BaselineRecommendationReveal({
  runtimeSummary,
}: {
  runtimeSummary: ProgramRuntimeSummary;
}) {
  const details = getRecommendationRevealDetails(
    runtimeSummary.latest_recommendation,
  );
  const hasRecommendation = Boolean(details);

  return (
    <section className="rounded-3xl border border-brand-50/20 bg-brand-50/[0.07] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-brand-50/75">
            Recommendation reveal
          </p>
          <h2 className="mt-1 text-xl font-semibold leading-tight text-white">
            Baseline Day 21 next-step placeholder
          </h2>
        </div>
        <span className="rounded-full border border-brand-50/25 bg-brand-50/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-50">
          Day 21
        </span>
      </div>

      {details ? (
        <>
          <p className="mt-3 text-sm leading-relaxed text-white/68">
            A stored recommendation is available. Fine Diet will keep this as a
            review step until the recommendation logic is connected.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <RecommendationRevealRow
              label="Action type"
              value={details.actionType ?? 'Not set'}
            />
            <RecommendationRevealRow
              label="Recommended step"
              value={formatRecommendedStepLabel(details.recommendedStep)}
            />
            <RecommendationRevealRow label="Status" value={details.status} />
            <RecommendationRevealRow
              label="Reason"
              value={details.reasonSnippet ?? 'Not set'}
            />
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4">
          <p className="text-sm font-semibold text-white">
            Your next step is being prepared.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-white/60">
            Fine Diet will use your Baseline signals to suggest the next best
            path.
          </p>
        </div>
      )}

      <button
        type="button"
        disabled
        className="mt-4 rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-white/60 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {hasRecommendation ? 'Review next step' : 'Check back soon'}
      </button>
    </section>
  );
}

function ProgramActiveSkeleton({
  runtimeSummary,
  progressSummary,
  deliveryModules,
  onCheckinHandled,
}: {
  runtimeSummary: ProgramRuntimeSummary;
  progressSummary: ProgramProgressSummary | null;
  deliveryModules: ProgramDeliveryModuleDefinition[];
  onCheckinHandled: (summary: ProgramRuntimeSummary) => void;
}) {
  const showCheckinDue = isCheckinDue(runtimeSummary);
  const day21Handled = isDay21Handled(runtimeSummary);

  return (
    <section className="space-y-4">
      <ProgramDeliveryModules
        runtimeSummary={runtimeSummary}
        progressSummary={progressSummary}
        modules={deliveryModules}
        checkinDue={showCheckinDue}
        day21Handled={day21Handled}
        anchors={{
          checkin: CHECKIN_ANCHOR_ID,
          recommendation: RECOMMENDATION_ANCHOR_ID,
        }}
      />
      {showCheckinDue && (
        <div id={CHECKIN_ANCHOR_ID}>
          <ProgramCheckinPanel
            runtimeSummary={runtimeSummary}
            onHandled={onCheckinHandled}
          />
        </div>
      )}
    </section>
  );
}

function ProgramRuntimeStateSection({
  data,
  runtimeSummary,
  progressSummary,
  prepDeliveryModules,
  weekDeliveryModules,
  runtimeError,
  onRuntimeSummaryUpdate,
}: {
  data: ProgramLibraryDetail;
  runtimeSummary: ProgramRuntimeSummary | null;
  progressSummary: ProgramProgressSummary | null;
  prepDeliveryModules: ProgramDeliveryModuleDefinition[];
  weekDeliveryModules: ProgramDeliveryModuleDefinition[];
  runtimeError: string | null;
  onRuntimeSummaryUpdate: (summary: ProgramRuntimeSummary) => void;
}) {
  const hasAccess =
    data.has_entitlement || data.access_state === 'assigned_only';

  if (runtimeError) {
    return (
      <section className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4">
        <p className="text-sm font-semibold text-white">
          Runtime state unavailable.
        </p>
        <p className="mt-1 text-xs leading-snug text-white/60">
          Program content is still visible below, but enrollment state could not
          be confirmed.
        </p>
      </section>
    );
  }

  const state = resolveProgramDetailRuntimeState({
    inLibrary: true,
    hasAccess,
    summary: runtimeSummary,
  });
  // The Day-21 recommendation reveal is Baseline-specific (P4 generalizes it).
  const isBaselineProgram = data.slug === BASELINE_SLUG;
  const showRecommendationReveal =
    isBaselineProgram && shouldShowRecommendationReveal(runtimeSummary);

  if (state === 'start_ready') {
    return (
      <section className="rounded-2xl border border-sky-300/15 bg-sky-400/5 p-4">
        <p className="text-sm font-semibold text-white">
          Access active, no enrollment yet.
        </p>
        <p className="mt-1 text-xs leading-snug text-white/60">
          Start {data.title} from the Programs page to choose your date and
          capacity.
        </p>
        <Link
          href={APP_ROUTES.programs}
          className="mt-3 inline-flex rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-900"
        >
          Start from Programs
        </Link>
      </section>
    );
  }

  if (state === 'pre_start') {
    return (
      <>
        <section className="rounded-2xl border border-sky-300/15 bg-sky-400/5 p-4">
          <p className="text-sm font-semibold text-white">
            Prepare for {data.title}
          </p>
          <p className="mt-1 text-xs leading-snug text-white/60">
            Your selected start date is set. Use this space for orientation and
            setup before day 1.
          </p>
        </section>
        <ProgramDeliveryModules
          runtimeSummary={runtimeSummary}
          progressSummary={progressSummary}
          modules={prepDeliveryModules}
        />
      </>
    );
  }

  if (state === 'active' && runtimeSummary) {
    return (
      <>
        <section className="rounded-2xl border border-emerald-300/15 bg-emerald-400/5 p-4">
          <p className="text-sm font-semibold text-white">
            Continue {data.title}
          </p>
          <p className="mt-1 text-xs leading-snug text-white/60">
            You are on day {runtimeSummary.current_day}. Continue with today&apos;s
            focus and any available content below.
          </p>
        </section>
        <ProgramActiveSkeleton
          runtimeSummary={runtimeSummary}
          progressSummary={progressSummary}
          deliveryModules={weekDeliveryModules}
          onCheckinHandled={onRuntimeSummaryUpdate}
        />
        {showRecommendationReveal && (
          <div id={RECOMMENDATION_ANCHOR_ID}>
            <BaselineRecommendationReveal runtimeSummary={runtimeSummary} />
          </div>
        )}
        <ProgramDeliveryModules
          runtimeSummary={runtimeSummary}
          progressSummary={progressSummary}
          modules={prepDeliveryModules}
        />
      </>
    );
  }

  if (state === 'paused') {
    return (
      <section className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4">
        <p className="text-sm font-semibold text-white">
          {data.title} is paused.
        </p>
        <p className="mt-1 text-xs leading-snug text-white/60">
          Runtime day progression is paused. Content remains visible while the
          pause state is active.
        </p>
      </section>
    );
  }

  if (state === 'completed' && runtimeSummary) {
    return (
      <>
        <section className="rounded-2xl border border-brand-50/20 bg-brand-50/10 p-4">
          <p className="text-sm font-semibold text-white">
            {data.title} complete.
          </p>
          <p className="mt-1 text-xs leading-snug text-white/60">
            {data.title} is complete. Any next-step review remains informational
            until recommendation logic is connected.
          </p>
        </section>
        {showRecommendationReveal && (
          <div id={RECOMMENDATION_ANCHOR_ID}>
            <BaselineRecommendationReveal runtimeSummary={runtimeSummary} />
          </div>
        )}
      </>
    );
  }

  if (state === 'cancelled') {
    return (
      <section className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
        <p className="text-sm font-semibold text-white">
          This {data.title} enrollment is closed.
        </p>
        <p className="mt-1 text-xs leading-snug text-white/55">
          Return to Programs when a new start path is available.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
      <p className="text-sm font-semibold text-white">
        {data.title} is not available in this library.
      </p>
    </section>
  );
}

function moduleKindLabel(kind: string): string {
  switch (kind) {
    case 'video':
      return 'Video';
    case 'worksheet':
      return 'Worksheet';
    case 'article':
      return 'Article';
    case 'guidance':
      return 'Guidance';
    case 'milestone':
      return 'Milestone';
    default:
      return 'Section';
  }
}

interface ItemStateEntry {
  module_id: string;
  status: ProgramProgressStatus;
  last_viewed_at: string | null;
}

function buildItemStateMap(
  summary: ProgramProgressSummary | null,
): Map<string, ItemStateEntry> {
  const map = new Map<string, ItemStateEntry>();
  if (!summary) return map;
  for (const m of summary.modules) {
    for (const it of m.item_states) {
      map.set(it.content_item_id, {
        module_id: m.module_id,
        status: it.status,
        last_viewed_at: it.last_viewed_at,
      });
    }
  }
  return map;
}

function StatusPill({ status }: { status: ProgramProgressStatus }) {
  const map: Record<ProgramProgressStatus, { label: string; className: string }> = {
    not_started: {
      label: 'Not started',
      className: 'border-white/10 bg-white/[0.04] text-white/55',
    },
    in_progress: {
      label: 'In progress',
      className: 'border-amber-300/30 bg-amber-400/10 text-amber-200',
    },
    completed: {
      label: 'Completed',
      className: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200',
    },
  };
  const m = map[status];
  return (
    <span
      className={`inline-flex items-center text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${m.className}`}
    >
      {m.label}
    </span>
  );
}

function AssignmentListItem({ a }: { a: ProgramLibraryAssignmentView }) {
  const from = formatDate(a.active_from);
  const to = formatDate(a.active_to);
  return (
    <li className="flex items-start justify-between gap-3 py-2 border-b border-white/[0.05] last:border-b-0">
      <div>
        <p className="text-xs text-white/80">
          {from && to
            ? `${from} – ${to}`
            : from
              ? `Starts ${from}`
              : to
                ? `Through ${to}`
                : 'No date range'}
        </p>
        <p className="text-[11px] text-white/45 mt-0.5">
          From {a.acquisition_source.replace(/_/g, ' ')}
        </p>
      </div>
      <StateBadge state={a.runtime_state} />
    </li>
  );
}

export default function JournalProgramDetailBySlugPage() {
  const router = useRouter();
  const { slug } = router.query;
  const slugStr = typeof slug === 'string' ? slug : null;

  const [data, setData] = useState<ProgramLibraryDetail | null>(null);
  const [runtimeSummary, setRuntimeSummary] =
    useState<ProgramRuntimeSummary | null>(null);
  const [progressSummary, setProgressSummary] =
    useState<ProgramProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [deliveryModules, setDeliveryModules] =
    useState<ProgramDeliveryModuleDefinition[] | null>(null);

  useEffect(() => {
    if (!slugStr) return;
    setLoading(true);
    setError(null);
    setRuntimeError(null);
    setNotFound(false);
    setData(null);
    setRuntimeSummary(null);
    setProgressSummary(null);
    setDeliveryModules(null);
    (async () => {
      try {
        const resp = await fetch(
          `/api/journal/programs/${encodeURIComponent(slugStr)}`,
        );
        if (resp.status === 404) {
          setNotFound(true);
          return;
        }
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body.error ?? 'Failed to load program.');
        }
        const detail = (await resp.json()) as ProgramLibraryDetail;
        setData(detail);
        setProgressSummary(detail.progress_summary ?? null);

        try {
          const runtimeResp = await fetch('/api/journal/programs/runtime-summary');
          if (!runtimeResp.ok) {
            const body = await runtimeResp.json().catch(() => ({}));
            throw new Error(body.error ?? 'Failed to load runtime summary.');
          }
          const runtimeBody =
            (await runtimeResp.json()) as ProgramRuntimeSummaryList;
          const summary =
            runtimeBody.summaries.find((s) => s.program.slug === slugStr) ??
            null;
          setRuntimeSummary(summary);

          // Fetch delivery modules for any runtime-enabled program (or any
          // program the caller is enrolled in). The API resolves DB-published
          // modules first, then a code-owned set; on network failure we fall
          // back to the code-owned set for that slug (if registered).
          if (isProgramRuntimeEnabled(slugStr) || summary) {
            const versionParam = summary?.version.id
              ? `?version_id=${encodeURIComponent(summary.version.id)}`
              : '';
            const deliveryResp = await fetch(
              `/api/journal/programs/${encodeURIComponent(
                slugStr,
              )}/delivery-modules${versionParam}`,
            );
            if (deliveryResp.ok) {
              const deliveryBody = (await deliveryResp.json()) as {
                modules: ProgramDeliveryModuleDefinition[];
              };
              setDeliveryModules(deliveryBody.modules);
            } else {
              setDeliveryModules(
                getCodeDeliveryModuleSet(slugStr)?.modules ?? [],
              );
            }
          }
        } catch (runtimeErr) {
          setRuntimeError(
            runtimeErr instanceof Error
              ? runtimeErr.message
              : 'Failed to load runtime summary.',
          );
          if (isProgramRuntimeEnabled(slugStr)) {
            setDeliveryModules(
              getCodeDeliveryModuleSet(slugStr)?.modules ?? [],
            );
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load.');
      } finally {
        setLoading(false);
      }
    })();
  }, [slugStr]);

  const itemStates = useMemo(
    () => buildItemStateMap(progressSummary),
    [progressSummary],
  );
  const moduleCounts = useMemo(() => {
    const m = new Map<
      string,
      { total: number; completed: number; in_progress: number }
    >();
    if (!progressSummary) return m;
    for (const row of progressSummary.modules) {
      m.set(row.module_id, {
        total: row.items_total,
        completed: row.items_completed,
        in_progress: row.items_in_progress,
      });
    }
    return m;
  }, [progressSummary]);

  async function setItemStatus(
    itemId: string,
    status: ProgramProgressStatus,
  ): Promise<void> {
    setPendingItemId(itemId);
    setProgressError(null);
    try {
      const resp = await fetch(
        `/api/journal/programs/items/${encodeURIComponent(itemId)}/progress`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        },
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Could not update progress.');
      }
      const result = (await resp.json()) as {
        progress: ProgramContentProgress;
        summary: ProgramProgressSummary;
      };
      setProgressSummary(result.summary);
    } catch (err) {
      setProgressError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setPendingItemId(null);
    }
  }

  const dateRange = data?.primary_assignment?.active_from
    ? (() => {
        const from = formatDate(data.primary_assignment!.active_from);
        const to = formatDate(data.primary_assignment!.active_to);
        return to ? `${from} – ${to}` : `Starts ${from}`;
      })()
    : null;
  const isRuntimeProgram =
    isProgramRuntimeEnabled(slugStr) || Boolean(runtimeSummary);
  const allDeliveryModules =
    deliveryModules ??
    getCodeDeliveryModuleSet(slugStr ?? '')?.modules ??
    [];
  const prepDeliveryModules = allDeliveryModules.filter(
    (module) => module.moduleType === 'prep' || module.moduleType === 'roadmap',
  );
  const weekDeliveryModules = allDeliveryModules.filter(
    (module) => module.moduleType !== 'prep' && module.moduleType !== 'roadmap',
  );

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-[calc(8rem+env(safe-area-inset-bottom,0px))]">
        <div className="w-full max-w-[650px] mx-auto px-5 pt-14">
          <Link
            href={APP_ROUTES.programs}
            className="text-xs text-white/60 hover:text-white inline-block mb-4"
          >
            ← Programs
          </Link>

          {loading && (
            <div className="rounded-2xl bg-white/[0.04] p-5 animate-pulse">
              <div className="h-5 w-40 bg-white/[0.06] rounded mb-3" />
              <div className="h-3 w-56 bg-white/[0.06] rounded" />
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-200">
              {error}
            </div>
          )}

          {notFound && (
            <div className="rounded-2xl bg-white/[0.04] border border-white/[0.06] p-5">
              <p className="text-sm text-white/80">
                This program isn&apos;t in your library.
              </p>
              <p className="text-xs text-white/50 mt-1">
                Either you don&apos;t have access yet or the program slug is
                unknown.
              </p>
              <Link
                href={APP_ROUTES.programs}
                className="inline-block mt-3 text-xs text-white/70 underline underline-offset-2 hover:text-white"
              >
                Back to your library
              </Link>
            </div>
          )}

          {!loading && !error && !notFound && data && (
            isRuntimeProgram ? (
              <ProgramRuntimeHeader
                data={data}
                runtimeSummary={runtimeSummary}
                progressSummary={progressSummary}
                runtimeError={runtimeError}
              />
            ) : (
              <>
              <div className="flex items-start justify-between gap-3 mb-1">
                <div>
                  <h1 className="text-2xl font-semibold antialiased">
                    {data.title}
                  </h1>
                  {data.tagline && (
                    <p className="text-sm text-white/65 mt-1 leading-snug">
                      {data.tagline}
                    </p>
                  )}
                </div>
                <StateBadge state={data.runtime_state} />
              </div>
              {dateRange && (
                <p className="text-xs text-white/55 mt-1">{dateRange}</p>
              )}
              <p className="text-[11px] text-white/40 mt-1 font-mono">
                {data.slug}
              </p>
              </>
            )
          )}
        </div>

        {!loading && !error && !notFound && data && (
          <div className="w-full max-w-[650px] mx-auto px-5 mt-6 space-y-6">
            {isRuntimeProgram && (
              <ProgramRuntimeStateSection
                data={data}
                runtimeSummary={runtimeSummary}
                progressSummary={progressSummary}
                prepDeliveryModules={prepDeliveryModules}
                weekDeliveryModules={weekDeliveryModules}
                runtimeError={runtimeError}
                onRuntimeSummaryUpdate={setRuntimeSummary}
              />
            )}

            {data.description && (
              <section className="rounded-2xl bg-white/[0.04] border border-white/[0.06] p-4">
                <p className="text-sm text-white/80 leading-relaxed">
                  {data.description}
                </p>
              </section>
            )}

            {progressSummary && progressSummary.items_total > 0 && (
              <section
                className={`rounded-2xl border p-4 ${
                  progressSummary.aggregate_status === 'completed'
                    ? 'bg-emerald-400/5 border-emerald-300/20'
                    : 'bg-white/[0.04] border-white/[0.06]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-white/55">
                      Your progress
                    </p>
                    <p className="text-sm text-white/85 mt-1">
                      {progressSummary.aggregate_status === 'completed'
                        ? `You've finished every item in this program.`
                        : progressSummary.aggregate_status === 'in_progress'
                          ? `${progressSummary.items_completed} of ${progressSummary.items_total} items complete (${progressSummary.percent_complete}%).`
                          : `${progressSummary.items_total} items ready. Start when you're ready.`}
                    </p>
                  </div>
                  {progressSummary.resume_content_item_id && (
                    <a
                      href={`#item-${progressSummary.resume_content_item_id}`}
                      className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.1]"
                    >
                      {progressSummary.aggregate_status === 'in_progress'
                        ? 'Continue'
                        : 'Start journey'}
                    </a>
                  )}
                </div>
                <div
                  className="mt-3 h-1.5 rounded-full bg-white/[0.06] overflow-hidden"
                  aria-hidden
                >
                  <div
                    className="h-full bg-emerald-400/80"
                    style={{
                      width: `${Math.min(100, Math.max(0, progressSummary.percent_complete))}%`,
                    }}
                  />
                </div>
                {progressError && (
                  <p className="text-[11px] text-red-300 mt-2">
                    {progressError}
                  </p>
                )}
              </section>
            )}

            {data.runtime_state === 'active_now' &&
              data.impact_bullets.length > 0 && (
                <section>
                  <h2 className="text-[11px] uppercase tracking-wider text-white/50 mb-2">
                    Currently affecting your plan
                  </h2>
                  <ul className="rounded-2xl bg-white/[0.04] border border-white/[0.06] p-4 space-y-2">
                    {data.impact_bullets.map((b, idx) => (
                      <li
                        key={`${b.kind}-${idx}`}
                        className="text-sm text-white/85 flex items-start gap-2"
                      >
                        <span
                          className="mt-[7px] w-1 h-1 rounded-full bg-white/50 shrink-0"
                          aria-hidden
                        />
                        <span>{b.text}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2">
                    <Link
                      href={APP_ROUTES.plans}
                      className="text-xs text-white/70 underline underline-offset-2 hover:text-white"
                    >
                      Open your plan →
                    </Link>
                  </div>
                </section>
              )}

            {data.runtime_state === 'scheduled' && (
              <section className="rounded-2xl bg-sky-400/5 border border-sky-300/15 p-4">
                <p className="text-sm text-white/85">
                  This program hasn&apos;t started yet. It will begin to shape
                  your plan on its active date.
                </p>
              </section>
            )}

            {!isRuntimeProgram &&
              data.runtime_state !== 'active_now' &&
              data.runtime_state !== 'scheduled' &&
              data.has_entitlement && (
                <section className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
                  <p className="text-sm text-white/80">
                    You have access to this program, but it isn&apos;t
                    currently running on your plan.
                  </p>
                  <p className="text-xs text-white/50 mt-1">
                    When it&apos;s active, plan effects will show up here and
                    in your Plans view.
                  </p>
                </section>
              )}

            <section>
              <h2 className="text-[11px] uppercase tracking-wider text-white/50 mb-2">
                Program content
              </h2>
              {data.managed_content &&
              data.managed_content.modules.length > 0 ? (
                <div className="rounded-2xl bg-white/[0.04] border border-white/[0.06] divide-y divide-white/[0.05]">
                  {data.managed_content.modules.map((m, mIdx) => {
                    const counts = moduleCounts.get(m.id);
                    return (
                    <div key={m.id} className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <p className="text-[11px] uppercase tracking-wider text-white/45">
                            Module {mIdx + 1}
                          </p>
                          <p className="text-sm font-semibold text-white">
                            {m.title}
                          </p>
                          {m.description && (
                            <p className="text-xs text-white/65 mt-0.5 leading-snug">
                              {m.description}
                            </p>
                          )}
                        </div>
                        {counts && counts.total > 0 && (
                          <span className="shrink-0 text-[11px] text-white/55 border border-white/10 rounded-full px-2 py-0.5 whitespace-nowrap">
                            {counts.completed}/{counts.total} done
                          </span>
                        )}
                      </div>
                      {m.items.length === 0 ? (
                        <p className="text-[11px] text-white/40 italic">
                          More content coming soon.
                        </p>
                      ) : (
                        <ol className="space-y-2 mt-2">
                          {m.items.map((it) => {
                            const state =
                              itemStates.get(it.id)?.status ?? 'not_started';
                            const isPending = pendingItemId === it.id;
                            const isResume =
                              progressSummary?.resume_content_item_id === it.id;
                            return (
                            <li
                              key={it.id}
                              id={`item-${it.id}`}
                              className={`rounded-xl border p-3 ${
                                isResume
                                  ? 'bg-white/[0.06] border-white/20'
                                  : state === 'completed'
                                    ? 'bg-white/[0.02] border-white/[0.05]'
                                    : 'bg-white/[0.03] border-white/[0.05]'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-white/55 border border-white/10 rounded-full px-2 py-0.5">
                                      {moduleKindLabel(it.item_type)}
                                    </span>
                                    <StatusPill status={state} />
                                    {it.estimated_minutes != null && (
                                      <span className="text-[11px] text-white/40">
                                        ~{it.estimated_minutes} min
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-white mt-1">
                                    {it.title}
                                  </p>
                                  {it.summary && (
                                    <p className="text-xs text-white/65 mt-0.5 leading-snug">
                                      {it.summary}
                                    </p>
                                  )}
                                  {it.item_type === 'video' &&
                                    it.video_url && (
                                      <a
                                        href={it.video_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={() => {
                                          if (state === 'not_started') {
                                            void setItemStatus(
                                              it.id,
                                              'in_progress',
                                            );
                                          }
                                        }}
                                        className="inline-block mt-2 text-xs text-white/80 underline underline-offset-2 hover:text-white"
                                      >
                                        Watch video →
                                      </a>
                                    )}
                                  {(it.item_type === 'article' ||
                                    it.item_type === 'guidance') &&
                                    it.body && (
                                      <p className="text-xs text-white/70 mt-2 whitespace-pre-wrap leading-relaxed">
                                        {it.body}
                                      </p>
                                    )}
                                  <div className="mt-3 flex flex-wrap items-center gap-2">
                                    {state === 'not_started' && (
                                      <button
                                        type="button"
                                        disabled={isPending}
                                        onClick={() =>
                                          setItemStatus(it.id, 'in_progress')
                                        }
                                        className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.1] disabled:opacity-50"
                                      >
                                        {isPending ? 'Saving…' : 'Start'}
                                      </button>
                                    )}
                                    {state === 'in_progress' && (
                                      <>
                                        <button
                                          type="button"
                                          disabled={isPending}
                                          onClick={() =>
                                            setItemStatus(it.id, 'completed')
                                          }
                                          className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-emerald-300/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15 disabled:opacity-50"
                                        >
                                          {isPending
                                            ? 'Saving…'
                                            : 'Mark complete'}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={isPending}
                                          onClick={() =>
                                            setItemStatus(it.id, 'not_started')
                                          }
                                          className="text-[11px] text-white/55 hover:text-white underline underline-offset-2 disabled:opacity-50"
                                        >
                                          Reset
                                        </button>
                                      </>
                                    )}
                                    {state === 'completed' && (
                                      <button
                                        type="button"
                                        disabled={isPending}
                                        onClick={() =>
                                          setItemStatus(it.id, 'in_progress')
                                        }
                                        className="text-[11px] text-white/55 hover:text-white underline underline-offset-2 disabled:opacity-50"
                                      >
                                        {isPending ? 'Saving…' : 'Reopen'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </li>
                            );
                          })}
                        </ol>
                      )}
                    </div>
                    );
                  })}
                </div>
              ) : data.modules.length === 0 ? (
                <div className="rounded-2xl bg-white/[0.04] border border-white/[0.06] p-4">
                  <p className="text-sm text-white/70">
                    Program content details are coming soon.
                  </p>
                  <p className="text-[11px] text-white/45 mt-1">
                    This section will show the program&apos;s modules and
                    resources.
                  </p>
                </div>
              ) : (
                <ol className="rounded-2xl bg-white/[0.04] border border-white/[0.06] p-2 divide-y divide-white/[0.05]">
                  {data.modules.map((m) => (
                    <li key={m.id} className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-white">
                            {m.title}
                          </p>
                          {m.summary && (
                            <p className="text-xs text-white/65 mt-0.5 leading-snug">
                              {m.summary}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-[11px] uppercase tracking-wider text-white/50 border border-white/10 rounded-full px-2 py-0.5">
                          {moduleKindLabel(m.kind)}
                        </span>
                      </div>
                      {m.estimated_minutes != null && (
                        <p className="text-[11px] text-white/40 mt-1">
                          ~{m.estimated_minutes} min
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {data.assignments.length > 0 && (
              <section>
                <h2 className="text-[11px] uppercase tracking-wider text-white/50 mb-2">
                  Program history
                </h2>
                <ul className="rounded-2xl bg-white/[0.04] border border-white/[0.06] px-4 py-1">
                  {data.assignments.map((a) => (
                    <AssignmentListItem key={a.id} a={a} />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>

      <JournalFooterNav />
    </div>
  );
}
