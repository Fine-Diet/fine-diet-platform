'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import {
  journalService,
  toDateKey,
  type JournalEntry,
} from '@/lib/journal';
import { GridAppSectionHome } from '@/components/journal/GridAppSectionHome';

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

// Placeholder hero background — wire to Admin CMS later
const HERO_BG = '/images/home/hero-desktop.jpg';

// ── Types ────────────────────────────────────────────────────────────

interface DayActivity {
  date: Date;
  dateKey: string;
  entryCount: number;
  active: boolean;
  isToday: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatTodayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function last7Days(): Date[] {
  const days: Date[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

function isSameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getTimeOfDayCta(): { label: string; href: string } {
  return { label: 'Log a new entry', href: '/journal/log' };
}

function relativeTimeSince(entries: JournalEntry[]): string {
  if (entries.length === 0) return 'None';
  const latest = entries.reduce((a, b) =>
    b.timestamp.getTime() > a.timestamp.getTime() ? b : a
  );
  const diffMs = Date.now() - latest.timestamp.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

function computeCheckinStreak(days: DayActivity[]): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].active) streak++;
    else break;
  }
  return streak;
}

function computeCompleteDayStreak(days: DayActivity[]): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].entryCount >= 2) streak++;
    else break;
  }
  return streak;
}

function compute3DayMomentum(days: DayActivity[]): 'up' | 'same' | 'down' {
  const recent = days.slice(-3).filter((d) => d.active).length;
  const prior = days.slice(-6, -3).filter((d) => d.active).length;
  if (recent > prior) return 'up';
  if (recent < prior) return 'down';
  return 'same';
}

function compute7DayDirection(activeDays: number): string {
  if (activeDays >= 5) return 'Improving';
  if (activeDays >= 3) return 'Steady';
  return 'Needs attention';
}

// ── Activity Beads ──────────────────────────────────────────────────

