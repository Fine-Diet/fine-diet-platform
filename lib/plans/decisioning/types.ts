/**
 * Reusable assumption/decision contract.
 *
 * Decisioning is a read/interpretation layer. Results are reproducible from
 * canonical state and must not be stored as durable user truth.
 */

export const PLANS_NBA_RESOLVER_VERSION = 'plans-nba.v1' as const;

export type DecisionConfidence = 'deterministic' | 'inferred' | 'unknown';

export type PlansNbaStateKey =
  | 'loading'
  | 'error'
  | 'setup_meal_rhythm'
  | 'setup_pantry'
  | 'plan_today'
  | 'finish_today'
  | 'plan_ahead'
  | 'review_plan';

export type DecisionActionId =
  | 'setup_meal_rhythm'
  | 'setup_pantry'
  | 'plan_without_pantry'
  | 'plan_today'
  | 'finish_today'
  | 'plan_ahead'
  | 'review_plan'
  | 'open_grocery';

export interface DecisionAction {
  actionId: DecisionActionId;
  destination: string;
  labelKey: string;
}

export interface DecisionSource {
  id: string;
  freshness?: string | null;
}

export interface DecisionResult {
  stateKey: PlansNbaStateKey;
  headlineKey: string;
  supportKey?: string;
  primary: DecisionAction | null;
  secondary: DecisionAction | null;
  reasonCodes: string[];
  confidence: DecisionConfidence;
  missingPrerequisites?: string[];
  sources?: DecisionSource[];
  resolverVersion: typeof PLANS_NBA_RESOLVER_VERSION;
}

export type DayCoverageKind = 'empty' | 'partial' | 'covered' | 'unknown';

export type PantryNbaSignal =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'weak'; reason: 'no_pantry' | 'no_list' | 'empty'; pantryItemsSaved: number }
  | { kind: 'ok'; pantryItemsSaved: number | null };

export type DecisionEventName =
  | 'plans_nba_exposed'
  | 'plans_nba_action_taken';

export interface PlansDecisionEvent {
  event: DecisionEventName;
  resolverVersion: typeof PLANS_NBA_RESOLVER_VERSION;
  stateKey: PlansNbaStateKey;
  primaryActionId: DecisionActionId | null;
  takenActionId?: DecisionActionId | null;
  path: 'primary' | 'secondary' | 'exposed';
  reasonCodes: string[];
  confidence: DecisionConfidence;
}
