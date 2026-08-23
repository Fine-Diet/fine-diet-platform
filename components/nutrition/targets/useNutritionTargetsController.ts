'use client';

/**
 * Nutrition Targets v1 — overlay controller.
 *
 * Drives the first-time Log-triggered flow only (mirrors
 * useMealRhythmController's role for the Meal Rhythm overlay). Profile's
 * durable-editing section does NOT use this controller — it edits the
 * already-confirmed canonical values directly, the same way
 * SectionMealSchedule edits meal_schedule directly rather than reusing
 * useMealRhythmController's proposal phases.
 *
 * Phases (assumption → confirm/edit, Nutrition Targets v1 §5):
 *   loading  → fetch profile + goals, build proposal
 *   activity → asked only when activity_baseline is unknown (§3)
 *   review   → suggested maintenance calories; "Looks Good" / "Adjust"
 *   edit     → Adjust surface: Calories + optional Protein/Carbs/Fat
 *   confirm  → post-save "Done"
 *   error    → load or save failure
 */

import { useCallback, useEffect, useState } from 'react';
import {
  proposeNutritionTargets,
  type NutritionTargetsProposal,
} from '@/lib/nutrition/targets/proposal';
import {
  estimateMaintenanceCalories,
  isNutritionTargetsActivityBaseline,
  ACTIVITY_BASELINE_VALUES,
  type NutritionTargetsActivityBaseline,
  type NutritionTargetsEstimate,
} from '@/lib/nutrition/targets/estimate';
import { extractBodyInputsFromProfile } from '@/lib/nutrition/targets/bodyInputs';
import { saveNutritionTargets, resolveOptionalMacroInputs } from '@/lib/nutrition/targets/save';
import type { MacroGoals } from '@/lib/journal/types';

export type NutritionTargetsPhase = 'loading' | 'activity' | 'review' | 'edit' | 'confirm' | 'error';

export { ACTIVITY_BASELINE_VALUES };
export type { NutritionTargetsActivityBaseline };

export interface NutritionTargetsController {
  phase: NutritionTargetsPhase;
  proposal: NutritionTargetsProposal | null;
  estimate: NutritionTargetsEstimate | null;
  draftCalories: number | null;
  draftMacros: { protein_g: string; carbs_g: string; fat_g: string };
  saving: boolean;
  error: string;
  chooseActivity: (activity: NutritionTargetsActivityBaseline) => void;
  acceptEstimate: () => Promise<void>;
  startEditing: () => void;
  backToReview: () => void;
  updateDraftCalories: (value: number) => void;
  updateDraftMacro: (key: keyof MacroGoals, value: string) => void;
  saveEdit: () => Promise<void>;
}

interface ProfileFetchShape {
  date_of_birth?: string | null;
  sex?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  activity_baseline?: string | null;
}

