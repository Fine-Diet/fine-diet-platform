/**
 * ActiveProgramCard — Phase 10 user-facing runtime visibility
 *
 * Primary surface that tells an authenticated user which program is
 * currently influencing them, whether it's active or scheduled, its
 * effective date window, and 1–3 plain-language bullets of what it's
 * doing to their Plans experience. Read-only and self-contained.
 *
 * Designed to live on the Journal home surface. Renders nothing (null)
 * when the user has no active or scheduled assignments so the Home
 * layout doesn't show an empty-state card.
 */

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  ProgramRuntimeSummary,
  UserProgramAssignmentView,
} from '@/lib/plans/programRuntimeSummaryServerService';

interface Props {
  /** Max impact bullets to render. Defaults to 3. */
  maxBullets?: number;
  /** If true, render a "no active program" empty-state instead of null. */
  showEmpty?: boolean;
  /** Optional detail-view href (e.g. /journal/profile/program). */
  detailHref?: string;
  /** Extra className for outer wrapper (optional). */
  className?: string;
}

function formatDateRange(
  from: string | null,
  to: string | null,
): string | null {
  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  if (from) return `Starts ${fmt(from)}`;
  if (to) return `Through ${fmt(to)}`;
  return null;
}

function AssignmentPill({
  assignment,
}: {
  assignment: UserProgramAssignmentView;
}) {
  const isActive = assignment.runtime_state === 'active_now';
  return (
    <div className="flex items-center gap-2">
      <span
        className={
          'inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full border '
          + (isActive
            ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'
            : 'border-sky-300/30 bg-sky-400/10 text-sky-200')
        }
      >
        <span
          className={
            'w-1.5 h-1.5 rounded-full '
            + (isActive ? 'bg-emerald-300' : 'bg-sky-300')
          }
          aria-hidden
        />
        {isActive ? 'Active' : 'Scheduled'}
      </span>
    </div>
  );
}

export default function ActiveProgramCard({
  maxBullets = 3,
  showEmpty = false,
  detailHref,
  className = '',
}: Props) {
  const [data, setData] = useState<ProgramRuntimeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch('/api/journal/program-runtime/summary');
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body.error ?? 'Failed to load program summary.');
        }
        const body = (await resp.json()) as ProgramRuntimeSummary;
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div
        className={
          'rounded-2xl bg-white/[0.04] border border-white/[0.06] p-4 animate-pulse '
          + className
        }
      >
        <div className="h-3 w-24 bg-white/[0.06] rounded mb-3" />
        <div className="h-4 w-40 bg-white/[0.08] rounded mb-2" />
        <div className="h-3 w-56 bg-white/[0.06] rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={
          'rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-200 '
          + className
        }
      >
        {error}
      </div>
    );
  }

  if (!data || data.empty) {
    if (!showEmpty) return null;
    return (
      <div
        className={
          'rounded-2xl bg-white/[0.04] border border-white/[0.06] p-4 '
          + className
        }
      >
        <p className="text-[11px] uppercase tracking-wider text-white/50">
          Your program
        </p>
        <p className="text-sm text-white/80 mt-1">
          No program is currently influencing your plan.
        </p>
        <Link
          href="/programs"
          className="inline-block mt-3 text-xs text-white/70 underline underline-offset-2 hover:text-white"
        >
          Browse programs
        </Link>
      </div>
    );
  }

  const primary: UserProgramAssignmentView | undefined =
    data.active[0] ?? data.scheduled[0];
  const extras = [
    ...data.active.slice(primary && data.active.includes(primary) ? 1 : 0),
    ...data.scheduled.slice(
      primary && data.scheduled.includes(primary) ? 1 : 0,
    ),
  ];

  const bullets = data.impact_bullets.slice(0, maxBullets);
  const dateRange = primary
    ? formatDateRange(primary.active_from, primary.active_to)
    : null;

  return (
    <section
      className={
        'rounded-2xl bg-white/[0.04] border border-white/[0.06] p-4 '
        + className
      }
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-white/50">
            Your program
          </p>
          <h3 className="text-base font-semibold text-white antialiased mt-0.5">
            {primary?.program_title}
          </h3>
          {dateRange && (
            <p className="text-[11px] text-white/50 mt-0.5">{dateRange}</p>
          )}
        </div>
        {primary && <AssignmentPill assignment={primary} />}
      </div>

      {bullets.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {bullets.map((b, idx) => (
            <li
              key={`${b.kind}-${idx}`}
              className="text-[13px] leading-snug text-white/80 flex items-start gap-2"
            >
              <span className="mt-1 w-1 h-1 rounded-full bg-white/50" aria-hidden />
              <span>{b.text}</span>
            </li>
          ))}
        </ul>
      )}

      {extras.length > 0 && (
        <p className="mt-3 text-[11px] text-white/50">
          +{extras.length} more {extras.length === 1 ? 'program' : 'programs'}{' '}
          affecting your plan.
        </p>
      )}

      {detailHref && (
        <div className="mt-3">
          <Link
            href={detailHref}
            className="text-xs text-white/80 underline underline-offset-2 hover:text-white"
          >
            View details →
          </Link>
        </div>
      )}
    </section>
  );
}
