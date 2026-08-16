'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { StackedPageHero, StackedPageSection } from '@/components/layout/StackedPageSection';
import {
  MEAL_SLOT_DEFAULT_LABELS,
  MEAL_SLOT_KEYS,
  type MealSchedule,
  type MealScheduleSlot,
  type MealSlotKey,
} from '@/lib/plans/types';
import {
  proposeMealRhythm,
  schedulesDiffer,
  type MealRhythmProposal,
} from '@/lib/plans/mealRhythm/assumptionPolicy';
import { classifyMealRhythmSaveEvent } from '@/lib/plans/mealRhythm/events';
import { emitMealRhythmEvent } from '@/lib/plans/mealRhythm/emitEvent';
import { enabledSlotCount, saveMealRhythmSchedule } from '@/lib/plans/mealRhythm/save';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

function formatTimeLabel(hhmm: string): string {
  const [hourRaw, minuteRaw] = hhmm.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return hhmm;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = ((hour + 11) % 12) + 1;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function slotLabel(key: MealSlotKey, slot: MealScheduleSlot): string {
  return slot.label?.trim() || MEAL_SLOT_DEFAULT_LABELS[key];
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-[#7aa06d]' : 'bg-white/12'
      } disabled:opacity-40`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : ''
        }`}
      />
    </button>
  );
}

