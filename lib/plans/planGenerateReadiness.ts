import type { PlanInputSnapshot } from './types';

export interface PlanGenerateReadiness {
  canGenerate: boolean;
  missingReasons: string[];
}

export function derivePlanGenerateReadiness(
  snapshot: PlanInputSnapshot | null,
): PlanGenerateReadiness {
  if (!snapshot) {
    return {
      canGenerate: false,
      missingReasons: ['Profile data is still loading.'],
    };
  }

  const reasons: string[] = [];
  const age = snapshot.body.age_years;
  if (age === null) {
    reasons.push('Add your date of birth');
  } else if (age < 18) {
    reasons.push('Plans generation is currently 18+');
  }
  if (snapshot.body.height_cm === null) {
    reasons.push('Set your height');
  }
  if (snapshot.body.weight_kg === null) {
    reasons.push('Set your weight');
  }

  return {
    canGenerate: reasons.length === 0,
    missingReasons: reasons,
  };
}
