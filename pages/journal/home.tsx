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
        <p className="text-xs font-semibold text-brand-50/80 antialiased">
          Today&apos;s Rhythm
        </p>
        <span className="text-[11px] text-brand-50/35 antialiased">{formatTodayLabel()}</span>
      </div>
      <div className="relative isolate overflow-hidden rounded-[24px] bg-brand-800 shadow-large">
        <Image
          src={TODAY_RHYTHM_BG}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 650px"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-brand-900/40 to-black/55" />
        <div className="relative z-10 p-5 sm:px-20 sm:py-6">
          <div className="mb-3">
            <h2 className="text-2xl font-semibold text-white antialiased sm:text-3xl">Schedule Preview</h2>
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
                return (
                  <div
                    key={slot.key}
                    className={`grid grid-cols-[86px_1fr_auto] items-center gap-3 rounded-full px-4 py-1.5 text-sm ${
                      isActionable
                        ? 'bg-white/18 text-white'
                        : 'bg-transparent text-white/85'
                    }`}
                  >
                    <span className="whitespace-nowrap text-white/80 antialiased">{formatTime12h(slot.target_time)}</span>
                    <span className="truncate font-semibold text-white antialiased">{slot.label}</span>
                    {isActionable ? (
                      <Link
                        href={buildLogMealHref(slot)}
                        className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-white transition-colors hover:bg-white/10"
                      >
                        Log Now
                      </Link>
                    ) : (
                      <span className="shrink-0 text-xs text-white/55">
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
            className="mt-4 block w-full rounded-full bg-[#d7ecff] py-3 text-center text-sm font-semibold text-black transition-colors hover:bg-brand-50"
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
    <section className="w-full max-w-[650px] mx-auto">
      <div className="mb-3">
        <h2 className="text-xs font-semibold text-brand-50/80 antialiased">
          Nutrition Density So Far Today
        </h2>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/25 bg-transparent">
        <div className="overflow-x-auto px-4 py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-0">
            <div className="w-44 shrink-0 border-r border-white/25 px-5 py-2 text-center text-white">
              <p className="whitespace-nowrap text-xs text-white/70 antialiased">
                Overall Score
              </p>
              <span className="mt-2 block whitespace-nowrap text-3xl font-semibold leading-none">
                {isLoading ? '...' : overallScore ?? 'n/a'}
              </span>
            </div>
            {factors.map((factor) => (
              <div
                key={factor.label}
                className="w-44 shrink-0 border-r border-white/25 px-5 py-2 text-center last:border-r-0"
                title={`${factor.label}: ${getSubscoreStatus(factor.score, hasLoggedNutrition)}`}
              >
                <p className="whitespace-nowrap text-xs text-white/70 antialiased">{factor.label}</p>
                <p className="mt-2 whitespace-nowrap text-3xl font-semibold leading-none text-white antialiased">
                  {isLoading ? 'Pending' : getSubscoreStatus(factor.score, hasLoggedNutrition)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const quickEntryItems = [
  { label: 'Log Meal', href: `${APP_ROUTES.logNew}?tab=food`, accent: 'bg-[#f1eaa8] text-black/60' },
  { label: 'Hydration', href: `${APP_ROUTES.logNew}?tab=water`, accent: 'bg-[#9ccbdd] text-black/60' },
  { label: 'Mood', href: `${APP_ROUTES.logNew}?tab=mood`, accent: 'bg-[#cee5a8] text-black/60' },
  { label: 'Movement', href: `${APP_ROUTES.logNew}?tab=movement`, accent: 'bg-[#bfc2e1] text-black/60' },
  { label: 'More', href: APP_ROUTES.logNew, accent: 'bg-[#666663] text-white/70' },
];

function QuickEntryModule() {
  return (
    <section className="w-full max-w-[650px] mx-auto">
      <p className="text-[11px] font-semibold text-brand-50/60 antialiased">
        Quick Entry
      </p>
      <h2 className="text-xs font-semibold text-white antialiased">What would you like to do?</h2>
      <div className="mt-3 grid grid-cols-5 gap-2 sm:gap-6">
        {quickEntryItems.map((item) => (
          <Link key={item.label} href={item.href} className="group flex flex-col items-center gap-2">
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-full transition-transform group-hover:scale-[1.03] sm:h-16 sm:w-16 ${item.accent}`}
              aria-hidden
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
            </span>
            <span className="text-center text-[10px] font-medium leading-tight text-white/75 antialiased sm:text-xs">
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
      <div className="relative isolate min-h-[150px] overflow-hidden rounded-[24px] bg-brand-800 shadow-large sm:min-h-[180px]">
        <Image
          src={PREP_PANTRY_BG}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 650px"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-brand-900/55 to-black/20" />
        <div className="relative z-10 p-5 sm:p-6">
          <span className="inline-flex rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white/80">
            Prep & Pantry
          </span>
          <h2 className="mt-4 max-w-md text-2xl font-semibold leading-tight text-white antialiased sm:text-3xl">
            {hasActivePlan ? 'Review grocery readiness' : 'Build your pantry foundation'}
          </h2>
          <p className="mt-1 max-w-md text-sm text-white/75 antialiased">
            {hasActivePlan
              ? 'Use the current planning and grocery surface to review staples and keep upcoming meals easier to execute.'
              : 'A pantry baseline will pair with more precise grocery lists once your planning workflow has enough context.'}
          </p>
          <ul className="sr-only">
            <li>Staples to keep on hand</li>
            <li>Low-item review before grocery runs</li>
            <li>Cleaner handoff from plans to shopping</li>
          </ul>
          <Link
            href={groceryHref}
            className="mt-5 inline-flex w-full justify-center rounded-full bg-[#d7ecff] px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-brand-50"
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
      headline: 'Build Your Foundation',
      body: 'Create daily consistency with meals, habits and awareness.',
      href: APP_ROUTES.programs,
      image: BASELINE_CARD_IMAGE,
    },
    {
      eyebrow: 'Why it matters today',
      headline: 'Protein at breakfast supports steady energy and focus',
      body: 'See Why →',
      href: APP_ROUTES.log,
      image: CASE_STUDY_CARD_IMAGE,
    },
  ];

  return (
    <section className="grid w-full max-w-[650px] grid-cols-1 gap-3 sm:grid-cols-2 mx-auto">
      {cards.map((card, index) => (
        <Link
          key={card.headline}
          href={card.href}
          className={`overflow-hidden rounded-2xl bg-brand-50 text-black shadow-large transition-transform hover:scale-[1.01] ${
            index === 1 ? 'grid grid-cols-[1fr_112px] sm:block' : ''
          }`}
        >
          <div className={`relative ${index === 1 ? 'order-2 h-full min-h-[120px] sm:h-32' : 'h-32'}`}>
            <Image src={card.image} alt="" fill className="object-cover" sizes="(max-width: 768px) 100vw, 325px" />
          </div>
          <div className="p-4">
            <p className="text-[11px] font-semibold text-black/40">{card.eyebrow}</p>
            <h3 className="mt-1 text-base font-semibold leading-tight text-black antialiased">{card.headline}</h3>
            <p className="mt-1 text-xs leading-relaxed text-black/55 antialiased">{card.body}</p>
          </div>
        </Link>
      ))}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

export default function JournalHomePage() {
  const [todayEntries, setTodayEntries] = useState<JournalEntry[]>([]);
  const [mealSchedule, setMealSchedule] = useState<MealSchedule>(() => defaultMealSchedule());
  const [firstName, setFirstName] = useState<string | null>(null);
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
        const today = new Date();
        const results = await journalService.listEntriesByDay(today);
        const todayDk = toDateKey(today);
        const todayItems = results.filter(
          (e: JournalEntry) => toDateKey(e.timestamp) === todayDk
        );
        setTodayEntries(todayItems);
      } catch (err) {
        console.warn('[JournalHome] Failed to load today data:', err);
        setTodayEntries([]);
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
        const profile = data.profile as Record<string, unknown> | undefined;
        setMealSchedule(normalizeMealSchedule(profile?.meal_schedule));
        setFirstName(typeof profile?.first_name === 'string' && profile.first_name.trim() ? profile.first_name.trim() : null);
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
    <div className="min-h-screen bg-[#16110d] text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        {/* ── Hero: Title ──────────────────────────────────────────── */}
        <div className="relative isolate overflow-hidden bg-gradient-to-b from-[#1a1711] via-[#2b2118] to-[#17110d]">
          <div className="absolute inset-0">
            <div className="absolute -top-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-200/10 blur-3xl" />
            <div className="absolute -bottom-16 left-1/2 h-56 w-[720px] -translate-x-1/2 rounded-full bg-black/35 blur-3xl" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-[#17110d]/95" />
          </div>

          {/* Interior content */}
          <div className="relative z-10 w-full max-w-[650px] mx-auto px-5 pb-12 pt-20 sm:pb-16 sm:pt-24">
            <div className="text-center">
              <h1 className="mx-auto max-w-[520px] text-5xl font-semibold leading-[0.95] tracking-[-0.04em] text-white antialiased sm:text-6xl">
                {getGreeting()}
                {firstName ? (
                  <>
                    ,<br />
                    {firstName}
                  </>
                ) : (
                  '.'
                )}
              </h1>
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/60 antialiased">
                Let&apos;s set you up for a strong day.
              </p>
            </div>
          </div>
        </div>

        <div className="-mt-4 rounded-t-[28px] bg-[#16110d] px-4 pb-6 pt-6 sm:px-5">
          <div className="mx-auto max-w-[650px] space-y-6">
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
        </div>
      </div>

      <JournalFooterNav />
    </div>
  );
}
