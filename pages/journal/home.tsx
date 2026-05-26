'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import {
  journalService,
  toDateKey,
  type JournalEntry,
} from '@/lib/journal';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import { useNDS, type NDSData } from '@/lib/nds/useNDS';
import { planService, type Plan, type PlanDay } from '@/lib/plans';
import type { MealSchedule, ResolvedScheduleSlot } from '@/lib/plans/types';
import { defaultMealSchedule, hhmmToMinutes, normalizeMealSchedule } from '@/lib/plans/scheduleResolver';
import {
  getEnabledMealSlots,
  getMealSlotForEntry,
} from '@/lib/journal/mealScheduleAssignment';
import { GridAppSectionHome } from '../../components/journal/GridAppSectionHome';
import ActiveProgramCard from '@/components/journal/programs/ActiveProgramCard';

/* ------------------------------------------------------------------ */
/*  Verified route map — every href below has a matching page file     */
/*  pages/app/log/new.tsx         → /app/log/new                      */
/*  pages/app/log/index.tsx       → /app/log                          */
/*  pages/app/programs/index.tsx  → /app/programs                     */
/*  pages/app/plans/index.tsx     → /app/plans                        */
/*  pages/app/profile.tsx         → /app/profile                      */
/*  pages/account/assessments.tsx → /account/assessments              */
/*  pages/programs.tsx            → /programs                         */
/*  pages/shop.tsx                → /shop                             */
/*  pages/account/index.tsx       → /account                          */
/* ------------------------------------------------------------------ */

const TODAY_RHYTHM_BG =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1776880779332-Gut-Rebalance-Slide-Stack-Image-Desktop-3x1-Z.jpg';
const PREP_PANTRY_BG =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1772671962329-zucchini-apple.jpg';
const BASELINE_CARD_IMAGE =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg';
const CASE_STUDY_CARD_IMAGE =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1776802981375-Case-Study-Dondrea-1x1.jpg';

type NDSStatus = 'Strong' | 'Building' | 'Support' | 'Watch' | 'Logged' | 'Pending';

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

function todayLocalKey(): string {
  return toDateKey(new Date());
}

function formatTime12h(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getOverallStatus(score: number | null): NDSStatus {
  if (score === null) return 'Pending';
  if (score >= 80) return 'Strong';
  if (score >= 55) return 'Building';
  if (score >= 35) return 'Support';
  return 'Watch';
}

function getSubscoreStatus(score: number | null, hasLoggedNutrition: boolean): NDSStatus {
  if (score === null || Number.isNaN(score)) return hasLoggedNutrition ? 'Logged' : 'Pending';
  if (score >= 8) return 'Strong';
  if (score >= 6) return 'Building';
  if (score >= 4) return 'Support';
  return 'Watch';
}

function buildLogMealHref(slot: ResolvedScheduleSlot): string {
  const params = new URLSearchParams({
    tab: 'food',
    mealSlot: slot.key,
    date: todayLocalKey(),
    time: slot.target_time,
  });
  return `${APP_ROUTES.logNew}?${params.toString()}`;
}

function isMealSlotLogged(
  slot: ResolvedScheduleSlot,
  todayEntries: JournalEntry[],
  enabledSlots: ResolvedScheduleSlot[],
): boolean {
  return todayEntries.some((entry) => {
    if (entry.type !== 'intake') return false;
    return getMealSlotForEntry(entry, enabledSlots)?.key === slot.key;
  });
}

function chooseActionableMeal(
  slots: ResolvedScheduleSlot[],
  todayEntries: JournalEntry[],
): ResolvedScheduleSlot | null {
  if (slots.length === 0) return null;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const unlogged = slots.filter((slot) => !isMealSlotLogged(slot, todayEntries, slots));
  if (unlogged.length === 0) return null;

  const current = unlogged.find((slot, index) => {
    const previous = slots[index - 1] ?? null;
    const next = slots[index + 1] ?? null;
    const target = hhmmToMinutes(slot.target_time);
    const start = previous ? Math.round((hhmmToMinutes(previous.target_time) + target) / 2) : 0;
    const end = next ? Math.round((target + hhmmToMinutes(next.target_time)) / 2) : 24 * 60;
    return nowMinutes >= start && nowMinutes < end;
  });
  if (current) return current;

  return unlogged.find((slot) => hhmmToMinutes(slot.target_time) >= nowMinutes) ?? unlogged[0] ?? null;
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
  return { label: 'Log a new entry', href: APP_ROUTES.logNew };
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
                    ? 'bg-denim-500'
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
  const [expanded, setExpanded] = useState(true);

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
              <h4 className="text-base font-semibold text-white antialiased tracking-wider">
                Streaks
              </h4>
              <div className="flex flex-wrap gap-2">
                {checkinStreak > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] text-base text-white/80 antialiased">
                    <span className="w-1.5 h-1.5 rounded-full bg-denim-500" />
                    {checkinStreak} day check-in
                  </span>
                )}
                {completeDayStreak > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] text-sm text-white/70 antialiased">
                    <span className="w-1.5 h-1.5 rounded-full bg-denim-500" />
                    {completeDayStreak} day complete (2+ logs)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Trends */}
          <div className="space-y-2">
            <h4 className="text-base font-semibold text-white antialiased tracking-wider">
              Patterns
            </h4>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] text-sm text-white/70 antialiased">
                3-day momentum: {momentumLabel}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] text-sm text-white/70 antialiased">
                7-day direction: {direction}
              </span>
            </div>
          </div>

          {/* CTA */}
          <Link
            href={cta.href}
            className="block w-full text-center py-3 rounded-full bg-denim-900 hover:bg-denim-700 active:bg-denim-900/90 transition-colors text-lg font-semibold text-brand-900 antialiased"
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
            className="block w-full text-center py-3 rounded-full bg-denim-900 hover:bg-denim-700 active:bg-denim-900/90 transition-colors text-lg font-semibold text-brand-900 antialiased"
          >
            {cta.label}
          </Link>
        </div>
      )}
    </div>
  );
}

