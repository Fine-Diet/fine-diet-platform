'use client';

/**
 * /journal/plans/eat-out/[id] — Packet 5 eat-out event detail.
 *
 * Shows the imported menu, the parse status, the three recommendation
 * tiers (best / better / fallback), global watchouts, and the current
 * slot attachment (if any). The user selects one option to attach it
 * into the bound plan slot as a planned_meal.
 *
 * Instruction-/context-separation guarantee:
 *   - Only `attachable_payload.items` flows into the planned_meal
 *     payload via `POST /eat-out/[id]/select`.
 *   - Restaurant rationale, watchouts, and modification suggestions
 *     stay on the eat-out event row and never enter nutrition / NDS
 *     scoring. This page is therefore the only surface where those
 *     fields are visible; DayView never sees them.
 *
 * Confidence surfaces (per §4d + §8e):
 *   - Per-option NDS confidence from `nds_meal_snapshot.nds_confidence`.
 *   - Menu parse status badge on the menu source card.
 *   - Global watchouts call out when no published nutrition was
 *     available, so users understand why estimates are directional.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import {
  planService,
  type EatOutRecommendationOption,
  type EatOutRecommendationPayload,
  type ImportedMenu,
  type ImportedMenuParseStatus,
  type PlannedEatOutEvent,
  type PlannedMeal,
} from '@/lib/plans';

type OptionLabel = 'best' | 'better' | 'fallback';

function parseStatusStyle(status: ImportedMenuParseStatus): string {
  switch (status) {
    case 'parsed':
      return 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30';
    case 'manual_review':
      return 'bg-amber-500/15 text-amber-200 border-amber-500/30';
    case 'failed':
      return 'bg-red-500/15 text-red-200 border-red-500/30';
    default:
      return 'bg-white/[0.08] text-white/70 border-white/10';
  }
}

function parseStatusLabel(status: ImportedMenuParseStatus): string {
  switch (status) {
    case 'parsed':
      return 'Menu parsed';
    case 'manual_review':
      return 'Manual review';
    case 'failed':
      return 'Parse failed';
    default:
      return 'Pending';
  }
}

function confidenceLabel(c: 'high' | 'medium' | 'low'): string {
  return c === 'high'
    ? 'High NDS confidence'
    : c === 'medium'
      ? 'Medium NDS confidence'
      : 'Low NDS confidence';
}

function confidenceStyle(c: 'high' | 'medium' | 'low'): string {
  return c === 'high'
    ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30'
    : c === 'medium'
      ? 'bg-denim-500/15 text-denim-200 border-denim-500/30'
      : 'bg-white/[0.06] text-white/70 border-white/10';
}

function tierLabel(label: OptionLabel): string {
  return label === 'best' ? 'Best' : label === 'better' ? 'Better' : 'Fallback';
}

function tierAccent(label: OptionLabel): string {
  return label === 'best'
    ? 'border-emerald-500/40 bg-emerald-500/[0.05]'
    : label === 'better'
      ? 'border-denim-500/40 bg-denim-500/[0.05]'
      : 'border-white/10 bg-white/[0.03]';
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

export default function EatOutDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;

  const [event, setEvent] = useState<PlannedEatOutEvent | null>(null);
  const [importedMenu, setImportedMenu] = useState<ImportedMenu | null>(null);
  const [plannedMeal, setPlannedMeal] = useState<PlannedMeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<OptionLabel | null>(null);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const res = await planService.getEatOutEvent(id);
      setEvent(res.eat_out_event);
      setImportedMenu(res.imported_menu);
      setPlannedMeal(res.planned_meal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load event.');
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await planService.getEatOutEvent(id);
        if (cancelled) return;
        setEvent(res.eat_out_event);
        setImportedMenu(res.imported_menu);
        setPlannedMeal(res.planned_meal);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load event.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const rec: EatOutRecommendationPayload | null =
    event?.recommendation_payload_json ?? null;

  const selectedOptionLabel: OptionLabel | null = useMemo(() => {
    if (!plannedMeal || !rec) return null;
    const name = plannedMeal.name ?? null;
    if (rec.best && rec.best.option_name === name) return 'best';
    if (rec.better && rec.better.option_name === name) return 'better';
    if (rec.fallback && rec.fallback.option_name === name) return 'fallback';
    return null;
  }, [plannedMeal, rec]);

  async function handleSelect(label: OptionLabel) {
    if (!id || selecting) return;
    setSelecting(label);
    setError(null);
    try {
      await planService.selectEatOutOption(id, { option_label: label });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to attach option.');
    } finally {
      setSelecting(null);
    }
  }

  if (!id) {
    return (
      <div className="min-h-screen bg-brand-900 text-white flex items-center justify-center">
        <p className="text-sm text-white/60 antialiased">Event id missing.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="w-full max-w-[720px] mx-auto px-5 pt-14 pb-2">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold antialiased">
              {event?.venue_name ?? 'Eat-out'}
            </h1>
            <Link
              href="/journal/plans"
              className="text-xs text-white/60 hover:text-white/80 antialiased"
            >
              ← Plans
            </Link>
          </div>
          <p className="text-sm text-white/50 antialiased mt-0.5">
            Restaurant recommendation — pick an option to attach it to the
            plan slot.
          </p>
        </div>

        <div className="w-full max-w-[720px] mx-auto px-5 mt-6 space-y-6">
          {loading && (
            <div className="text-xs text-white/50 antialiased">Loading…</div>
          )}

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
              <p className="text-xs text-red-200 antialiased">{error}</p>
            </div>
          )}

          {event && rec && (
            <>
              <section className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[11px] uppercase tracking-wider text-white/50 antialiased">
                    Slot
                  </h2>
                  {importedMenu && (
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider antialiased border ${parseStatusStyle(importedMenu.parse_status)}`}
                    >
                      {parseStatusLabel(importedMenu.parse_status)}
                    </span>
                  )}
                </div>
                <div className="text-sm text-white/80 antialiased">
                  {fmtDay(rec.slot_context.plan_date)}
                  {rec.slot_context.target_time && (
                    <span className="text-white/50">
                      {' · '}
                      {rec.slot_context.target_time}
                    </span>
                  )}
                  <span className="text-white/50">
                    {' · '}
                    {rec.slot_context.meal_type_hint}
                  </span>
                </div>
                {event.scheduled_at && (
                  <div className="text-[11px] text-white/50 antialiased">
                    Scheduled: {new Date(event.scheduled_at).toLocaleString()}
                  </div>
                )}
              </section>

              {rec.global_watchouts.length > 0 && (
                <section className="rounded-2xl bg-amber-500/[0.06] border border-amber-500/20 p-4">
                  <h2 className="text-[11px] uppercase tracking-wider text-amber-200 antialiased mb-2">
                    Heads up
                  </h2>
                  <ul className="space-y-1 text-xs text-amber-100/90 antialiased">
                    {rec.global_watchouts.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="space-y-3">
                <h2 className="text-[11px] uppercase tracking-wider text-white/40 antialiased">
                  Recommendations
                </h2>
                {(['best', 'better', 'fallback'] as OptionLabel[]).map((label) => {
                  const option =
                    label === 'best'
                      ? rec.best
                      : label === 'better'
                        ? rec.better
                        : rec.fallback;
                  if (!option) return null;
                  return (
                    <OptionCard
                      key={label}
                      label={label}
                      option={option}
                      selected={selectedOptionLabel === label}
                      submitting={selecting === label}
                      onSelect={() => handleSelect(label)}
                    />
                  );
                })}
                {!rec.best && !rec.better && !rec.fallback && (
                  <div className="rounded-xl bg-white/[0.04] border border-white/10 p-4 text-xs text-white/60 antialiased">
                    No recommendations could be derived from this menu. Edit
                    the menu manually or import a clearer menu source.
                  </div>
                )}
              </section>

              {plannedMeal && (
                <section className="rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/20 p-4">
                  <h2 className="text-[11px] uppercase tracking-wider text-emerald-200 antialiased mb-1">
                    Attached to slot
                  </h2>
                  <div className="text-sm text-white/80 antialiased">
                    {plannedMeal.name ?? 'Meal'} — {plannedMeal.meal_type}
                  </div>
                  <div className="text-[11px] text-white/50 antialiased mt-0.5">
                    You can change the selection by picking a different
                    option above. The eat-out recommendation context stays
                    preserved.
                  </div>
                </section>
              )}

              {importedMenu && (
                <section className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-3">
                  <h2 className="text-[11px] uppercase tracking-wider text-white/40 antialiased">
                    Source menu
                  </h2>
                  {importedMenu.source_url && (
                    <a
                      href={importedMenu.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-denim-200 hover:text-denim-100 antialiased underline-offset-2 hover:underline break-all"
                    >
                      {importedMenu.source_url}
                    </a>
                  )}
                  <MenuSectionsPreview menu={importedMenu} />
                </section>
              )}
            </>
          )}
        </div>
      </div>

      <JournalFooterNav />
    </div>
  );
}

function OptionCard(props: {
  label: OptionLabel;
  option: EatOutRecommendationOption;
  selected: boolean;
  submitting: boolean;
  onSelect: () => void;
}) {
  const { label, option, selected, submitting, onSelect } = props;
  const totals = option.attachable_payload.totals;
  return (
    <div
      className={`rounded-2xl border p-4 space-y-3 ${tierAccent(label)} ${
        selected ? 'ring-1 ring-emerald-400/40' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider antialiased border border-white/15 bg-black/20 text-white/85">
              {tierLabel(label)}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider antialiased border ${confidenceStyle(option.nds_meal_snapshot.nds_confidence)}`}
            >
              {confidenceLabel(option.nds_meal_snapshot.nds_confidence)}
            </span>
          </div>
          <div className="text-base font-semibold antialiased text-white">
            {option.option_name}
          </div>
        </div>
        <button
          type="button"
          onClick={onSelect}
          disabled={submitting}
          className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold antialiased transition-colors ${
            selected
              ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-500/40'
              : 'bg-denim-500/20 hover:bg-denim-500/30 text-denim-200 disabled:bg-white/[0.04] disabled:text-white/40'
          }`}
        >
          {submitting
            ? 'Attaching…'
            : selected
              ? 'Attached ✓'
              : 'Choose this'}
        </button>
      </div>

      <div className="text-[11px] text-white/70 antialiased leading-relaxed whitespace-pre-wrap">
        {option.rationale_md}
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <MacroCell label="Calories" value={`${Math.round(totals.calories)}`} />
        <MacroCell label="Protein" value={`${Math.round(totals.protein_g)}g`} />
        <MacroCell label="Carbs" value={`${Math.round(totals.carbs_g)}g`} />
        <MacroCell label="Fat" value={`${Math.round(totals.fat_g)}g`} />
      </div>

      {option.watchouts.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-white/50 antialiased">
            Watch-outs
          </div>
          <ul className="space-y-0.5 text-[11px] text-white/70 antialiased">
            {option.watchouts.map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        </div>
      )}

      {option.modification_suggestions.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-white/50 antialiased">
            Modification suggestions
          </div>
          <ul className="space-y-0.5 text-[11px] text-white/70 antialiased">
            {option.modification_suggestions.map((m, i) => (
              <li key={i}>• {m}</li>
            ))}
          </ul>
        </div>
      )}

      {option.source_menu_item_name && (
        <div className="pt-1 border-t border-white/[0.05] text-[10px] text-white/40 antialiased">
          Source menu item: {option.source_menu_item_name}
        </div>
      )}
    </div>
  );
}

function MacroCell(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.04] py-1.5">
      <div className="text-sm font-semibold text-white antialiased">{props.value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/40 antialiased">
        {props.label}
      </div>
    </div>
  );
}

function MenuSectionsPreview({ menu }: { menu: ImportedMenu }) {
  const sections = menu.parsed_payload_json?.sections ?? [];
  if (sections.length === 0) {
    return (
      <div className="text-[11px] text-white/50 antialiased">
        No structured sections were detected.
        {menu.raw_input_text && (
          <div className="mt-2 rounded-lg bg-white/[0.04] border border-white/[0.06] p-2 max-h-60 overflow-y-auto">
            <pre className="whitespace-pre-wrap text-[11px] text-white/70 leading-relaxed">
              {menu.raw_input_text.slice(0, 2000)}
              {menu.raw_input_text.length > 2000 ? '…' : ''}
            </pre>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {sections.map((section, si) => (
        <div key={si}>
          {section.section_name && (
            <div className="text-[11px] uppercase tracking-wider text-white/50 antialiased mb-1">
              {section.section_name}
            </div>
          )}
          <ul className="space-y-1">
            {section.items.map((item, ii) => (
              <li
                key={ii}
                className="text-[11px] text-white/75 antialiased flex items-baseline justify-between gap-3"
              >
                <span>
                  <span className="text-white/90">{item.item_name}</span>
                  {item.description && (
                    <span className="text-white/50"> — {item.description}</span>
                  )}
                </span>
                <span className="shrink-0 text-white/50">
                  {item.price_text ?? ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
