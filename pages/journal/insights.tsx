'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import {
  journalService,
  toDateKey,
  calculateDailyTotals,
  deriveBlock,
  type JournalEntry,
  type UserGoals,
  type DailyTotals,
  type TimeBlock,
} from '@/lib/journal';
import { useNDS } from '@/lib/nds/useNDS';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TimeWindow = 'daily' | '7day' | '14day';

interface DayActivity {
  date: Date;
  dateKey: string;
  entryCount: number;
  active: boolean;
  isToday: boolean;
  entries: JournalEntry[];
}

interface ProfileData {
  first_name?: string;
  primary_goal?: string;
  dietary_style?: string;
  eating_window?: string;
  eating_window_start?: string;
  eating_window_end?: string;
  date_of_birth?: string;
  sex?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function lastNDays(n: number): Date[] {
  const days: Date[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
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

function computeCheckinStreak(days: DayActivity[]): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].active) streak++;
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

function windowDayCount(w: TimeWindow): number {
  if (w === 'daily') return 1;
  if (w === '7day') return 7;
  return 14;
}

function entryTypeLabel(type: string): string {
  const map: Record<string, string> = {
    intake: 'Food & Drink',
    water: 'Hydration',
    supplement: 'Supplements',
    mood: 'Mood',
    bowel: 'Bowel',
    cycle: 'Cycle',
    movement: 'Movement',
    blood_pressure: 'Blood Pressure',
    sleep: 'Sleep',
    note: 'Notes',
  };
  return map[type] ?? type;
}

function blockLabel(block: TimeBlock): string {
  if (block === 'morning') return 'morning';
  if (block === 'midday') return 'midday';
  return 'evening';
}

/* ------------------------------------------------------------------ */
/*  ModuleCard — always-visible wrapper for graceful degradation       */
/* ------------------------------------------------------------------ */

function ModuleCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white/[0.04] p-5">
      <h2 className="text-base font-semibold mb-3 antialiased">{title}</h2>
      {children}
    </section>
  );
}

function EmptyState({ message, cta }: { message: string; cta?: { label: string; href: string } }) {
  return (
    <div>
      <p className="text-sm text-white/50 antialiased leading-relaxed">{message}</p>
      {cta && (
        <Link
          href={cta.href}
          className="inline-block text-sm font-medium text-dark_accent-400 hover:text-dark_accent-300 transition-colors antialiased mt-3"
        >
          {cta.label} &rarr;
        </Link>
      )}
    </div>
  );
}

