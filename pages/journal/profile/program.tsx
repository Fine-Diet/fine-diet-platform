'use client';

/**
 * /journal/profile/program — Phase 10 detail view
 *
 * Expanded, read-only view of the user's active program runtime. Shows:
 *   - each active or scheduled assignment with its status and dates
 *   - the full set of plan-impact bullets derived from inherited guidance
 *
 * Linked from ActiveProgramCard (home) and ActiveProgramChip (plans).
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import type {
  ProgramRuntimeSummary,
  UserProgramAssignmentView,
} from '@/lib/plans/programRuntimeSummaryServerService';

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

function AssignmentRow({ a }: { a: UserProgramAssignmentView }) {
  const isActive = a.runtime_state === 'active_now';
  const isScheduled = a.runtime_state === 'scheduled';
  const from = formatDate(a.active_from);
  const to = formatDate(a.active_to);
  const label = isActive ? 'Active now' : isScheduled ? 'Scheduled' : a.status;
  const pillClass = isActive
    ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'
    : isScheduled
      ? 'border-sky-300/30 bg-sky-400/10 text-sky-200'
      : 'border-white/10 bg-white/[0.04] text-white/60';

  return (
    <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4 flex items-start justify-between gap-3">
      <div>
        <p className="text-base font-semibold text-white">{a.program_title}</p>
        <p className="text-[11px] text-white/50 mt-0.5 font-mono">
          {a.program_slug}
        </p>
        {(from || to) && (
          <p className="text-xs text-white/60 mt-1">
            {from && to
              ? `${from} – ${to}`
              : from
                ? `Starts ${from}`
                : `Through ${to}`}
          </p>
        )}
      </div>
      <span
        className={`shrink-0 text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${pillClass}`}
      >
        {label}
      </span>
    </div>
  );
}

export default function JournalProgramDetailPage() {
  const [data, setData] = useState<ProgramRuntimeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch('/api/journal/program-runtime/summary');
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body.error ?? 'Failed to load summary.');
        }
        setData((await resp.json()) as ProgramRuntimeSummary);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="w-full max-w-[650px] mx-auto px-5 pt-14">
          <Link
            href="/journal/profile"
            className="text-xs text-white/60 hover:text-white inline-block mb-4"
          >
            ← Profile
          </Link>
          <h1 className="text-2xl font-semibold antialiased">Your program</h1>
          <p className="text-sm text-white/60 antialiased mt-1">
            How your active program is shaping your plan.
          </p>
        </div>

        <div className="w-full max-w-[650px] mx-auto px-5 mt-6 space-y-5">
          {loading && (
            <div className="rounded-2xl bg-white/[0.04] p-5 animate-pulse">
              <div className="h-4 w-40 bg-white/[0.06] rounded mb-3" />
              <div className="h-3 w-56 bg-white/[0.06] rounded" />
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-xs text-red-200">
              {error}
            </div>
          )}

          {!loading && data && data.empty && (
            <div className="rounded-2xl bg-white/[0.04] border border-white/[0.06] p-5">
              <p className="text-sm text-white/80">
                No program is currently influencing your plan.
              </p>
              <Link
                href="/programs"
                className="inline-block mt-3 text-xs text-white/70 underline underline-offset-2 hover:text-white"
              >
                Browse programs →
              </Link>
            </div>
          )}

          {!loading && data && !data.empty && (
            <>
              {data.active.length > 0 && (
                <section>
                  <h2 className="text-[11px] uppercase tracking-wider text-white/50 mb-2">
                    Active now
                  </h2>
                  <div className="space-y-2">
                    {data.active.map((a) => (
                      <AssignmentRow key={a.id} a={a} />
                    ))}
                  </div>
                </section>
              )}

              {data.scheduled.length > 0 && (
                <section>
                  <h2 className="text-[11px] uppercase tracking-wider text-white/50 mb-2">
                    Scheduled
                  </h2>
                  <div className="space-y-2">
                    {data.scheduled.map((a) => (
                      <AssignmentRow key={a.id} a={a} />
                    ))}
                  </div>
                </section>
              )}

              {data.impact_bullets.length > 0 && (
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
                </section>
              )}
            </>
          )}
        </div>
      </div>

      <JournalFooterNav />
    </div>
  );
}
