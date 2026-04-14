'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import {
  journalService,
  toDateKey,
  calculateDailyTotals,
  type JournalEntry,
  type UserGoals,
  type MealTemplate,
  type DailyTotals,
} from '@/lib/journal';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DayActivity {
  date: Date;
  dateKey: string;
  entryCount: number;
  active: boolean;
  isToday: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTodayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
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

function getTotalCalories(t: MealTemplate): number | null {
  let total = 0;
  let has = false;
  for (const item of t.items) {
    if (typeof item.calories === 'number') {
      total += item.calories;
      has = true;
    }
  }
  return has ? total : null;
}

/* ------------------------------------------------------------------ */
/*  Section header                                                     */
/* ------------------------------------------------------------------ */

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-semibold text-white/40 antialiased uppercase tracking-wider mb-3 px-1">
      {title}
    </h2>
  );
}

/* ------------------------------------------------------------------ */
/*  Module 1 — Today's Structure                                       */
/* ------------------------------------------------------------------ */

function TodaysStructure({
  goals,
  loading,
}: {
  goals: UserGoals | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl bg-white/[0.04] p-5 animate-pulse">
        <div className="h-4 w-32 bg-white/[0.06] rounded mb-3" />
        <div className="h-3 w-48 bg-white/[0.06] rounded" />
      </div>
    );
  }

  if (!goals || goals.isDefault) {
    return (
      <div className="rounded-2xl bg-white/[0.04] p-5">
        <p className="text-sm text-white/60 antialiased mb-3">
          Set up your daily targets to see today&apos;s structure.
        </p>
        <Link
          href="/journal/profile"
          className="inline-block text-sm font-medium text-denim-400 hover:text-denim-300 transition-colors antialiased"
        >
          Set targets &rarr;
        </Link>
      </div>
    );
  }

  const { dailyCalorieGoal, macroGoals } = goals;

  return (
    <div className="rounded-2xl bg-white/[0.04] p-5 space-y-4">
      <div>
        <p className="text-lg font-semibold text-white antialiased">
          {dailyCalorieGoal.toLocaleString()} cal target
        </p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-xs text-white/50 antialiased">
            {macroGoals.protein_g}g protein
          </span>
          <span className="text-xs text-white/30">·</span>
          <span className="text-xs text-white/50 antialiased">
            {macroGoals.carbs_g}g carbs
          </span>
          <span className="text-xs text-white/30">·</span>
          <span className="text-xs text-white/50 antialiased">
            {macroGoals.fat_g}g fat
          </span>
        </div>
      </div>

      {/* Time-block anchors */}
      <div className="flex gap-2">
        {['Morning', 'Midday', 'Evening'].map((block) => (
          <div
            key={block}
            className="flex-1 rounded-xl bg-white/[0.04] py-2.5 px-3 text-center"
          >
            <span className="text-xs text-white/50 antialiased">{block}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Module 2 — Current Protocol                                        */
/* ------------------------------------------------------------------ */

function CurrentProtocol() {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-5">
      <p className="text-sm text-white/60 antialiased mb-1">
        Your protocol will appear here when enrolled in a program.
      </p>
      <Link
        href="/programs"
        className="inline-block text-sm font-medium text-denim-400 hover:text-denim-300 transition-colors antialiased mt-2"
      >
        Explore programs &rarr;
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Module 3 — This Week                                               */
/* ------------------------------------------------------------------ */

function ThisWeek({
  days,
  activeDays,
  loading,
}: {
  days: DayActivity[];
  activeDays: number;
  loading: boolean;
}) {
  const raw = last7Days();

  return (
    <div className="rounded-2xl bg-white/[0.04] p-5">
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
      <p className="text-xs text-white/40 antialiased mt-3">
        {loading ? '...' : `${activeDays} / 7 active days`}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Module 4 — Saved Meals                                             */
/* ------------------------------------------------------------------ */

function SavedMeals({
  templates,
  loading,
}: {
  templates: MealTemplate[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl bg-white/[0.04] p-5 animate-pulse">
        <div className="h-4 w-32 bg-white/[0.06] rounded" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-2xl bg-white/[0.04] p-5">
        <p className="text-sm text-white/60 antialiased mb-3">
          Save a meal from the log page to build your rotation.
        </p>
        <Link
          href="/journal/log"
          className="inline-block text-sm font-medium text-denim-400 hover:text-denim-300 transition-colors antialiased"
        >
          Log a meal &rarr;
        </Link>
      </div>
    );
  }

  const visible = templates.slice(0, 3);

  return (
    <div className="space-y-2">
      {visible.map((t) => {
        const cal = getTotalCalories(t);
        return (
          <Link
            key={t.id}
            href={`/journal/meals/edit/${t.id}`}
            className="flex items-center justify-between rounded-xl bg-white/[0.04] hover:bg-white/[0.07] transition-colors px-4 py-3 group"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-white antialiased truncate">
                {t.name}
              </p>
              <p className="text-xs text-white/40 antialiased mt-0.5">
                {t.items.length} item{t.items.length !== 1 ? 's' : ''}
                {cal !== null && ` · ${Math.round(cal)} cal`}
              </p>
            </div>
            <svg
              className="w-4 h-4 text-white/30 group-hover:text-white/50 transition-colors shrink-0 ml-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        );
      })}

      {templates.length > 3 && (
        <Link
          href="/journal/meals"
          className="block text-center text-xs text-denim-400 hover:text-denim-300 transition-colors antialiased py-2"
        >
          View all ({templates.length}) &rarr;
        </Link>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Module 5 — Planned vs Logged                                       */
/* ------------------------------------------------------------------ */

function ProgressBar({
  label,
  current,
  target,
  unit,
}: {
  label: string;
  current: number;
  target: number;
  unit: string;
}) {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-white/50 antialiased">{label}</span>
        <span className="text-xs text-white/40 antialiased">
          {Math.round(current)}{unit} / {Math.round(target)}{unit}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-denim-500 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function PlannedVsLogged({
  goals,
  totals,
  loading,
}: {
  goals: UserGoals | null;
  totals: DailyTotals;
  loading: boolean;
}) {
  if (loading || !goals) {
    return (
      <div className="rounded-2xl bg-white/[0.04] p-5 animate-pulse">
        <div className="h-4 w-40 bg-white/[0.06] rounded" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/[0.04] p-5 space-y-3">
      <ProgressBar
        label="Calories"
        current={totals.caloriesConsumed}
        target={goals.dailyCalorieGoal}
        unit=" cal"
      />
      <ProgressBar
        label="Protein"
        current={totals.macrosConsumed.protein}
        target={goals.macroGoals.protein_g}
        unit="g"
      />
      <ProgressBar
        label="Carbs"
        current={totals.macrosConsumed.carbs}
        target={goals.macroGoals.carbs_g}
        unit="g"
      />
      <ProgressBar
        label="Fat"
        current={totals.macrosConsumed.fat}
        target={goals.macroGoals.fat_g}
        unit="g"
      />
      {goals.isDefault && (
        <p className="text-[11px] text-white/30 antialiased pt-1">
          Based on default targets
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Module 6 — Next Step                                               */
/* ------------------------------------------------------------------ */

function NextStep({
  goals,
  totals,
  entryCount,
  loading,
}: {
  goals: UserGoals | null;
  totals: DailyTotals;
  entryCount: number;
  loading: boolean;
}) {
  if (loading) return null;

  let message: string;
  let cta: { label: string; href: string };

  const calGoal = goals?.dailyCalorieGoal ?? 2500;
  const pct = calGoal > 0 ? totals.caloriesConsumed / calGoal : 0;

  if (entryCount === 0) {
    message = 'A good time to start — even one entry helps build the picture.';
    cta = { label: 'Log an entry', href: '/journal/log' };
  } else if (pct < 0.5) {
    message = "You're building today's picture. Keep going when you're ready.";
    cta = { label: 'Log an entry', href: '/journal/log' };
  } else if (pct < 1) {
    message = 'Solid progress today. One more entry rounds things out.';
    cta = { label: 'Log an entry', href: '/journal/log' };
  } else {
    message = "You've hit your target for today. Nice work.";
    cta = { label: 'Review today', href: '/journal' };
  }

  return (
    <div className="rounded-2xl bg-white/[0.04] p-5">
      <p className="text-sm text-white/70 antialiased leading-relaxed mb-4">
        {message}
      </p>
      <Link
        href={cta.href}
        className="block w-full text-center py-3 rounded-full bg-denim-500/20 hover:bg-denim-500/30 active:bg-denim-500/40 transition-colors text-sm font-medium text-denim-300 antialiased"
      >
        {cta.label}
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function JournalPlansPage() {
  const [goals, setGoals] = useState<UserGoals | null>(null);
  const [todayEntries, setTodayEntries] = useState<JournalEntry[]>([]);
  const [totals, setTotals] = useState<DailyTotals>({
    caloriesConsumed: 0,
    macrosConsumed: { protein: 0, carbs: 0, fat: 0 },
  });
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [weekDays, setWeekDays] = useState<DayActivity[]>([]);
  const [activeDays, setActiveDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    (async () => {
      try {
        const today = new Date();
        const days = last7Days();

        const [goalsRes, todayRes, mealsRes, ...weekRes] = await Promise.all([
          journalService.getGoals(),
          journalService.listEntriesByDay(today),
          journalService.listMealTemplates(),
          ...days.map((d) => journalService.listEntriesByDay(d)),
        ]);

        setGoals(goalsRes);

        const todayDk = toDateKey(today);
        const todayItems = todayRes.filter(
          (e: JournalEntry) => toDateKey(e.timestamp) === todayDk
        );
        setTodayEntries(todayItems);
        setTotals(calculateDailyTotals(todayItems));

        setTemplates(mealsRes);

        const dayActivities: DayActivity[] = days.map((d, i) => {
          const dk = toDateKey(d);
          const entries = weekRes[i].filter(
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
      } catch (err) {
        console.warn('[JournalPlans] Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        {/* Page header */}
        <div className="w-full max-w-[650px] mx-auto px-5 pt-14 pb-2">
          <h1 className="text-2xl font-semibold antialiased">Plans</h1>
          <p className="text-sm text-white/50 antialiased mt-0.5">
            {formatTodayLabel()}
          </p>
        </div>

        <div className="w-full max-w-[650px] mx-auto px-5 space-y-6 mt-6">
          {/* Module 1 — Today's Structure */}
          <section>
            <SectionHeader title="Today's Structure" />
            <TodaysStructure goals={goals} loading={loading} />
          </section>

          {/* Module 2 — Current Protocol */}
          <section>
            <SectionHeader title="Current Protocol" />
            <CurrentProtocol />
          </section>

          {/* Module 3 — This Week */}
          <section>
            <SectionHeader title="This Week" />
            <ThisWeek days={weekDays} activeDays={activeDays} loading={loading} />
          </section>

          {/* Module 4 — Saved Meals */}
          <section>
            <SectionHeader title="Saved Meals" />
            <SavedMeals templates={templates} loading={loading} />
          </section>

          {/* Module 5 — Planned vs Logged */}
          <section>
            <SectionHeader title="Today's Progress" />
            <PlannedVsLogged goals={goals} totals={totals} loading={loading} />
          </section>

          {/* Module 6 — Next Step */}
          <section>
            <NextStep
              goals={goals}
              totals={totals}
              entryCount={todayEntries.length}
              loading={loading}
            />
          </section>
        </div>
      </div>

      <JournalFooterNav />
    </div>
  );
}
