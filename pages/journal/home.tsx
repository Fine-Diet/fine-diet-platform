'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import {
  journalService,
  toDateKey,
  calculateDailyTotals,
  type JournalEntry,
} from '@/lib/journal';
import { InsightsIcon, NotebookIcon, SaveIcon } from '@/components/icons';

/* ------------------------------------------------------------------ */
/*  Verified route map — every href below has a matching page file     */
/*  pages/journal/log.tsx         → /journal/log                      */
/*  pages/journal.tsx             → /journal                          */
/*  pages/journal/insights.tsx    → /journal/insights                 */
/*  pages/journal/plans.tsx       → /journal/plans                    */
/*  pages/journal/profile.tsx     → /journal/profile                  */
/*  pages/account/assessments.tsx → /account/assessments              */
/*  pages/programs.tsx            → /programs                         */
/*  pages/shop.tsx                → /shop                             */
/*  pages/account/index.tsx       → /account                         */
/* ------------------------------------------------------------------ */

// ── Helpers ──────────────────────────────────────────────────────────

function formatTodayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Build date objects for the last 7 days (today first → 6 days ago last). */
function last7Days(): Date[] {
  const days: Date[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days.reverse(); // oldest first for sparkline L→R
}

const PLACEHOLDER_HEIGHTS = [28, 44, 36, 52, 40, 48, 32]; // visually varied

// ── Sparkline bars ───────────────────────────────────────────────────

function SparklineBars({
  values,
  loading,
}: {
  values: number[] | null; // 7 calorie totals, oldest→newest
  loading: boolean;
}) {
  // Determine max value for scaling (minimum 1 to avoid /0)
  const maxVal = values ? Math.max(...values, 1) : 1;

  return (
    <div className="flex items-end gap-[5px] h-14">
      {Array.from({ length: 7 }).map((_, i) => {
        if (loading || !values) {
          // Placeholder shimmer bars
          return (
            <div
              key={i}
              className="flex-1 rounded-sm bg-white/[0.07] animate-pulse"
              style={{ height: PLACEHOLDER_HEIGHTS[i] }}
            />
          );
        }
        const val = values[i] ?? 0;
        const pct = val > 0 ? Math.max((val / maxVal) * 100, 8) : 6; // min 6% so empty bars are visible
        const hasData = val > 0;
        return (
          <div
            key={i}
            className={`flex-1 rounded-sm transition-all duration-500 ${
              hasData ? 'bg-dark_accent-500' : 'bg-white/[0.07]'
            }`}
            style={{ height: `${pct}%` }}
          />
        );
      })}
    </div>
  );
}

// ── Quick‑action pill ────────────────────────────────────────────────

function QuickAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors"
    >
      <span className="text-white/70">{icon}</span>
      <span className="text-[11px] font-medium text-white/50 antialiased tracking-wide">
        {label}
      </span>
    </Link>
  );
}

// ── Bridge‑link row (Account & More section) ─────────────────────────

