/**
 * TodayRhythm — /journal/home "Today's Rhythm" schedule-preview module.
 *
 * Extracted verbatim from pages/journal/home.tsx (Packet 2B-B). Presentational
 * and prop-driven: the page resolves the user's meal slots + today's entries and
 * passes them in. The module derives the actionable meal, logged/upcoming labels,
 * and renders the schedule preview with a "View Full Day Plan" CTA.
 *
 * No data fetching, auth, or services live here — only pure schedule helpers.
 */

import Link from 'next/link';
import { toDateKey, type JournalEntry } from '@/lib/journal';
import { getMealSlotForEntry } from '@/lib/journal/mealScheduleAssignment';
import { hhmmToMinutes } from '@/lib/plans/scheduleResolver';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import type { ResolvedScheduleSlot } from '@/lib/plans/types';

function todayLocalKey(): string {
  return toDateKey(new Date());
}

function formatTime12h(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
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

export interface TodayRhythmProps {
  slots: ResolvedScheduleSlot[];
  todayEntries: JournalEntry[];
  loading: boolean;
  dayPlanHref: string;
  dayPlanCtaLabel?: string;
}

export function TodayRhythm({
  slots,
  todayEntries,
  loading,
  dayPlanHref,
  dayPlanCtaLabel = 'View Full Day Plan',
}: TodayRhythmProps) {
  const actionable = chooseActionableMeal(slots, todayEntries);

  return (
    <section className="w-full max-w-[1000px] mx-auto">
      <div className="mb-3">
        <p className="text-base sm:text-xl font-semibold text-white antialiased">
          Today&apos;s Rhythm
        </p>
      </div>
      <div className="overflow-hidden rounded-[24px] border border-brand-50/50 bg-brand-800 shadow-large">
        <div className="px-5 py-10 sm:px-16 sm:py-12">
          <div className="sm:mb-1 mb-2">
            <h2 className="text-[1.5rem] font-semibold text-white antialiased sm:text-3xl">Schedule Preview</h2>
          </div>

          <div className="space-y-0.5">
            {loading ? (
              [0, 1, 2].map((item) => (
                <div key={item} className="h-7 rounded-full bg-white/[0.10] animate-pulse" />
              ))
            ) : slots.length === 0 ? (
              <div className="rounded-2xl bg-white/[0.10] p-4 text-sm text-white/80">
                Add meal times in Profile to personalize your rhythm.
              </div>
            ) : (
              slots.map((slot) => {
                const logged = isMealSlotLogged(slot, todayEntries, slots);
                const isActionable = actionable?.key === slot.key;
                const rowClassName =
                  'grid grid-cols-[86px_1fr_auto] items-center gap-3 rounded-full px-4 py-0.5 text-sm transition-colors sm:text-base';
                const rowContent = (
                  <>
                    <span className="whitespace-nowrap text-white antialiased">{formatTime12h(slot.target_time)}</span>
                    <span className="truncate font-semibold text-white antialiased sm:font-normal">{slot.label}</span>
                    <span
                      className={`shrink-0 justify-self-end text-right ${
                        isActionable ? 'font-semibold text-white sm:font-normal' : 'text-white/55'
                      }`}
                    >
                      {isActionable ? 'Log Now' : logged ? 'Logged' : 'Upcoming'}
                    </span>
                  </>
                );

                return isActionable ? (
                  <Link
                    key={slot.key}
                    href={buildLogMealHref(slot)}
                    className={`${rowClassName} bg-white/20 text-white hover:bg-white/[0.35]`}
                  >
                    {rowContent}
                  </Link>
                ) : (
                  <div key={slot.key} className={`${rowClassName} bg-transparent text-white/85`}>
                    {rowContent}
                  </div>
                );
              })
            )}
          </div>

          <Link
            href={dayPlanHref}
            className="mt-4 block w-full rounded-full bg-[#d7ecff] py-3 text-center text-sm font-semibold text-black transition-colors hover:bg-brand-50"
          >
            {dayPlanCtaLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}

export default TodayRhythm;