function TodayRhythmModule({
  slots,
  todayEntries,
  loading,
  dayPlanHref,
}: {
  slots: ResolvedScheduleSlot[];
  todayEntries: JournalEntry[];
  loading: boolean;
  dayPlanHref: string;
}) {
  const actionable = chooseActionableMeal(slots, todayEntries);

  return (
    <section className="w-full max-w-[650px] mx-auto">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-50/55 antialiased">
          Today&apos;s Rhythm
        </p>
        <span className="text-xs text-brand-50/35 antialiased">{formatTodayLabel()}</span>
      </div>
      <div className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-brand-800 shadow-large">
        <Image
          src={TODAY_RHYTHM_BG}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 650px"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-brand-900/55 to-brand-900/90" />
        <div className="relative z-10 p-5 sm:p-6">
          <div className="mb-5">
            <h2 className="text-2xl font-semibold text-white antialiased">Schedule Preview</h2>
            <p className="mt-1 text-sm text-white/70 antialiased">
              Your enabled meals for today, with the next loggable slot ready.
            </p>
          </div>

          <div className="space-y-2">
            {loading ? (
              [0, 1, 2].map((item) => (
                <div key={item} className="h-14 rounded-2xl bg-white/[0.08] animate-pulse" />
              ))
            ) : slots.length === 0 ? (
              <div className="rounded-2xl bg-white/[0.08] p-4 text-sm text-white/70">
                Add meal times in Profile to personalize your rhythm.
              </div>
            ) : (
              slots.map((slot) => {
                const logged = isMealSlotLogged(slot, todayEntries, slots);
                const isActionable = actionable?.key === slot.key;
                return (
                  <div
                    key={slot.key}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
                      isActionable
                        ? 'border-denim-300/40 bg-denim-500/15'
                        : 'border-white/10 bg-black/20'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-white antialiased">{slot.label}</p>
                      <p className="text-xs text-white/55 antialiased">{formatTime12h(slot.target_time)}</p>
                    </div>
                    {isActionable ? (
                      <Link
                        href={buildLogMealHref(slot)}
                        className="shrink-0 rounded-full bg-brand-200 px-4 py-2 text-xs font-semibold text-brand-900 transition-colors hover:bg-brand-100"
                      >
                        Log Now
                      </Link>
                    ) : (
                      <span className="shrink-0 rounded-full bg-white/[0.08] px-3 py-1.5 text-xs text-white/65">
                        {logged ? 'Logged' : 'Upcoming'}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <Link
            href={dayPlanHref}
            className="mt-5 block w-full rounded-full bg-brand-200 py-3 text-center text-sm font-semibold text-brand-900 transition-colors hover:bg-brand-100"
          >
            View Full Day Plan
          </Link>
        </div>
      </div>
    </section>
  );
}

function NutritionDensityModule({
  data,
  isLoading,
}: {
  data: NDSData | null;
  isLoading: boolean;
}) {
  const hasLoggedNutrition = Boolean((data?._meta?.intake_count ?? 0) > 0 || (data?._meta?.meal_count ?? 0) > 0);
  const overallScore = data ? Math.round(data.nds_score_100) : null;
  const factors: Array<{ label: string; score: number | null }> = [
    { label: 'Whole Food Ratio', score: data?.subscores_10.wfr ?? null },
    { label: 'Protein Sufficiency', score: data?.subscores_10.ps ?? null },
    { label: 'Fiber', score: data?.subscores_10.fp ?? null },
    { label: 'Added Sugar', score: data?.subscores_10.as ?? null },
    { label: 'Phytonutrient Composition', score: data?.subscores_10.pnd ?? null },
    { label: 'Omega Balance', score: data?.subscores_10.ob ?? null },
    { label: 'Micronutrient Coverage', score: data?.subscores_10.mnc ?? null },
  ];

  return (
    <section className="w-full max-w-[650px] mx-auto rounded-3xl border border-white/10 bg-white/[0.04] py-5">
      <div className="px-5">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-50/55 antialiased">
          Nutrition Density
        </p>
        <h2 className="mt-1 text-2xl font-semibold text-white antialiased">So Far Today</h2>
      </div>
      <div className="mt-4 overflow-x-auto px-5 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-3 pr-5">
          <div className="w-40 shrink-0 rounded-2xl bg-brand-200 p-4 text-brand-900">
            <p className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.12em] opacity-70">
              Overall Score
            </p>
            <div className="mt-3 flex items-end gap-1">
              <span className="whitespace-nowrap text-4xl font-semibold leading-none">
                {isLoading ? '...' : overallScore ?? '--'}
              </span>
              {!isLoading && overallScore !== null && <span className="pb-1 text-xs opacity-70">/100</span>}
            </div>
            <span className="mt-3 inline-flex rounded-full bg-brand-900/10 px-2.5 py-1 text-xs font-semibold">
              {isLoading ? 'Pending' : getOverallStatus(overallScore)}
            </span>
          </div>
          {factors.map((factor) => (
            <div
              key={factor.label}
              className="w-40 shrink-0 rounded-2xl border border-white/10 bg-brand-800/80 p-4"
              title={`${factor.label}: ${getSubscoreStatus(factor.score, hasLoggedNutrition)}`}
            >
              <p className="whitespace-nowrap text-sm font-semibold text-white antialiased">{factor.label}</p>
              <p className="mt-5 whitespace-nowrap text-2xl font-semibold text-brand-50 antialiased">
                {isLoading ? 'Pending' : getSubscoreStatus(factor.score, hasLoggedNutrition)}
              </p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 px-5">
        <div className="h-1.5 w-20 rounded-full bg-brand-50/15">
          <div className="h-full w-1/3 rounded-full bg-brand-200" />
        </div>
      </div>
    </section>
  );
}

const quickEntryItems = [
  { label: 'Log Meal', href: `${APP_ROUTES.logNew}?tab=food`, accent: 'bg-denim-500/25 text-denim-100 border-denim-300/30' },
  { label: 'Hydration', href: `${APP_ROUTES.logNew}?tab=water`, accent: 'bg-sky-500/20 text-sky-100 border-sky-300/25' },
  { label: 'Mood', href: `${APP_ROUTES.logNew}?tab=mood`, accent: 'bg-violet-500/20 text-violet-100 border-violet-300/25' },
  { label: 'Movement', href: `${APP_ROUTES.logNew}?tab=movement`, accent: 'bg-emerald-500/20 text-emerald-100 border-emerald-300/25' },
  { label: 'More', href: APP_ROUTES.logNew, accent: 'bg-brand-700 text-brand-50 border-white/10' },
];

function QuickEntryModule() {
  return (
    <section className="w-full max-w-[650px] mx-auto">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-50/55 antialiased">
        Quick Entry
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-white antialiased">What would you like to do?</h2>
      <div className="mt-4 grid grid-cols-5 gap-2 sm:gap-3">
        {quickEntryItems.map((item) => (
          <Link key={item.label} href={item.href} className="group flex flex-col items-center gap-2">
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-full border transition-transform group-hover:scale-[1.03] ${item.accent}`}
              aria-hidden
            >
              <span className="h-2 w-2 rounded-full bg-current" />
            </span>
            <span className="text-center text-[11px] font-medium leading-tight text-white/75 antialiased">
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function PrepPantryModule({
  groceryHref,
  hasActivePlan,
}: {
  groceryHref: string;
  hasActivePlan: boolean;
}) {
  return (
    <section className="w-full max-w-[650px] mx-auto">
      <div className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-brand-800 shadow-large">
        <Image
          src={PREP_PANTRY_BG}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 650px"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-900/95 via-brand-900/70 to-brand-900/35" />
        <div className="relative z-10 p-5 sm:p-6">
          <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/75">
            Prep & Pantry
          </span>
          <h2 className="mt-5 max-w-md text-3xl font-semibold leading-tight text-white antialiased">
            {hasActivePlan ? 'Review grocery readiness' : 'Build your pantry foundation'}
          </h2>
          <p className="mt-3 max-w-md text-sm text-white/72 antialiased">
            {hasActivePlan
              ? 'Use the current planning and grocery surface to review staples and keep upcoming meals easier to execute.'
              : 'A pantry baseline will pair with more precise grocery lists once your planning workflow has enough context.'}
          </p>
          <ul className="mt-4 space-y-2 text-sm text-white/70">
            <li>Staples to keep on hand</li>
            <li>Low-item review before grocery runs</li>
            <li>Cleaner handoff from plans to shopping</li>
          </ul>
          <Link
            href={groceryHref}
            className="mt-5 inline-flex w-full max-w-xs justify-center rounded-full bg-brand-200 px-5 py-3 text-sm font-semibold text-brand-900 transition-colors hover:bg-brand-100"
          >
            {hasActivePlan ? 'Open Grocery Plan' : 'Open Plans'}
          </Link>
        </div>
      </div>
    </section>
  );
}

function HomeTemplateCards() {
  const cards = [
    {
      eyebrow: 'Default Path',
      headline: 'Keep building your baseline',
      body: 'Use your next program step to keep food quality and rhythm moving together.',
      href: APP_ROUTES.programs,
      image: BASELINE_CARD_IMAGE,
    },
    {
      eyebrow: 'Insight',
      headline: 'Small patterns become useful data',
      body: 'A few consistent logs help Fine Diet make better plan and grocery suggestions.',
      href: APP_ROUTES.log,
      image: CASE_STUDY_CARD_IMAGE,
    },
  ];

  return (
    <section className="grid w-full max-w-[650px] grid-cols-1 gap-3 sm:grid-cols-2 mx-auto">
      {cards.map((card) => (
        <Link
          key={card.headline}
          href={card.href}
          className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] transition-colors hover:bg-white/[0.07]"
        >
          <div className="relative h-32">
            <Image src={card.image} alt="" fill className="object-cover" sizes="(max-width: 768px) 100vw, 325px" />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-900/70 to-transparent" />
          </div>
          <div className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-50/45">{card.eyebrow}</p>
            <h3 className="mt-2 text-lg font-semibold leading-snug text-white antialiased">{card.headline}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/60 antialiased">{card.body}</p>
          </div>
        </Link>
      ))}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

export default function JournalHomePage() {
  const [weekDays, setWeekDays] = useState<DayActivity[]>([]);
  const [todayEntries, setTodayEntries] = useState<JournalEntry[]>([]);
  const [activeDays, setActiveDays] = useState<number>(0);
  const [mealSchedule, setMealSchedule] = useState<MealSchedule>(() => defaultMealSchedule());
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [planDays, setPlanDays] = useState<PlanDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [plansLoading, setPlansLoading] = useState(true);
  const fetchedRef = useRef(false);
  const nds = useNDS({ dateLocal: todayLocalKey() });

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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/journal/profile');
        if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
        const data = await res.json();
        setMealSchedule(normalizeMealSchedule(data.profile?.meal_schedule));
      } catch (err) {
        console.warn('[JournalHome] Failed to load meal schedule:', err);
        setMealSchedule(defaultMealSchedule());
      } finally {
        setScheduleLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const plans = await planService.list();
        const active = plans.find((p) => p.status === 'active') ?? plans[0] ?? null;
        setActivePlan(active);
        if (active) {
          const detail = await planService.getDetail(active.id);
          setPlanDays(detail.days);
        }
      } catch (err) {
        console.warn('[JournalHome] Failed to load plan route context:', err);
        setActivePlan(null);
        setPlanDays([]);
      } finally {
        setPlansLoading(false);
      }
    })();
  }, []);

  const todayLabel = formatTodayLabel();
  const enabledMealSlots = useMemo(() => getEnabledMealSlots(mealSchedule), [mealSchedule]);
  const dayPlanHref = useMemo(() => {
    if (!activePlan) return APP_ROUTES.plans;
    const today = todayLocalKey();
    const hasToday = planDays.some((day) => day.date_local === today);
    if (!hasToday) return APP_ROUTES.plans;
    return `${APP_ROUTE_BUILDERS.planDay(today)}?planId=${encodeURIComponent(activePlan.id)}`;
  }, [activePlan, planDays]);
  const groceryHref = activePlan ? APP_ROUTE_BUILDERS.planGrocery(activePlan.id) : APP_ROUTES.plans;

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        {/* ── Hero: Title + Snapshot ───────────────────────────────── */}
        <div className="relative isolate overflow-hidden rounded-b-md mb-6 bg-gradient-to-b from-neutral-900 to-brand-700 to-80%">
          <div className="absolute inset-0">
            <div className="absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-denim-500/20 blur-3xl" />
            <div className="absolute -bottom-24 right-10 h-72 w-72 rounded-full bg-brand-200/10 blur-3xl" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-brand-900/10 to-brand-900/60" />
          </div>

          {/* Interior content */}
          <div className="relative z-10 w-full max-w-[650px] mx-auto px-5 pt-8 pb-6">
            {/* Top bar */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-lg font-semibold antialiased">Home</h1>
                <p className="text-sm text-white/80 antialiased">
                  {todayLabel}
                </p>
              </div>
              <Link
                href={APP_ROUTES.profile}
                className="w-8 h-8 rounded-full border-2 border-white/30 hover:border-white/60 transition-colors flex items-center justify-center"
                aria-label="Profile"
              >
                <span className="sr-only">Profile</span>
              </Link>
            </div>

            <div className="mb-6 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-50/45 antialiased">
                {getGreeting()}
              </p>
              <h2 className="mt-2 text-4xl font-semibold leading-tight text-white antialiased">
                Start with today&apos;s rhythm.
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/65 antialiased">
                Log the next meal, check your nutrition density, and keep plans moving without leaving Home.
              </p>
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

        <div className="space-y-6 px-5">
          <TodayRhythmModule
            slots={enabledMealSlots}
            todayEntries={todayEntries}
            loading={scheduleLoading || loading}
            dayPlanHref={dayPlanHref}
          />

          <NutritionDensityModule data={nds.data} isLoading={nds.isLoading} />

          <QuickEntryModule />

          <PrepPantryModule
            groceryHref={groceryHref}
            hasActivePlan={Boolean(activePlan) && !plansLoading}
          />

          <HomeTemplateCards />
        </div>

        {/* ── Active Program runtime card (Phase 10) ──────────────── */}
        <div className="px-5 mt-6 mb-5">
          <ActiveProgramCard
            className="max-w-[650px] mx-auto"
            detailHref={APP_ROUTES.programs}
          />
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