export function useNutritionTargetsController(): NutritionTargetsController {
  const [phase, setPhase] = useState<NutritionTargetsPhase>('loading');
  const [proposal, setProposal] = useState<NutritionTargetsProposal | null>(null);
  const [estimate, setEstimate] = useState<NutritionTargetsEstimate | null>(null);
  const [profileFields, setProfileFields] = useState<ProfileFetchShape | null>(null);
  const [chosenActivity, setChosenActivity] = useState<NutritionTargetsActivityBaseline | null>(null);
  const [draftCalories, setDraftCalories] = useState<number | null>(null);
  const [draftMacros, setDraftMacros] = useState({ protein_g: '', carbs_g: '', fat_g: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profileRes, goalsRes] = await Promise.all([
          fetch('/api/journal/profile', { credentials: 'include' }),
          fetch('/api/journal/goals', { credentials: 'include' }),
        ]);
        if (!profileRes.ok || !goalsRes.ok) throw new Error('load_failed');
        const profileJson = (await profileRes.json()) as { profile?: ProfileFetchShape };
        const goalsJson = (await goalsRes.json()) as {
          goals?: { dailyCalorieGoal: number; macroGoals: MacroGoals; isDefault: boolean; macroGoalsSet: boolean };
        };
        if (cancelled) return;

        const profile = profileJson.profile ?? {};
        const goals = goalsJson.goals ?? null;
        setProfileFields(profile);

        const nextProposal = proposeNutritionTargets({ profile, goals });
        setProposal(nextProposal);
        setEstimate(nextProposal.estimate);

        if (nextProposal.needsActivity) {
          setPhase('activity');
        } else {
          setPhase('review');
        }
      } catch {
        if (cancelled) return;
        setPhase('error');
        setError('Could not load your nutrition targets.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const chooseActivity = useCallback(
    (activity: NutritionTargetsActivityBaseline) => {
      if (!profileFields) return;
      setChosenActivity(activity);
      const bodyInputs = extractBodyInputsFromProfile(profileFields);
      const nextEstimate = estimateMaintenanceCalories({ ...bodyInputs, activity_baseline: activity });
      setEstimate(nextEstimate);
      setPhase('review');
    },
    [profileFields],
  );

  const persist = useCallback(
    async (opts: {
      source: 'user_confirmed' | 'user_edited';
      dailyCalorieGoal: number;
      macroGoals?: MacroGoals | null;
    }): Promise<boolean> => {
      if (!profileFields) return false;
      setSaving(true);
      setError('');

      const bodyInputs = extractBodyInputsFromProfile(profileFields);
      const activityBaseline =
        chosenActivity ??
        (isNutritionTargetsActivityBaseline(profileFields.activity_baseline)
          ? profileFields.activity_baseline
          : null);

      const result = await saveNutritionTargets({
        dailyCalorieGoal: opts.dailyCalorieGoal,
        // Only forward a macroGoals value (including an explicit `null`
        // clear) when the caller actually supplied the key. acceptEstimate()
        // never touches macros, so it must not turn "macros not mentioned"
        // into an implicit clear of an already-set macroGoals (review item
        // "clear_existing_macros") — omitting the key here means
        // saveNutritionTargets leaves macroGoals untouched.
        ...('macroGoals' in opts ? { macroGoals: opts.macroGoals } : {}),
        source: opts.source,
        estimatedCalories: estimate?.maintenanceCalories ?? null,
        modelVersion: estimate?.modelVersion ?? null,
        activityBaseline,
        bodyInputsUsedAt: {
          age_years: bodyInputs.age_years,
          sex: bodyInputs.sex,
          height_cm: bodyInputs.height_cm,
          weight_kg: bodyInputs.weight_kg,
        },
        // Only persist activity_baseline if it was newly chosen this session
        // (profile previously had no activity_baseline at all).
        activityBaselineToPersist:
          chosenActivity && !isNutritionTargetsActivityBaseline(profileFields.activity_baseline)
            ? chosenActivity
            : null,
      });

      setSaving(false);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      return true;
    },
    [chosenActivity, estimate, profileFields],
  );

  const acceptEstimate = useCallback(async () => {
    if (estimate?.maintenanceCalories == null) return;
    const ok = await persist({ source: 'user_confirmed', dailyCalorieGoal: estimate.maintenanceCalories });
    if (ok) setPhase('confirm');
  }, [estimate, persist]);

  const startEditing = useCallback(() => {
    setDraftCalories(estimate?.maintenanceCalories ?? proposal?.existingConfirmed?.dailyCalorieGoal ?? null);
    setDraftMacros({ protein_g: '', carbs_g: '', fat_g: '' });
    setPhase('edit');
  }, [estimate, proposal]);

  const backToReview = useCallback(() => {
    setPhase('review');
  }, []);

  const updateDraftCalories = useCallback((value: number) => {
    setDraftCalories(value);
  }, []);

  const updateDraftMacro = useCallback((key: keyof MacroGoals, value: string) => {
    setDraftMacros((prev) => ({ ...prev, [key]: value }));
  }, []);

  const saveEdit = useCallback(async () => {
    if (draftCalories == null) return;

    // Review item "macro_optional_semantics": macros are an optional trio —
    // all three or none. A partial fill is rejected here rather than
    // silently coerced to 0 for the blank fields.
    const resolved = resolveOptionalMacroInputs(draftMacros);
    if (!resolved.ok) {
      setError(resolved.error);
      return;
    }

    const ok = await persist({ source: 'user_edited', dailyCalorieGoal: draftCalories, macroGoals: resolved.macroGoals });
    if (ok) setPhase('confirm');
  }, [draftCalories, draftMacros, persist]);

  return {
    phase,
    proposal,
    estimate,
    draftCalories,
    draftMacros,
    saving,
    error,
    chooseActivity,
    acceptEstimate,
    startEditing,
    backToReview,
    updateDraftCalories,
    updateDraftMacro,
    saveEdit,
  };
}