function ConfidenceBadge({ level }: { level: 'observed' | 'likely' }) {
  return (
    <span
      className={`inline-block text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full antialiased ${
        level === 'observed'
          ? 'bg-white/[0.08] text-white/50'
          : 'bg-white/[0.05] text-white/35'
      }`}
    >
      {level === 'observed' ? 'Observed' : 'Likely'}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Module 1 — Top Takeaways                                           */
/* ------------------------------------------------------------------ */

function TopTakeaways({
  dayActivities,
  allEntries,
  dailyTotalsList,
  goals,
  ndsScore,
  window,
  activeDays,
  loading,
}: {
  dayActivities: DayActivity[];
  allEntries: JournalEntry[];
  dailyTotalsList: DailyTotals[];
  goals: UserGoals | null;
  ndsScore: number | null;
  window: TimeWindow;
  activeDays: number;
  loading: boolean;
}) {
  if (loading) {
    return (
      <ModuleCard title="Top Takeaways">
        <div className="space-y-2 animate-pulse">
          <div className="h-3 w-3/4 bg-white/[0.06] rounded" />
          <div className="h-3 w-1/2 bg-white/[0.06] rounded" />
        </div>
      </ModuleCard>
    );
  }

  const totalDays = windowDayCount(window);
  const takeaways: { text: string; confidence: 'observed' | 'likely' }[] = [];

  if (activeDays > 0) {
    takeaways.push({
      text: `You logged ${activeDays} of ${totalDays} day${totalDays > 1 ? 's' : ''}.`,
      confidence: 'observed',
    });
  }

  if (goals && !goals.isDefault && dailyTotalsList.length > 0) {
    const totalCal = dailyTotalsList.reduce((sum, t) => sum + t.caloriesConsumed, 0);
    const daysWithIntake = dailyTotalsList.filter((t) => t.caloriesConsumed > 0).length;
    if (daysWithIntake > 0) {
      const avgCal = Math.round(totalCal / daysWithIntake);
      takeaways.push({
        text: `Averaging ${avgCal.toLocaleString()} cal/day vs ${goals.dailyCalorieGoal.toLocaleString()} goal.`,
        confidence: 'observed',
      });
    }
  }

  const nonIntakeEntries = allEntries.filter((e) => e.type !== 'intake');
  if (nonIntakeEntries.length > 0) {
    const typeCounts: Record<string, number> = {};
    for (const e of nonIntakeEntries) {
      typeCounts[e.type] = (typeCounts[e.type] ?? 0) + 1;
    }
    const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      takeaways.push({
        text: `You tracked ${entryTypeLabel(sorted[0][0])} most consistently.`,
        confidence: 'observed',
      });
    }
  }

  if (window === 'daily' && ndsScore !== null) {
    takeaways.push({
      text: `Nutrition density score: ${Math.round(ndsScore)}/100.`,
      confidence: 'observed',
    });
  }

  const visible = takeaways.slice(0, 3);

  return (
    <ModuleCard title="Top Takeaways">
      {visible.length >= 2 ? (
        <ul className="space-y-3">
          {visible.map((t, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-dark_accent-500 mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/80 antialiased leading-relaxed">{t.text}</p>
                <ConfidenceBadge level={t.confidence} />
              </div>
            </li>
          ))}
        </ul>
      ) : visible.length === 1 ? (
        <div>
          <div className="flex items-start gap-3 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-dark_accent-500 mt-1.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/80 antialiased leading-relaxed">{visible[0].text}</p>
              <ConfidenceBadge level={visible[0].confidence} />
            </div>
          </div>
          <p className="text-sm text-white/40 antialiased">Keep logging to build your picture.</p>
        </div>
      ) : (
        <EmptyState message="Log a few days of activity and your top takeaways will appear here." />
      )}
    </ModuleCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Module 2 — Progress Narrative                                      */
/* ------------------------------------------------------------------ */

function ProgressNarrative({
  dayActivities,
  allEntries,
  dailyTotalsList,
  ndsScore,
  activeDays,
  window,
  loading,
}: {
  dayActivities: DayActivity[];
  allEntries: JournalEntry[];
  dailyTotalsList: DailyTotals[];
  ndsScore: number | null;
  activeDays: number;
  window: TimeWindow;
  loading: boolean;
}) {
  if (loading) {
    return (
      <ModuleCard title="Progress">
        <div className="h-4 w-3/4 bg-white/[0.06] rounded animate-pulse" />
      </ModuleCard>
    );
  }

  const totalDays = windowDayCount(window);

  if (allEntries.length === 0) {
    return (
      <ModuleCard title="Progress">
        <EmptyState message="Your progress story builds as you log. Even one entry a day adds up." />
      </ModuleCard>
    );
  }

  const sentences: string[] = [];

  if (window === 'daily') {
    const categories = new Set(allEntries.map((e) => e.type));
    sentences.push(
      `Today you logged ${allEntries.length} entr${allEntries.length === 1 ? 'y' : 'ies'} across ${categories.size} categor${categories.size === 1 ? 'y' : 'ies'}.`
    );
    const daysWithIntake = dailyTotalsList.filter((t) => t.caloriesConsumed > 0);
    if (daysWithIntake.length > 0) {
      sentences.push(`${Math.round(daysWithIntake[0].caloriesConsumed).toLocaleString()} calories logged.`);
    }
    if (ndsScore !== null) {
      sentences.push(`Nutrition density: ${Math.round(ndsScore)}/100.`);
    }
  } else if (window === '7day') {
    sentences.push(`Over the past week you were active ${activeDays} of 7 days.`);
    const momentum = compute3DayMomentum(dayActivities);
    const momentumLabel = momentum === 'up' ? 'Momentum is picking up.' : momentum === 'down' ? 'Momentum has slowed.' : 'Momentum is holding steady.';
    sentences.push(momentumLabel);
    const daysWithCal = dailyTotalsList.filter((t) => t.caloriesConsumed > 0);
    if (daysWithCal.length >= 3) {
      const avgCal = Math.round(daysWithCal.reduce((s, t) => s + t.caloriesConsumed, 0) / daysWithCal.length);
      sentences.push(`Averaging ${avgCal.toLocaleString()} cal on active days.`);
    }
  } else {
    sentences.push(`Over the past two weeks you were active ${activeDays} of ${totalDays} days.`);
    const direction = compute7DayDirection(activeDays);
    sentences.push(`Direction: ${direction}.`);
    if (activeDays >= 7) {
      sentences.push('Building a solid base of data.');
    }
  }

  return (
    <ModuleCard title="Progress">
      <p className="text-sm text-white/70 antialiased leading-relaxed">
        {sentences.join(' ')}
      </p>
    </ModuleCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Module 3 — Patterns (single-variable only)                         */
/* ------------------------------------------------------------------ */

function Patterns({
  allEntries,
  dayActivities,
  activeDays,
  window,
  loading,
}: {
  allEntries: JournalEntry[];
  dayActivities: DayActivity[];
  activeDays: number;
  window: TimeWindow;
  loading: boolean;
}) {
  if (loading) {
    return (
      <ModuleCard title="Patterns">
        <div className="space-y-2 animate-pulse">
          <div className="h-3 w-2/3 bg-white/[0.06] rounded" />
          <div className="h-3 w-1/2 bg-white/[0.06] rounded" />
        </div>
      </ModuleCard>
    );
  }

  if (activeDays < 3 && window !== 'daily') {
    return (
      <ModuleCard title="Patterns">
        <EmptyState message="Patterns emerge after a few days of consistent logging." />
      </ModuleCard>
    );
  }

  if (allEntries.length === 0) {
    return (
      <ModuleCard title="Patterns">
        <EmptyState message="Patterns emerge after a few days of consistent logging." />
      </ModuleCard>
    );
  }

  const patterns: { text: string; confidence: 'observed' | 'likely' }[] = [];

  // 1. Time-of-day pattern
  const blockCounts: Record<TimeBlock, number> = { morning: 0, midday: 0, evening: 0 };
  for (const e of allEntries) {
    const b = deriveBlock(e.timestamp);
    blockCounts[b]++;
  }
  const topBlock = (Object.entries(blockCounts) as [TimeBlock, number][])
    .sort((a, b) => b[1] - a[1])[0];
  if (topBlock[1] > 0) {
    patterns.push({
      text: `Most of your logging happens in the ${blockLabel(topBlock[0])}.`,
      confidence: 'observed',
    });
  }

  // 2. Active day pattern (needs 7+ days)
  if (window !== 'daily' && dayActivities.length >= 7) {
    const dayOfWeekCounts: Record<number, number> = {};
    for (const d of dayActivities) {
      if (d.active) {
        const dow = d.date.getDay();
        dayOfWeekCounts[dow] = (dayOfWeekCounts[dow] ?? 0) + 1;
      }
    }
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const sorted = Object.entries(dayOfWeekCounts)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 3);
    if (sorted.length >= 2) {
      const topDays = sorted.map(([dow]) => dayNames[Number(dow)]);
      patterns.push({
        text: `You tend to log more on ${topDays.join(', ')}.`,
        confidence: 'likely',
      });
    }
  }

  // 3. Entry type distribution
  const typeCounts: Record<string, number> = {};
  for (const e of allEntries) {
    typeCounts[e.type] = (typeCounts[e.type] ?? 0) + 1;
  }
  const sortedTypes = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (sortedTypes.length >= 2) {
    const labels = sortedTypes.map(([t]) => entryTypeLabel(t));
    patterns.push({
      text: `Your top tracked categories: ${labels.join(', ')}.`,
      confidence: 'observed',
    });
  }

  const visible = patterns.slice(0, 3);

  if (visible.length === 0) {
    return (
      <ModuleCard title="Patterns">
        <EmptyState message="Patterns emerge after a few days of consistent logging." />
      </ModuleCard>
    );
  }

  return (
    <ModuleCard title="Patterns">
      <ul className="space-y-3">
        {visible.map((p, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-white/20 mt-1.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/70 antialiased leading-relaxed">{p.text}</p>
              <ConfidenceBadge level={p.confidence} />
            </div>
          </li>
        ))}
      </ul>
    </ModuleCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Module 4 — Plan-Based Insights                                     */
/* ------------------------------------------------------------------ */

function PlanBasedInsights({
  goals,
  profile,
  dailyTotalsList,
  allEntries,
  loading,
}: {
  goals: UserGoals | null;
  profile: ProfileData | null;
  dailyTotalsList: DailyTotals[];
  allEntries: JournalEntry[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <ModuleCard title="Plan-Based Insights">
        <div className="space-y-2 animate-pulse">
          <div className="h-3 w-1/2 bg-white/[0.06] rounded" />
        </div>
      </ModuleCard>
    );
  }

  const hasCustomGoals = goals && !goals.isDefault;
  const hasProfile = profile && (profile.primary_goal || profile.dietary_style);

  if (!hasCustomGoals && !hasProfile) {
    return (
      <ModuleCard title="Plan-Based Insights">
        <EmptyState
          message="Set your goals and preferences in Profile to unlock plan-based insights."
          cta={{ label: 'Go to Profile', href: '/journal/profile' }}
        />
      </ModuleCard>
    );
  }

  const daysWithIntake = dailyTotalsList.filter((t) => t.caloriesConsumed > 0);

  if (hasCustomGoals && daysWithIntake.length === 0) {
    return (
      <ModuleCard title="Plan-Based Insights">
        <EmptyState message="Log some meals to see how your intake compares to your targets." />
      </ModuleCard>
    );
  }

  const insights: React.ReactNode[] = [];

  // 1. Calorie tracking
  if (hasCustomGoals && daysWithIntake.length > 0) {
    const avgCal = Math.round(
      daysWithIntake.reduce((s, t) => s + t.caloriesConsumed, 0) / daysWithIntake.length
    );
    const pct = Math.round((avgCal / goals!.dailyCalorieGoal) * 100);
    insights.push(
      <div key="cal" className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-white/50 antialiased">Calories</span>
          <span className="text-xs text-white/40 antialiased">
            {pct}% of {goals!.dailyCalorieGoal.toLocaleString()} cal goal
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-dark_accent-500 transition-all duration-700"
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <ConfidenceBadge level="observed" />
      </div>
    );
  }

  // 2. Macro balance
  if (hasCustomGoals && daysWithIntake.length > 0) {
    const avgProtein = Math.round(
      daysWithIntake.reduce((s, t) => s + t.macrosConsumed.protein, 0) / daysWithIntake.length
    );
    insights.push(
      <div key="macro" className="flex items-center gap-2">
        <p className="text-sm text-white/70 antialiased">
          Protein averaging <span className="font-semibold text-white/90">{avgProtein}g</span>/day vs{' '}
          <span className="text-white/50">{goals!.macroGoals.protein_g}g goal</span>
        </p>
        <ConfidenceBadge level="observed" />
      </div>
    );
  }

  // 3. Log timing overview (descriptive, not adherence)
  if (profile?.eating_window && allEntries.length > 0) {
    const intakeEntries = allEntries.filter((e) => e.type === 'intake');
    if (intakeEntries.length >= 3) {
      const hours = intakeEntries.map((e) => e.timestamp.getHours());
      const earliest = Math.min(...hours);
      const latest = Math.max(...hours);
      const fmtHour = (h: number) => {
        const ampm = h >= 12 ? 'pm' : 'am';
        const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
        return `${display}${ampm}`;
      };
      insights.push(
        <div key="timing" className="flex items-center gap-2">
          <p className="text-sm text-white/70 antialiased">
            Most entries logged between{' '}
            <span className="font-semibold text-white/90">{fmtHour(earliest)}</span> and{' '}
            <span className="font-semibold text-white/90">{fmtHour(latest)}</span>
          </p>
          <ConfidenceBadge level="observed" />
        </div>
      );
    }
  }

  if (insights.length === 0) {
    return (
      <ModuleCard title="Plan-Based Insights">
        <EmptyState message="Log some meals to see how your intake compares to your targets." />
      </ModuleCard>
    );
  }

  return (
    <ModuleCard title="Plan-Based Insights">
      <div className="space-y-4">{insights}</div>
    </ModuleCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Module 5 — Success Practices                                       */
/* ------------------------------------------------------------------ */

function SuccessPractices({
  dayActivities,
  activeDays,
  loading,
}: {
  dayActivities: DayActivity[];
  activeDays: number;
  loading: boolean;
}) {
  if (loading) {
    return (
      <ModuleCard title="Success Practices">
        <div className="h-3 w-2/3 bg-white/[0.06] rounded animate-pulse" />
      </ModuleCard>
    );
  }

  if (activeDays < 3) {
    return (
      <ModuleCard title="Success Practices">
        <EmptyState message="A few more days of logging and we can highlight what's working for you." />
      </ModuleCard>
    );
  }

  const practices: string[] = [];

  // 1. Best streak
  const checkinStreak = computeCheckinStreak(dayActivities);
  if (checkinStreak >= 2) {
    practices.push(`Your current logging streak is ${checkinStreak} days.`);
  }

  // 2. Diverse logging days — 2+ distinct entry_type categories
  const diverseDays = dayActivities.filter((d) => {
    const types = new Set(d.entries.map((e) => e.type));
    return types.size >= 2;
  }).length;
  if (diverseDays > 0) {
    practices.push(`${diverseDays} day${diverseDays !== 1 ? 's' : ''} with multiple tracked categories.`);
  }

  // 3. Consistency improvement
  const direction = compute7DayDirection(activeDays);
  if (direction === 'Improving') {
    practices.push('Your consistency is trending up.');
  }

  if (practices.length === 0) {
    return (
      <ModuleCard title="Success Practices">
        <EmptyState message="A few more days of logging and we can highlight what's working for you." />
      </ModuleCard>
    );
  }

  return (
    <ModuleCard title="Success Practices">
      <ul className="space-y-2">
        {practices.map((p, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-dark_accent-500 mt-1.5 shrink-0" />
            <p className="text-sm text-white/70 antialiased leading-relaxed">{p}</p>
          </li>
        ))}
      </ul>
    </ModuleCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Module 6 — Try This Next                                           */
/* ------------------------------------------------------------------ */

function TryThisNext({
  goals,
  profile,
  todayEntries,
  checkinStreak,
  loading,
}: {
  goals: UserGoals | null;
  profile: ProfileData | null;
  todayEntries: JournalEntry[];
  checkinStreak: number;
  loading: boolean;
}) {
  if (loading) {
    return (
      <ModuleCard title="Try This Next">
        <div className="h-4 w-3/4 bg-white/[0.06] rounded animate-pulse" />
      </ModuleCard>
    );
  }

  let message: string;
  let cta: { label: string; href: string };

  const profileIncomplete = !profile?.primary_goal || !profile?.dietary_style || !profile?.date_of_birth;
  const goalsAreDefault = !goals || goals.isDefault;

  // Priority 1: guide first-time users to setup
  if (profileIncomplete && goalsAreDefault) {
    message = 'Setting up your profile and goals helps us shape better insights for you.';
    cta = { label: 'Set up profile', href: '/journal/profile' };
  }
  // Priority 2: no entries today
  else if (todayEntries.length === 0) {
    message = 'Start with a quick log — even one entry counts.';
    cta = { label: 'Log now', href: '/journal/log' };
  }
  // Priority 3: only intake logged
  else if (todayEntries.every((e) => e.type === 'intake')) {
    message = 'Try tracking another category like hydration or mood for a fuller picture.';
    cta = { label: 'Log water', href: '/journal/log?type=water' };
  }
  // Priority 4: streak building
  else if (checkinStreak >= 2) {
    message = `Keep your ${checkinStreak}-day streak going with a check-in today.`;
    cta = { label: 'Log now', href: '/journal/log' };
  }
  // Priority 5: fallback
  else {
    message = 'Consistency beats perfection. One entry today keeps your data building.';
    cta = { label: 'Log now', href: '/journal/log' };
  }

  return (
    <ModuleCard title="Try This Next">
      <p className="text-sm text-white/70 antialiased leading-relaxed mb-4">{message}</p>
      <Link
        href={cta.href}
        className="block w-full text-center py-3 rounded-full bg-dark_accent-500/20 hover:bg-dark_accent-500/30 active:bg-dark_accent-500/40 transition-colors text-sm font-medium text-dark_accent-300 antialiased"
      >
        {cta.label}
      </Link>
    </ModuleCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Module 7 — Confidence / Readiness Note                             */
/* ------------------------------------------------------------------ */

function ConfidenceNote({ activeDays }: { activeDays: number }) {
  let note: string;
  if (activeDays < 3) {
    note = 'These insights are based on limited data. The more you log, the more accurate they become.';
  } else if (activeDays < 7) {
    note = 'Based on early observations. Keep logging for stronger patterns.';
  } else {
    note = `Based on ${activeDays} days of tracked activity.`;
  }

  return (
    <p className="text-white/30 text-xs antialiased leading-relaxed text-center px-4">
      {note}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function JournalInsightsPage() {
  const [window, setWindow] = useState<TimeWindow>('daily');
  const [dayActivities, setDayActivities] = useState<DayActivity[]>([]);
  const [allEntries, setAllEntries] = useState<JournalEntry[]>([]);
  const [dailyTotalsList, setDailyTotalsList] = useState<DailyTotals[]>([]);
  const [goals, setGoals] = useState<UserGoals | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [activeDays, setActiveDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const fetchIdRef = useRef(0);

  const todayKey = toDateKey(new Date());

  // NDS: called unconditionally at top level, gated via `enabled`
  const { data: ndsData } = useNDS({
    dateLocal: todayKey,
    enabled: window === 'daily',
    autoFetch: true,
  });

  const ndsScore = window === 'daily' && ndsData ? ndsData.nds_score_100 : null;

  useEffect(() => {
    const currentFetch = ++fetchIdRef.current;

    (async () => {
      setLoading(true);
      try {
        const dayCount = windowDayCount(window);
        const dates = lastNDays(dayCount);
        const today = new Date();

        const entryResults = await Promise.allSettled(
          dates.map((d) => journalService.listEntriesByDay(d))
        );

        if (currentFetch !== fetchIdRef.current) return;

        const [goalsResult, profileResult] = await Promise.allSettled([
          journalService.getGoals(),
          fetch('/api/journal/profile').then((r) => (r.ok ? r.json() : null)),
        ]);

        if (currentFetch !== fetchIdRef.current) return;

        if (goalsResult.status === 'fulfilled') setGoals(goalsResult.value);
        if (profileResult.status === 'fulfilled' && profileResult.value?.profile) {
          setProfile(profileResult.value.profile);
        }

        const activities: DayActivity[] = [];
        const allE: JournalEntry[] = [];
        const totals: DailyTotals[] = [];

        dates.forEach((d, i) => {
          const result = entryResults[i];
          const dayEntries = result.status === 'fulfilled' ? result.value : [];
          const dk = toDateKey(d);
          const filtered = dayEntries.filter(
            (e: JournalEntry) => toDateKey(e.timestamp) === dk
          );

          activities.push({
            date: d,
            dateKey: dk,
            entryCount: filtered.length,
            active: filtered.length > 0,
            isToday: isSameLocalDate(d, today),
            entries: filtered,
          });

          allE.push(...filtered);
          totals.push(calculateDailyTotals(filtered));
        });

        if (currentFetch !== fetchIdRef.current) return;

        setDayActivities(activities);
        setAllEntries(allE);
        setDailyTotalsList(totals);
        setActiveDays(activities.filter((d) => d.active).length);
      } catch (err) {
        console.warn('[JournalInsights] Failed to load data:', err);
        setDayActivities([]);
        setAllEntries([]);
        setDailyTotalsList([]);
        setActiveDays(0);
      } finally {
        if (currentFetch === fetchIdRef.current) setLoading(false);
      }
    })();
  }, [window]);

  const todayEntries = dayActivities.find((d) => d.isToday)?.entries ?? [];
  const checkinStreak = computeCheckinStreak(dayActivities);

  const windows: { key: TimeWindow; label: string }[] = [
    { key: 'daily', label: 'Daily' },
    { key: '7day', label: '7 days' },
    { key: '14day', label: '14 days' },
  ];

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        {/* Page header */}
        <div className="w-full max-w-[650px] mx-auto px-5 pt-14 pb-2">
          <h1 className="text-2xl font-semibold antialiased">Insights</h1>
          <p className="text-sm text-white/50 antialiased mt-0.5">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>

          {/* Time window selector */}
          <div className="flex gap-2 mt-4">
            {windows.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => setWindow(w.key)}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors antialiased ${
                  window === w.key
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {/* Modules */}
        <div className="w-full max-w-[650px] mx-auto px-5 space-y-4 mt-6">
          {/* Module 1 — Top Takeaways */}
          <TopTakeaways
            dayActivities={dayActivities}
            allEntries={allEntries}
            dailyTotalsList={dailyTotalsList}
            goals={goals}
            ndsScore={ndsScore}
            window={window}
            activeDays={activeDays}
            loading={loading}
          />

          {/* Module 2 — Progress Narrative */}
          <ProgressNarrative
            dayActivities={dayActivities}
            allEntries={allEntries}
            dailyTotalsList={dailyTotalsList}
            ndsScore={ndsScore}
            activeDays={activeDays}
            window={window}
            loading={loading}
          />

          {/* Module 3 — Patterns */}
          <Patterns
            allEntries={allEntries}
            dayActivities={dayActivities}
            activeDays={activeDays}
            window={window}
            loading={loading}
          />

          {/* Module 4 — Plan-Based Insights */}
          <PlanBasedInsights
            goals={goals}
            profile={profile}
            dailyTotalsList={dailyTotalsList}
            allEntries={allEntries}
            loading={loading}
          />

          {/* Module 5 — Success Practices */}
          <SuccessPractices
            dayActivities={dayActivities}
            activeDays={activeDays}
            loading={loading}
          />

          {/* Module 6 — Try This Next */}
          <TryThisNext
            goals={goals}
            profile={profile}
            todayEntries={todayEntries}
            checkinStreak={checkinStreak}
            loading={loading}
          />

          {/* Module 7 — Confidence Note */}
          <div className="pt-2 pb-4">
            <ConfidenceNote activeDays={activeDays} />
          </div>
        </div>
      </div>

      <JournalFooterNav />
    </div>
  );
}
