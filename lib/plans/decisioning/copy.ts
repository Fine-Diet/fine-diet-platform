/**
 * Functional placeholder copy for Plans next-best-action.
 * Keys are the contract; strings are not a visual redesign pass.
 */

import type { PlansNbaStateKey } from './types';

export const PLANS_NBA_COPY = {
  'headline.plans.loading': 'Plan for consistency',
  'support.plans.loading': 'Loading meal guidance…',
  'headline.plans.error': 'Plan for consistency',
  'support.plans.error': 'Could not load the next step. Try again.',
  'headline.plans.setup_meal_rhythm': 'Set your meal rhythm',
  'support.plans.setup_meal_rhythm':
    'Add meal windows in your profile so Plans can guide today.',
  'headline.plans.setup_pantry': 'Set up your pantry',
  'support.plans.setup_pantry':
    'A starting pantry helps Plans know what you can cook. You can still plan without it.',
  'headline.plans.plan_today': 'Plan today',
  'support.plans.plan_today': 'Today has no meals on the plan yet.',
  'headline.plans.finish_today': 'Finish today’s plan',
  'support.plans.finish_today': 'Some meal windows still need a meal.',
  'headline.plans.plan_ahead': 'Plan ahead',
  'support.plans.plan_ahead': 'Today is covered. Fill the days ahead.',
  'headline.plans.review_plan': 'Review your plan',
  'support.plans.review_plan': 'Today and the days ahead look covered.',
  'action.plans.setup_meal_rhythm': 'Set meal windows',
  'action.plans.setup_pantry': 'Open Pantry',
  'action.plans.plan_without_pantry': 'Plan without pantry',
  'action.plans.plan_today': 'Plan today',
  'action.plans.finish_today': 'Finish today',
  'action.plans.plan_ahead': 'Plan the week',
  'action.plans.review_plan': 'Review week',
  'action.plans.open_grocery': 'Open grocery',
} as const;

export type PlansNbaCopyKey = keyof typeof PLANS_NBA_COPY;

export function plansNbaCopy(key: string | undefined, fallback?: string): string {
  if (key && key in PLANS_NBA_COPY) {
    return PLANS_NBA_COPY[key as PlansNbaCopyKey];
  }
  return fallback ?? '';
}

export function headlineKeyFor(stateKey: PlansNbaStateKey): string {
  return `headline.plans.${stateKey}`;
}

export function supportKeyFor(stateKey: PlansNbaStateKey): string {
  return `support.plans.${stateKey}`;
}

export function actionKeyFor(actionId: string): string {
  return `action.plans.${actionId}`;
}