function ActivityBeads({
  days,
  loading,
}: {
  days: DayActivity[];
  loading: boolean;
}) {
  const raw = last7Days();

  return (
    <div className="flex items-center justify-between gap-2">
      {raw.map((d, i) => {
        const dayInfo = days[i];
        const active = dayInfo?.active ?? false;
        const isToday = dayInfo?.isToday ?? false;

        return (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div
              className={`w-7 h-7 rounded-full transition-all duration-500 ${
                loading
                  ? 'bg-white/[0.07] animate-pulse'
                  : active
                    ? 'bg-dark_accent-500'
                    : 'bg-white/[0.07]'
              } ${isToday && !loading ? 'ring-[1.5px] ring-white/30 ring-offset-1 ring-offset-brand-900' : ''}`}
            />
            <span className="text-[10px] text-white/30 antialiased leading-none">
              {d.toLocaleDateString('en-US', { weekday: 'narrow' })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Snapshot Module ─────────────────────────────────────────────────

function SnapshotModule({
  days,
  todayEntries,
  activeDays,
  loading,
}: {
  days: DayActivity[];
  todayEntries: JournalEntry[];
  activeDays: number;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const todayActive = days.length > 0 && days[days.length - 1]?.active;
  let statusSentence: string;
  if (loading) {
    statusSentence = '...';
  } else if (activeDays >= 3) {
    statusSentence = 'Good momentum this week.';
  } else if (todayActive) {
    statusSentence = "You're on track today.";
  } else {
    statusSentence = 'A quick check-in would help.';
  }

  const todayLogCount = todayEntries.length;
  const lastEntry = relativeTimeSince(todayEntries);
  const cta = getTimeOfDayCta();

  const checkinStreak = computeCheckinStreak(days);
  const completeDayStreak = computeCompleteDayStreak(days);
  const momentum = compute3DayMomentum(days);
  const direction = compute7DayDirection(activeDays);

  const momentumLabel =
    momentum === 'up' ? 'Picking up' : momentum === 'down' ? 'Slowing down' : 'Holding steady';

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      role="region"
      aria-label="Snapshot"
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left py-2 flex items-start justify-between gap-3 min-h-[48px]"
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <p className="text-3xl font-semibold text-white antialiased leading-snug">{statusSentence}</p>

          {/* Mini metrics row */}
          <div className="flex items-center gap-4 mt-3">
            <span className="text-base text-white antialiased">
              Today: <span className="text-white font-semibold">{loading ? '–' : todayLogCount}</span>
            </span>
            <span className="text-base text-white antialiased">
              Week: <span className="text-white font-semibold">{loading ? '–' : `${activeDays}/7`}</span>
            </span>
            <span className="text-base text-white antialiased">
              Last: <span className="text-white font-semibold">{loading ? '–' : lastEntry}</span>
            </span>
          </div>

          {/* Activity beads */}
          <div className="mt-4">
            <ActivityBeads days={days} loading={loading} />
          </div>
        </div>

        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-white/30 mt-0.5 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded details */}
      {expanded && !loading && (
        <div className="pb-2 pt-0 space-y-4">
          <div className="border-t border-white/[0.06]" />

          {/* Streaks */}
          {(checkinStreak > 0 || completeDayStreak > 0) && (
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold text-white/40 antialiased uppercase tracking-wider">
                Streaks
              </h4>
              <div className="flex flex-wrap gap-2">
                {checkinStreak > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] text-xs text-white/70 antialiased">
                    <span className="w-1.5 h-1.5 rounded-full bg-dark_accent-500" />
                    {checkinStreak} day check-in
                  </span>
                )}
                {completeDayStreak > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] text-xs text-white/70 antialiased">
                    <span className="w-1.5 h-1.5 rounded-full bg-dark_accent-500" />
                    {completeDayStreak} day complete (2+ logs)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Trends */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-semibold text-white/40 antialiased uppercase tracking-wider">
              Patterns
            </h4>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] text-xs text-white/70 antialiased">
                3-day momentum: {momentumLabel}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] text-xs text-white/70 antialiased">
                7-day direction: {direction}
              </span>
            </div>
          </div>

          {/* CTA */}
          <Link
            href={cta.href}
            className="block w-full text-center py-3 rounded-full bg-dark_accent-900 hover:bg-dark_accent-700 active:bg-dark_accent-900/90 transition-colors text-lg font-semibold text-brand-900 antialiased"
          >
            {cta.label}
          </Link>
        </div>
      )}

      {/* Collapsed CTA */}
      {!expanded && !loading && (
        <div className="pb-2 pt-0">
          <Link
            href={cta.href}
            className="block w-full text-center py-3 rounded-full bg-dark_accent-900 hover:bg-dark_accent-700 active:bg-dark_accent-900/90 transition-colors text-lg font-semibold text-brand-900 antialiased"
          >
            {cta.label}
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

export default function JournalHomePage() {
  const [weekDays, setWeekDays] = useState<DayActivity[]>([]);
  const [todayEntries, setTodayEntries] = useState<JournalEntry[]>([]);
  const [activeDays, setActiveDays] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    (async () => {
      try {
        const days = last7Days();
        const today = new Date();
        const results = await Promise.all(
          days.map((d) => journalService.listEntriesByDay(d))
        );

        const dayActivities: DayActivity[] = days.map((d, i) => {
          const dk = toDateKey(d);
          const entries = results[i].filter(
            (e: JournalEntry) => toDateKey(e.timestamp) === dk
          );
          return {
            date: d,
            dateKey: dk,
            entryCount: entries.length,
            active: entries.length > 0,
            isToday: isSameLocalDate(d, today),
          };
        });

        setWeekDays(dayActivities);
        setActiveDays(dayActivities.filter((d) => d.active).length);

        const todayDk = toDateKey(today);
        const todayItems = results[results.length - 1].filter(
          (e: JournalEntry) => toDateKey(e.timestamp) === todayDk
        );
        setTodayEntries(todayItems);
      } catch (err) {
        console.warn('[JournalHome] Failed to load week data:', err);
        setWeekDays([]);
        setTodayEntries([]);
        setActiveDays(0);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const todayLabel = formatTodayLabel();

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        {/* ── Hero: Title + Snapshot ───────────────────────────────── */}
        <div className="relative isolate overflow-hidden rounded-b-md mb-5">
          {/* Background image — swap via Admin UI later */}
          <div className="absolute inset-0">
            <Image
              src={HERO_BG}
              alt=""
              fill
              priority
              className="object-cover"
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/50" />
            <div className="absolute inset-0 backdrop-blur-[6px] pointer-events-none" aria-hidden />
          </div>

          {/* Interior content */}
          <div className="relative z-10 w-full max-w-[650px] mx-auto px-5 pt-8 pb-5">
            {/* Top bar */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-lg font-semibold antialiased">Home</h1>
                <p className="text-sm text-white/80 antialiased">
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

            {/* Snapshot */}
            <SnapshotModule
              days={weekDays}
              todayEntries={todayEntries}
              activeDays={activeDays}
              loading={loading}
            />
          </div>
        </div>

        {/* ── Grid App Section Home (Programs, Assessments, Shop, Upgrade) ── */}
        <div className="px-5">
          <GridAppSectionHome />
        </div>
      </div>

      <JournalFooterNav />
    </div>
  );
}
