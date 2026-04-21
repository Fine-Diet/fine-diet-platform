'use client';

/**
 * /journal/programs — Phase 11 user-facing Program Library
 *
 * Lists every program the signed-in user has access to (entitled or
 * assigned) with a clear runtime badge and a headline of how (if at
 * all) the program is shaping their plan right now. Cards link to the
 * per-program detail page. Empty state nudges the user to browse
 * public program content when they have no access.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import type {
  ProgramLibrary,
  ProgramLibraryEntry,
  ProgramRuntimeState,
} from '@/lib/programs/programLibraryServerService';

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
      {state === 'active_now' && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-emerald-300"
          aria-hidden
        />
      )}
      {state === 'scheduled' && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-sky-300"
          aria-hidden
        />
      )}
      {m.label}
    </span>
  );
}

function LibraryCard({ entry }: { entry: ProgramLibraryEntry }) {
  const dateRange = entry.primary_assignment?.active_from
    ? formatRange(
        entry.primary_assignment.active_from,
        entry.primary_assignment.active_to,
      )
    : null;

  return (
    <Link
      href={`/journal/programs/${entry.slug}`}
      className="block rounded-2xl bg-white/[0.04] border border-white/[0.06] p-4 transition-colors hover:bg-white/[0.06]"
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h3 className="text-base font-semibold text-white antialiased">
            {entry.title}
          </h3>
          {entry.tagline && (
            <p className="text-xs text-white/60 mt-0.5 leading-snug">
              {entry.tagline}
            </p>
          )}
        </div>
        <StateBadge state={entry.runtime_state} />
      </div>
      {dateRange && (
        <p className="text-[11px] text-white/50 mt-1">{dateRange}</p>
      )}
      {entry.impact_headline && (
        <p className="text-[13px] text-white/80 mt-2 leading-snug">
          {entry.impact_headline}
        </p>
      )}
      {entry.access_state === 'entitled' && !entry.primary_assignment && (
        <p className="text-[11px] text-white/50 mt-2">
          You have access — not currently running.
        </p>
      )}
      {entry.progress && entry.progress.items_total > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] text-white/60">
            <span>
              {entry.progress.aggregate_status === 'completed'
                ? 'Completed'
                : entry.progress.aggregate_status === 'in_progress'
                  ? 'Continue'
                  : 'Start journey'}
            </span>
            <span>
              {entry.progress.items_completed} / {entry.progress.items_total}
              {entry.progress.items_total > 0 &&
                ` · ${entry.progress.percent_complete}%`}
            </span>
          </div>
          <div
            className="mt-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden"
            aria-hidden
          >
            <div
              className="h-full bg-emerald-400/80"
              style={{
                width: `${Math.min(100, Math.max(0, entry.progress.percent_complete))}%`,
              }}
            />
          </div>
        </div>
      )}
      {entry.is_catalogue_stub && !entry.progress && (
        <p className="text-[11px] text-white/40 mt-2">
          Program content details coming soon.
        </p>
      )}
    </Link>
  );
}

function formatRange(from: string, to: string | null): string {
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
  return to ? `${fmt(from)} – ${fmt(to)}` : `Starts ${fmt(from)}`;
}

export default function JournalProgramsLibraryPage() {
  const [data, setData] = useState<ProgramLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch('/api/journal/programs/library');
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body.error ?? 'Failed to load library.');
        }
        setData((await resp.json()) as ProgramLibrary);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const { active, scheduled, other } = useMemo(() => {
    const all = data?.entries ?? [];
    return {
      active: all.filter((e) => e.runtime_state === 'active_now'),
      scheduled: all.filter((e) => e.runtime_state === 'scheduled'),
      other: all.filter(
        (e) =>
          e.runtime_state !== 'active_now' && e.runtime_state !== 'scheduled',
      ),
    };
  }, [data]);

  const isEmpty = !loading && data && data.entries.length === 0;

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="w-full max-w-[650px] mx-auto px-5 pt-14">
          <Link
            href="/journal/home"
            className="text-xs text-white/60 hover:text-white inline-block mb-4"
          >
            ← Home
          </Link>
          <h1 className="text-2xl font-semibold antialiased">Programs</h1>
          <p className="text-sm text-white/60 antialiased mt-1">
            Programs you have access to and are running.
          </p>
        </div>

        <div className="w-full max-w-[650px] mx-auto px-5 mt-6 space-y-6">
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

          {isEmpty && (
            <div className="rounded-2xl bg-white/[0.04] border border-white/[0.06] p-5">
              <p className="text-sm text-white/80">
                You don&apos;t have any programs yet.
              </p>
              <p className="text-xs text-white/50 mt-1">
                Programs you purchase or are granted access to will appear
                here.
              </p>
              <Link
                href="/programs"
                className="inline-block mt-3 text-xs text-white/70 underline underline-offset-2 hover:text-white"
              >
                Browse programs →
              </Link>
            </div>
          )}

          {!loading && active.length > 0 && (
            <section>
              <h2 className="text-[11px] uppercase tracking-wider text-white/50 mb-2">
                Running now
              </h2>
              <div className="space-y-2">
                {active.map((e) => (
                  <LibraryCard key={e.slug} entry={e} />
                ))}
              </div>
            </section>
          )}

          {!loading && scheduled.length > 0 && (
            <section>
              <h2 className="text-[11px] uppercase tracking-wider text-white/50 mb-2">
                Scheduled
              </h2>
              <div className="space-y-2">
                {scheduled.map((e) => (
                  <LibraryCard key={e.slug} entry={e} />
                ))}
              </div>
            </section>
          )}

          {!loading && other.length > 0 && (
            <section>
              <h2 className="text-[11px] uppercase tracking-wider text-white/50 mb-2">
                Your library
              </h2>
              <div className="space-y-2">
                {other.map((e) => (
                  <LibraryCard key={e.slug} entry={e} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <JournalFooterNav />
    </div>
  );
}
