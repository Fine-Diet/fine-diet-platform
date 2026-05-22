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
import { APP_ROUTES } from '@/lib/routes/appRoutes';
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
  const [progressSummary, setProgressSummary] =
    useState<ProgramProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);

  useEffect(() => {
    if (!slugStr) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
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

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
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
          )}
        </div>

        {!loading && !error && !notFound && data && (
          <div className="w-full max-w-[650px] mx-auto px-5 mt-6 space-y-6">
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

            {data.runtime_state !== 'active_now' &&
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
