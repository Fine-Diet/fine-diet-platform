'use client';

/**
 * /journal/plans/eat-out/new — Packet 5 eat-out event entry point.
 *
 * Accepts:
 *   - a plan slot (via ?slot_id=... query param from the day view, or
 *     picked here from the user's active plans)
 *   - a restaurant name
 *   - a menu source (pasted text or URL)
 *
 * On submit:
 *   1. POST /api/journal/plans/ai/import-menu      → ImportedMenu
 *   2. POST /api/journal/plans/ai/recommend-menu-picks → PlannedEatOutEvent
 *   3. Redirects to /journal/plans/eat-out/[event.id]
 *
 * Copy is deliberate per §8e: we do not imply restaurant estimates are
 * highly precise. The detail surface is where confidence is fully
 * surfaced; this page just gets the capture through.
 */

import { useRouter } from 'next/router';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import {
  planService,
  type Plan,
  type PlanDay,
  type PlanSlot,
} from '@/lib/plans';

interface PickedSlot {
  plan_id: string;
  plan_title: string | null;
  day: PlanDay;
  slot: PlanSlot;
}

function slotLabel(slot: PlanSlot): string {
  if (slot.slot_label) return slot.slot_label;
  if (slot.slot_block === 'morning') return 'Morning';
  if (slot.slot_block === 'midday') return 'Midday';
  if (slot.slot_block === 'evening') return 'Evening';
  return `Slot ${slot.slot_ordinal + 1}`;
}

function fmtDay(d: string): string {
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return d;
  }
}

