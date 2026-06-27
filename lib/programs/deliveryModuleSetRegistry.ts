/**
 * P1b — per-slug code-owned delivery-module set registry.
 *
 * Generalizes the former Baseline-only code fallback in the delivery service.
 * When no published DB delivery modules exist for a program, the runtime falls
 * back to a code-owned module set registered here (if any). Baseline keeps its
 * existing `baseline_code` source label so behavior and tests are unchanged.
 *
 * Additional programs can register a code set without schema or DB changes.
 */

import {
  BASELINE_PREP_DELIVERY_MODULES,
  BASELINE_WEEK_DELIVERY_MODULES,
} from './baselineDeliveryModules';
import type { ProgramDeliveryModuleDefinition } from './deliveryModuleTypes';

/** Source label for a code-owned set. Baseline is distinguished for back-compat. */
export type CodeDeliveryModuleSource = 'baseline_code' | 'code';

export interface CodeDeliveryModuleSet {
  source: CodeDeliveryModuleSource;
  modules: ProgramDeliveryModuleDefinition[];
}

const REGISTRY: Record<string, CodeDeliveryModuleSet> = {
  baseline: {
    source: 'baseline_code',
    modules: [
      ...BASELINE_PREP_DELIVERY_MODULES,
      ...BASELINE_WEEK_DELIVERY_MODULES,
    ],
  },
};

export function getCodeDeliveryModuleSet(
  programSlug: string,
): CodeDeliveryModuleSet | null {
  return REGISTRY[programSlug.trim().toLowerCase()] ?? null;
}