function BridgeLink({
  href,
  label,
  sub,
}: {
  href: string;
  label: string;
  sub?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-4 py-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors group"
    >
      <div>
        <span className="text-sm font-medium text-white antialiased">
          {label}
        </span>
        {sub && (
          <span className="block text-[11px] text-white/40 antialiased mt-0.5">
            {sub}
          </span>
        )}
      </div>
      <svg
        className="w-4 h-4 text-white/30 group-hover:text-white/50 transition-colors"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

export default function JournalHomePage() {
  // ── 7‑day sparkline data ───────────────────────────────────────────
  const [weekData, setWeekData] = useState<number[] | null>(null);
  const [activeDays, setActiveDays] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    (async () => {
      try {
        const days = last7Days();
        const results = await Promise.all(
          days.map((d) => journalService.listEntriesByDay(d))
        );
        const cals = results.map((entries: JournalEntry[]) => {
          const { caloriesConsumed } = calculateDailyTotals(entries);
          return Math.round(caloriesConsumed);
        });
        setWeekData(cals);
        setActiveDays(cals.filter((c) => c > 0).length);
      } catch (err) {
        console.error('[JournalHome] Failed to load week data:', err);
        setWeekData(null);
        setActiveDays(0);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const todayLabel = formatTodayLabel();

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      {/* ── Scrollable content ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-28 px-5 pt-14">
        {/* Top bar */}
        <div className="flex items-baseline justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold antialiased">Home</h1>
            <p className="text-sm text-white/50 antialiased mt-0.5">
              {todayLabel}
            </p>
          </div>
          <Link
            href="/journal/profile"
            className="w-8 h-8 rounded-full border-2 border-white/30 hover:border-white/60 transition-colors flex items-center justify-center"
            aria-label="Profile"
          >
            <span className="sr-only">Profile</span>
          </Link>
        </div>

        {/* ── This Week hero card ──────────────────────────────────── */}
        <div className="rounded-2xl bg-white/[0.06] backdrop-blur-sm p-5 mb-5">
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="text-base font-semibold antialiased">This Week</h2>
            <span className="text-xs text-white/40 antialiased">
              Recent trend
            </span>
          </div>

          {/* Sparkline */}
          <div className="mt-3 mb-4">
            <SparklineBars values={weekData} loading={loading} />
            {/* Day labels */}
            <div className="flex gap-[5px] mt-1.5">
              {last7Days().map((d, i) => (
                <span
                  key={i}
                  className="flex-1 text-center text-[10px] text-white/30 antialiased"
                >
                  {d.toLocaleDateString('en-US', { weekday: 'narrow' })}
                </span>
              ))}
            </div>
          </div>

          {/* Stat + CTA */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/50 antialiased">
              {loading ? '...' : `${activeDays} active day${activeDays !== 1 ? 's' : ''}`}
            </span>
            <Link
              href="/journal"
              className="text-sm font-medium text-dark_accent-400 hover:text-dark_accent-300 transition-colors antialiased"
            >
              Open today &rarr;
            </Link>
          </div>
        </div>

        {/* ── Primary actions ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <Link
            href="/journal/log"
            className="flex flex-col items-center justify-center rounded-2xl bg-dark_accent-500/20 hover:bg-dark_accent-500/30 active:bg-dark_accent-500/40 transition-colors py-5 px-4"
          >
            <span className="text-base font-semibold text-dark_accent-300 antialiased">
              Log food
            </span>
            <span className="text-[11px] text-dark_accent-500/70 antialiased mt-1">
              Fast add meals &amp; snacks
            </span>
          </Link>

          <Link
            href="/journal"
            className="flex flex-col items-center justify-center rounded-2xl bg-white/[0.06] hover:bg-white/[0.10] active:bg-white/[0.14] transition-colors py-5 px-4"
          >
            <span className="text-base font-semibold text-white antialiased">
              View today
            </span>
            <span className="text-[11px] text-white/40 antialiased mt-1">
              See today&apos;s entries
            </span>
          </Link>
        </div>

        {/* ── Quick actions row ────────────────────────────────────── */}
        <div className="flex gap-2.5 mb-8">
          <QuickAction
            href="/journal/insights"
            icon={<InsightsIcon className="w-5 h-5" />}
            label="Insights"
          />
          <QuickAction
            href="/journal/plans"
            icon={<SaveIcon className="w-5 h-5" />}
            label="Plans"
          />
          <QuickAction
            href="/journal/profile"
            icon={
              <div className="w-5 h-5 rounded-full border-[1.5px] border-current" />
            }
            label="Profile"
          />
        </div>

        {/* ── Account & More ───────────────────────────────────────── */}
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-white/40 antialiased uppercase tracking-wider mb-2.5 px-1">
            Account &amp; More
          </h3>
          <div className="flex flex-col gap-2">
            <BridgeLink
              href="/account/assessments"
              label="Assessments"
              sub="View your results"
            />
            <BridgeLink
              href="/programs"
              label="Programs"
              sub="Nutrition &amp; wellness"
            />
            <BridgeLink href="/shop" label="Shop" sub="Products &amp; supplements" />
            <BridgeLink
              href="/account"
              label="Account &amp; billing"
              sub="Subscriptions &amp; settings"
            />
          </div>
        </div>
      </div>

      {/* Footer Navigation */}
      <JournalFooterNav />
    </div>
  );
}