export default function EatOutNewPage() {
  const router = useRouter();
  const preSlotId =
    typeof router.query.slot_id === 'string' ? router.query.slot_id : null;

  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [planDetail, setPlanDetail] = useState<{
    plan: Plan;
    days: PlanDay[];
    slots: PlanSlot[];
  } | null>(null);
  const [planDetailLoading, setPlanDetailLoading] = useState(false);
  const [picked, setPicked] = useState<PickedSlot | null>(null);

  const [restaurantName, setRestaurantName] = useState('');
  const [mode, setMode] = useState<'text' | 'url'>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await planService.list();
        if (cancelled) return;
        setPlans(list);
        const active = list.find((p) => p.status === 'active') ?? list[0];
        if (active) setSelectedPlanId(active.id);
      } catch {
        // leave plans empty — user can still go back
      } finally {
        if (!cancelled) setPlansLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedPlanId) {
      setPlanDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setPlanDetailLoading(true);
      try {
        const detail = await planService.getDetail(selectedPlanId);
        if (cancelled) return;
        setPlanDetail({
          plan: detail.plan,
          days: detail.days,
          slots: detail.slots,
        });
      } catch {
        if (!cancelled) setPlanDetail(null);
      } finally {
        if (!cancelled) setPlanDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPlanId]);

  // Resolve pre-supplied slot_id against loaded plan detail.
  useEffect(() => {
    if (!preSlotId || !planDetail) return;
    const slot = planDetail.slots.find((s) => s.id === preSlotId);
    if (!slot) return;
    const day = planDetail.days.find((d) => d.id === slot.plan_day_id);
    if (!day) return;
    setPicked({
      plan_id: planDetail.plan.id,
      plan_title: planDetail.plan.title ?? null,
      day,
      slot,
    });
  }, [preSlotId, planDetail]);

  const daysBySlot = useMemo(() => {
    const map = new Map<string, PlanDay>();
    if (planDetail) for (const d of planDetail.days) map.set(d.id, d);
    return map;
  }, [planDetail]);

  const canSubmit =
    picked !== null &&
    (mode === 'text' ? text.trim().length > 0 : url.trim().length > 0);

  async function handleSubmit() {
    if (!canSubmit || submitting || !picked) return;
    setSubmitting(true);
    setError(null);
    try {
      const importInput: {
        restaurant_name?: string;
        text?: string | null;
        url?: string | null;
      } = {};
      if (restaurantName.trim().length > 0)
        importInput.restaurant_name = restaurantName.trim();
      if (mode === 'text' && text.trim().length > 0) importInput.text = text.trim();
      if (mode === 'url' && url.trim().length > 0) importInput.url = url.trim();

      const imported = await planService.importMenu(importInput);
      const rec = await planService.recommendMenuPicks({
        imported_menu_id: imported.imported_menu.id,
        slot_id: picked.slot.id,
      });
      await router.push(`/journal/plans/eat-out/${rec.eat_out_event.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create eat-out event.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="w-full max-w-[650px] mx-auto px-5 pt-14 pb-2">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold antialiased">Plan eat-out</h1>
            <Link
              href="/journal/plans"
              className="text-xs text-white/60 hover:text-white/80 antialiased"
            >
              ← Plans
            </Link>
          </div>
          <p className="text-sm text-white/50 antialiased mt-0.5">
            Bring the menu in, pick a plan slot, and we&apos;ll suggest a best /
            better / fallback option you can attach.
          </p>
        </div>

        <div className="w-full max-w-[650px] mx-auto px-5 mt-6 space-y-6">
          <section className="space-y-3">
            <h2 className="text-[11px] uppercase tracking-wider text-white/40 antialiased">
              Plan slot
            </h2>

            {picked ? (
              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 flex items-start justify-between gap-3">
                <div className="text-sm antialiased">
                  <div className="text-white/90">
                    {fmtDay(picked.day.date_local)} — {slotLabel(picked.slot)}
                  </div>
                  {picked.slot.target_time && (
                    <div className="text-[11px] text-white/50 mt-0.5">
                      {picked.slot.target_time}
                    </div>
                  )}
                  {picked.plan_title && (
                    <div className="text-[11px] text-white/40 mt-0.5">
                      From: {picked.plan_title}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPicked(null)}
                  className="text-[11px] text-white/60 hover:text-white/80 antialiased underline-offset-2 hover:underline"
                >
                  change
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {plansLoading ? (
                  <div className="text-xs text-white/50 antialiased">
                    Loading plans…
                  </div>
                ) : plans.length === 0 ? (
                  <div className="text-xs text-white/50 antialiased">
                    You don&apos;t have any plans yet.{' '}
                    <Link
                      href="/journal/plans"
                      className="underline text-denim-200"
                    >
                      Create one
                    </Link>
                    , then come back to attach an eat-out event.
                  </div>
                ) : (
                  <>
                    <div className="flex gap-1 overflow-x-auto">
                      {plans.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedPlanId(p.id);
                            setPicked(null);
                          }}
                          className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] antialiased border transition-colors ${
                            selectedPlanId === p.id
                              ? 'bg-denim-500/20 border-denim-500/40 text-denim-100'
                              : 'bg-white/[0.04] border-white/10 text-white/70 hover:text-white/90'
                          }`}
                        >
                          {p.title ?? 'Untitled plan'}
                        </button>
                      ))}
                    </div>

                    {planDetailLoading && (
                      <div className="text-xs text-white/50 antialiased">
                        Loading slots…
                      </div>
                    )}

                    {planDetail && (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {planDetail.days
                          .slice()
                          .sort((a, b) => a.date_local.localeCompare(b.date_local))
                          .map((day) => {
                            const daySlots = planDetail.slots
                              .filter((s) => s.plan_day_id === day.id)
                              .sort((a, b) => {
                                if (
                                  a.target_time &&
                                  b.target_time &&
                                  a.target_time !== b.target_time
                                ) {
                                  return a.target_time.localeCompare(b.target_time);
                                }
                                return a.slot_ordinal - b.slot_ordinal;
                              });
                            if (daySlots.length === 0) return null;
                            return (
                              <div
                                key={day.id}
                                className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-2.5"
                              >
                                <div className="text-[11px] uppercase tracking-wider text-white/50 antialiased mb-1.5">
                                  {fmtDay(day.date_local)}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {daySlots.map((slot) => (
                                    <button
                                      key={slot.id}
                                      type="button"
                                      onClick={() =>
                                        setPicked({
                                          plan_id: planDetail.plan.id,
                                          plan_title: planDetail.plan.title ?? null,
                                          day: daysBySlot.get(slot.plan_day_id) ?? day,
                                          slot,
                                        })
                                      }
                                      className="px-2.5 py-1 rounded-full text-[11px] bg-white/[0.05] border border-white/10 text-white/80 hover:bg-white/[0.1] antialiased"
                                    >
                                      {slotLabel(slot)}
                                      {slot.target_time && (
                                        <span className="text-white/50 ml-1">
                                          {slot.target_time}
                                        </span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-[11px] uppercase tracking-wider text-white/40 antialiased">
              Restaurant
            </h2>
            <input
              type="text"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              placeholder="Restaurant name (optional — we'll infer from URL)"
              className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-[11px] uppercase tracking-wider text-white/40 antialiased">
              Menu source
            </h2>
            <div className="flex gap-1 rounded-full bg-white/[0.04] p-1 w-fit">
              <button
                type="button"
                onClick={() => setMode('text')}
                className={`px-4 py-1.5 rounded-full text-xs font-medium antialiased transition-colors ${
                  mode === 'text'
                    ? 'bg-denim-500/20 text-denim-200'
                    : 'text-white/60 hover:text-white/80'
                }`}
              >
                Paste text
              </button>
              <button
                type="button"
                onClick={() => setMode('url')}
                className={`px-4 py-1.5 rounded-full text-xs font-medium antialiased transition-colors ${
                  mode === 'url'
                    ? 'bg-denim-500/20 text-denim-200'
                    : 'text-white/60 hover:text-white/80'
                }`}
              >
                Paste URL
              </button>
            </div>

            {mode === 'text' ? (
              <div>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={`Appetizers\nHummus & Pita — chickpea, olive oil, warm pita $9\nGrilled Calamari — lemon, olive oil, arugula $14\n\nMains\nGrilled Salmon — lemon, herbs, seasonal vegetables $28\nRoast Chicken — half bird, root vegetables $24`}
                  rows={14}
                  className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
                />
                <p className="text-[11px] text-white/40 antialiased mt-1">
                  Tip: section names like &quot;Mains&quot; or &quot;Salads&quot;
                  help us group items. Prices are preserved verbatim.
                </p>
              </div>
            ) : (
              <div>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://restaurant.example/menu"
                  className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
                />
                <p className="text-[11px] text-white/40 antialiased mt-1">
                  We try to read schema.org Menu / Restaurant data. Pages
                  without structured menus will land in manual review with
                  the URL preserved so you can paste the menu text directly.
                </p>
              </div>
            )}
          </section>

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
              <p className="text-xs text-red-200 antialiased">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="flex-1 py-3 rounded-full bg-denim-500/20 hover:bg-denim-500/30 disabled:bg-white/[0.04] disabled:text-white/40 transition-colors text-sm font-semibold text-denim-200 antialiased"
            >
              {submitting ? 'Generating recommendations…' : 'Get recommendations'}
            </button>
            <Link
              href="/journal/plans"
              className="px-4 py-3 rounded-full bg-white/[0.04] hover:bg-white/[0.08] transition-colors text-sm text-white/70 antialiased"
            >
              Cancel
            </Link>
          </div>

          <p className="text-[11px] text-white/40 antialiased">
            Restaurant estimates are directional, not exact. NDS confidence on
            recommended options stays visible on the detail screen, and you
            pick the option before anything attaches to the slot.
          </p>
        </div>
      </div>

      <JournalFooterNav />
    </div>
  );
}