export function MealRhythmView() {
  const router = useRouter();
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [proposal, setProposal] = useState<MealRhythmProposal | null>(null);
  const [draft, setDraft] = useState<MealSchedule | null>(null);
  const [editing, setEditing] = useState(false);
  const [weekendNote, setWeekendNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const shownRef = useRef(false);
  const abandonedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/journal/profile', { credentials: 'include' });
        if (!res.ok) throw new Error('profile');
        const json = (await res.json()) as {
          profile?: { meal_schedule?: unknown; onboarding?: unknown };
        };
        const next = proposeMealRhythm({
          savedSchedule: json.profile?.meal_schedule ?? null,
          onboarding: json.profile?.onboarding ?? null,
        });
        if (cancelled) return;
        setProposal(next);
        setDraft(next.schedule);
        setLoadState('ready');
      } catch {
        if (cancelled) return;
        setLoadState('error');
        setError('Could not load your meal rhythm.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loadState !== 'ready' || !proposal || shownRef.current) return;
    shownRef.current = true;
    emitMealRhythmEvent({
      event: 'meal_rhythm_proposal_shown',
      policyId: proposal.policyId,
      policyVersion: proposal.policyVersion,
      proposalSource: proposal.source,
      path: 'exposed',
      reasonCodes: proposal.reasonCodes,
      enabledSlotCount: enabledSlotCount(proposal.schedule),
    });
  }, [loadState, proposal]);

  const markAbandoned = useCallback(() => {
    if (abandonedRef.current || !proposal) return;
    abandonedRef.current = true;
    emitMealRhythmEvent({
      event: 'meal_rhythm_abandoned',
      policyId: proposal.policyId,
      policyVersion: proposal.policyVersion,
      proposalSource: proposal.source,
      path: 'cancel',
      reasonCodes: [...proposal.reasonCodes, 'user_cancelled'],
      enabledSlotCount: enabledSlotCount(draft ?? proposal.schedule),
    });
  }, [draft, proposal]);

  async function persist() {
    if (!proposal || !draft) return;
    setSaving(true);
    setError('');
    const result = await saveMealRhythmSchedule(draft);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    abandonedRef.current = true;
    const saveEvent = classifyMealRhythmSaveEvent(proposal.schedule, draft);
    emitMealRhythmEvent({
      event: saveEvent,
      policyId: proposal.policyId,
      policyVersion: proposal.policyVersion,
      proposalSource: proposal.source,
      path: 'primary',
      reasonCodes: [
        ...proposal.reasonCodes,
        saveEvent === 'meal_rhythm_edited' ? 'user_edited' : 'user_accepted',
      ],
      enabledSlotCount: enabledSlotCount(draft),
    });
    emitMealRhythmEvent({
      event: 'meal_rhythm_saved',
      policyId: proposal.policyId,
      policyVersion: proposal.policyVersion,
      proposalSource: proposal.source,
      path: 'primary',
      reasonCodes: [...proposal.reasonCodes, 'canonical_profile_meal_schedule'],
      enabledSlotCount: enabledSlotCount(draft),
    });
    await router.replace(APP_ROUTES.plans);
  }

  function startEditing() {
    if (!proposal || editing) return;
    setEditing(true);
    emitMealRhythmEvent({
      event: 'meal_rhythm_edit_started',
      policyId: proposal.policyId,
      policyVersion: proposal.policyVersion,
      proposalSource: proposal.source,
      path: 'exposed',
      reasonCodes: [...proposal.reasonCodes, 'user_opened_editor'],
      enabledSlotCount: enabledSlotCount(draft ?? proposal.schedule),
    });
  }

  function updateSlot(key: MealSlotKey, patch: Partial<MealScheduleSlot>) {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        slots: {
          ...prev.slots,
          [key]: { ...prev.slots[key], ...patch },
        },
      };
    });
    setEditing(true);
  }

  const enabled = useMemo(
    () => (draft ? MEAL_SLOT_KEYS.filter((key) => draft.slots[key].enabled) : []),
    [draft],
  );

  const heroLine =
    proposal?.source === 'saved_schedule'
      ? 'This is your saved weekday rhythm.'
      : 'This looks like your normal weekday.';

  const supportLine =
    proposal?.source === 'saved_schedule'
      ? 'Saved on your profile. Change anything that isn’t you.'
      : proposal?.source === 'onboarding'
        ? 'From your setup answers — change anything that isn’t you.'
        : 'Starting assumption — change anything that isn’t you.';

  const didEdit = Boolean(proposal && draft && schedulesDiffer(proposal.schedule, draft));

  return (
    <div className="flex min-h-screen flex-col bg-[#000000] text-white">
      <div className="flex-1 overflow-y-auto pb-[calc(8rem+env(safe-area-inset-bottom,0px))]">
        <StackedPageHero className="overflow-hidden bg-gradient-to-b from-neutral-900 to-brand-700 to-80%">
          <div className="relative z-10 mx-auto flex min-h-[220px] w-full max-w-[650px] flex-col justify-center px-6 pb-14 pt-12 sm:min-h-[240px]">
            <Link
              href={APP_ROUTES.plans}
              onClick={markAbandoned}
              className="text-xs text-white/60 hover:text-white/80"
            >
              ← Plans
            </Link>
            <h1 className="mt-4 max-w-[520px] text-4xl font-semibold tracking-[-0.03em] text-white antialiased sm:text-5xl">
              Meal rhythm
            </h1>
            <p className="mt-3 max-w-md text-sm leading-snug text-white/78 antialiased">
              {loadState === 'loading' ? 'Loading your weekday rhythm…' : heroLine}
            </p>
          </div>
        </StackedPageHero>

        <StackedPageSection layer={1} className="bg-[#16110d] pb-24">
          {loadState === 'error' ? (
            <p className="text-sm text-white/70">{error}</p>
          ) : loadState === 'loading' || !draft || !proposal ? (
            <p className="text-sm text-white/55">Preparing a starting rhythm…</p>
          ) : (
            <div className="space-y-5">
              <p className="text-sm text-white/70 antialiased">{supportLine}</p>

              <div className="space-y-2">
                {MEAL_SLOT_KEYS.map((key) => {
                  const slot = draft.slots[key];
                  if (!editing && !slot.enabled) return null;
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3"
                    >
                      {editing ? (
                        <Toggle
                          checked={slot.enabled}
                          onChange={(value) => updateSlot(key, { enabled: value })}
                          disabled={saving}
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        {editing ? (
                          <input
                            value={slot.label ?? ''}
                            placeholder={MEAL_SLOT_DEFAULT_LABELS[key]}
                            onChange={(event) =>
                              updateSlot(key, {
                                label: event.target.value.trim() ? event.target.value : null,
                              })
                            }
                            className="w-full rounded-full border border-white/10 bg-neutral-900 px-4 py-2 text-sm text-brand-50"
                          />
                        ) : (
                          <p className="text-sm font-medium text-white">
                            {slotLabel(key, slot)}
                          </p>
                        )}
                      </div>
                      {editing ? (
                        <input
                          type="time"
                          value={slot.target_time}
                          disabled={!slot.enabled || saving}
                          onChange={(event) =>
                            updateSlot(key, { target_time: event.target.value })
                          }
                          className="rounded-full border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-brand-50"
                        />
                      ) : (
                        <p className="text-sm text-white/80">
                          {formatTimeLabel(slot.target_time)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {!editing && enabled.length === 0 ? (
                <p className="text-sm text-white/55">
                  No occasions are on yet. Choose Change it to turn some on.
                </p>
              ) : null}

              {error ? <p className="text-sm text-red-300">{error}</p> : null}

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void persist()}
                  className="w-full rounded-full bg-brand-50 py-3 text-center text-sm font-semibold text-black disabled:opacity-50"
                >
                  {saving ? 'Saving…' : didEdit ? 'Save rhythm' : 'Looks right'}
                </button>
                {!editing ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={startEditing}
                    className="w-full rounded-full border border-white/15 py-3 text-center text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Change it
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setDraft(proposal.schedule);
                      setEditing(false);
                      setError('');
                    }}
                    className="w-full rounded-full border border-white/15 py-3 text-center text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Back to proposal
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setWeekendNote((open) => !open)}
                  className="w-full py-2 text-center text-sm text-white/60 hover:text-white/80"
                >
                  Weekends are different
                </button>
                {weekendNote ? (
                  <p className="text-[12px] leading-relaxed text-white/45">
                    A separate weekend rhythm is not being saved yet. Plans still uses this
                    weekday schedule every day, including weekends.
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    markAbandoned();
                    void router.push(APP_ROUTES.plans);
                  }}
                  className="w-full py-2 text-center text-sm text-white/45 hover:text-white/70"
                >
                  Not now
                </button>
              </div>
            </div>
          )}
        </StackedPageSection>
      </div>
      <JournalFooterNav />
    </div>
  );
}
