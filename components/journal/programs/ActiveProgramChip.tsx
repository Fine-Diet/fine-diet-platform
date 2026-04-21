/**
 * ActiveProgramChip — Plans-adjacent compact summary (Phase 10).
 *
 * Lightweight banner shown inside /journal/plans above the week view.
 * Its job is to help the user understand *why* their plan looks the
 * way it does. Stays quiet if no program is active.
 */

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ProgramRuntimeSummary } from '@/lib/plans/programRuntimeSummaryServerService';

interface Props {
  /** Max bullets to inline. Defaults to 2 for tight banner layout. */
  maxBullets?: number;
  /** Optional detail href. */
  detailHref?: string;
  /** Extra className for outer wrapper. */
  className?: string;
}

export default function ActiveProgramChip({
  maxBullets = 2,
  detailHref,
  className = '',
}: Props) {
  const [data, setData] = useState<ProgramRuntimeSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch('/api/journal/program-runtime/summary');
        if (!resp.ok) return;
        const body = (await resp.json()) as ProgramRuntimeSummary;
        if (!cancelled) setData(body);
      } catch {
        /* silent — non-essential chip */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;
  if (!data || data.active.length === 0) return null;

  const primary = data.active[0];
  const bullets = data.impact_bullets.slice(0, maxBullets);

  return (
    <div
      className={
        'rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 py-3 flex flex-wrap items-start gap-x-3 gap-y-2 '
        + className
      }
    >
      <div className="flex items-center gap-2">
        <span
          className="w-1.5 h-1.5 rounded-full bg-emerald-300"
          aria-hidden
        />
        <span className="text-[11px] uppercase tracking-wider text-emerald-200">
          Program active
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white antialiased">
          <strong className="font-semibold">{primary.program_title}</strong>
          {bullets.length > 0 && (
            <span className="text-white/70">
              {' '}
              — {bullets.map((b) => b.text.replace(/\.$/, '')).join(' · ')}.
            </span>
          )}
        </p>
        {data.active.length + data.scheduled.length > 1 && (
          <p className="text-[11px] text-white/50 mt-0.5">
            Plus {data.active.length + data.scheduled.length - 1} other
            affecting your plan.
          </p>
        )}
      </div>
      {detailHref && (
        <Link
          href={detailHref}
          className="text-xs text-white/70 underline underline-offset-2 hover:text-white whitespace-nowrap"
        >
          Details
        </Link>
      )}
    </div>
  );
}
