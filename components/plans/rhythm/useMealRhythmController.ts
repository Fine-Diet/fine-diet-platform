'use client';

/**
 * Meal Rhythm v2B — shared controller hook.
 *
 * Manages all state and logic for the meal rhythm flow, usable by both the
 * overlay and the standalone /app/plans/rhythm route view.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  proposeMealRhythm,
  schedulesDiffer,
  type MealRhythmProposal,
} from '@/lib/plans/mealRhythm/assumptionPolicy';
import { classifyMealRhythmSaveEvent } from '@/lib/plans/mealRhythm/events';
import { emitMealRhythmEvent } from '@/lib/plans/mealRhythm/emitEvent';
import { enabledSlotCount, saveMealRhythmSchedule } from '@/lib/plans/mealRhythm/save';
import { MEAL_OCCASION_KEYS, type MealSchedule, type MealScheduleSlot, type MealSlotKey } from '@/lib/plans/types';

export type MealRhythmPhase = 'loading' | 'review' | 'edit' | 'confirm' | 'error';

export interface MealRhythmController {
  phase: MealRhythmPhase;
  proposal: MealRhythmProposal | null;
  draft: MealSchedule | null;
  saving: boolean;
  error: string;
  enabledChronological: MealSlotKey[];
  startEditing: () => void;
  updateSlot: (key: MealSlotKey, patch: Partial<MealScheduleSlot>) => void;
  resetDraftFromProposal: () => void;
  persist: () => Promise<void>;
  cancel: () => void;
  markAbandoned: () => void;
  acceptTriggerContext?: string;
}

export function useMealRhythmController(opts?: {
  acceptTriggerContext?: string;
}): MealRhythmController {
  const [phase, setPhase] = useState<MealRhythmPhase>('loading');
  const [proposal, setProposal] = useState<MealRhythmProposal | null>(null);
  const [draft, setDraft] = useState<MealSchedule | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const shownRef = useRef(false);
  const abandonedRef = useRef(false);

  // Load profile + propose rhythm
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
        setPhase('review');
      } catch {
        if (cancelled) return;
        setPhase('error');
        setError('Could not load your meal rhythm.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Emit proposal shown
  useEffect(() => {
    if (phase !== 'review' || !proposal || shownRef.current) return;
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
  }, [phase, proposal]);

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

  const startEditing = useCallback(() => {
    if (!proposal) return;
    setPhase('edit');
    emitMealRhythmEvent({
      event: 'meal_rhythm_edit_started',
      policyId: proposal.policyId,
      policyVersion: proposal.policyVersion,
      proposalSource: proposal.source,
      path: 'exposed',
      reasonCodes: [...proposal.reasonCodes, 'user_opened_editor'],
      enabledSlotCount: enabledSlotCount(draft ?? proposal.schedule),
    });
  }, [draft, proposal]);

  const updateSlot = useCallback((key: MealSlotKey, patch: Partial<MealScheduleSlot>) => {
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
  }, []);

  const resetDraftFromProposal = useCallback(() => {
    if (!proposal) return;
    setDraft(proposal.schedule);
    setPhase('review');
    setError('');
  }, [proposal]);

  const persist = useCallback(async () => {
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
    // After successful save → confirm phase; navigation is caller's responsibility
    setPhase('confirm');
  }, [draft, proposal]);

  const cancel = useCallback(() => {
    if (phase !== 'review' && phase !== 'edit') return;
    markAbandoned();
  }, [markAbandoned, phase]);

  const enabledChronological = useMemo((): MealSlotKey[] => {
    if (!draft) return [];
    return MEAL_OCCASION_KEYS.filter((key) => draft.slots[key].enabled).sort(
      (a, b) => {
        const [ah, am] = draft.slots[a].target_time.split(':').map(Number);
        const [bh, bm] = draft.slots[b].target_time.split(':').map(Number);
        return (ah ?? 0) * 60 + (am ?? 0) - ((bh ?? 0) * 60 + (bm ?? 0));
      },
    );
  }, [draft]);

  return {
    phase,
    proposal,
    draft,
    saving,
    error,
    enabledChronological,
    startEditing,
    updateSlot,
    resetDraftFromProposal,
    persist,
    cancel,
    markAbandoned,
    acceptTriggerContext: opts?.acceptTriggerContext,
  };
}

/**
 * Whether the draft differs from the proposal baseline.
 */
export function controllerDidEdit(ctrl: Pick<MealRhythmController, 'proposal' | 'draft'>): boolean {
  if (!ctrl.proposal || !ctrl.draft) return false;
  return schedulesDiffer(ctrl.proposal.schedule, ctrl.draft);
}
