/**
 * Write-time consumed nutrition evidence.
 *
 * Captured at the shared server write boundary. A client-supplied snapshot is
 * stripped; only the server-authored record is retained.
 */

export const NDS_CONSUMED_EVIDENCE_VERSION = 'nds_consumed_evidence_2026-09-13.v1';

export interface ConsumedNutritionEvidence {
  schema_version: typeof NDS_CONSUMED_EVIDENCE_VERSION;
  lineage: 'write_time_capture' | 'retained_prior_snapshot';
  food_object_id: string | null;
  catalog_version: string | null;
  quantity: number | null;
  unit: string | null;
  quantity_g: number | null;
  quantity_conversion: 'exact' | 'household_measure_unavailable';
  calories: number | null;
  protein_g: number | null;
  fiber_g: number | null;
  added_sugar_g: number | null;
  added_sugar_provenance: 'authored' | 'unknown' | 'untrusted_catalog_total_sugar' | null;
  nutrient_basis: string | null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stripClientClaimedEvidence<T extends Record<string, unknown>>(payload: T): T {
  if (!('consumed_nutrition_evidence' in payload)) return payload;
  const { consumed_nutrition_evidence: _discarded, ...rest } = payload;
  return rest as unknown as T;
}

export function attachConsumedNutritionEvidence(
  payload: Record<string, unknown>,
  extras: {
    quantityG: number | null;
    quantityConversion: 'exact' | 'household_measure_unavailable';
    retainExisting?: ConsumedNutritionEvidence | null;
    quantityChanged?: boolean;
  },
): Record<string, unknown> {
  const cleaned = stripClientClaimedEvidence(payload);
  const existing = extras.retainExisting;
  if (existing && existing.schema_version === NDS_CONSUMED_EVIDENCE_VERSION && !extras.quantityChanged) {
    return { ...cleaned, consumed_nutrition_evidence: existing };
  }

  const macros = cleaned.macros && typeof cleaned.macros === 'object'
    ? (cleaned.macros as Record<string, unknown>)
    : null;
  const quantity = finiteOrNull(cleaned.quantity);
  const scale =
    extras.quantityChanged && existing && existing.quantity && quantity
      ? quantity / existing.quantity
      : 1;

  const scaled = (value: number | null): number | null =>
    value === null ? null : value * scale;

  const evidence: ConsumedNutritionEvidence =
    extras.quantityChanged && existing
      ? {
          ...existing,
          lineage: 'retained_prior_snapshot',
          quantity,
          unit: typeof cleaned.unit === 'string' ? cleaned.unit : existing.unit,
          quantity_g: extras.quantityG,
          quantity_conversion: extras.quantityConversion,
          calories: scaled(existing.calories),
          protein_g: scaled(existing.protein_g),
          fiber_g: scaled(existing.fiber_g),
          added_sugar_g: scaled(existing.added_sugar_g),
        }
      : {
          schema_version: NDS_CONSUMED_EVIDENCE_VERSION,
          lineage: 'write_time_capture',
          food_object_id: typeof cleaned.foodObjectId === 'string' ? cleaned.foodObjectId : null,
          catalog_version:
            typeof cleaned.food_version_token === 'string'
              ? cleaned.food_version_token
              : typeof cleaned.catalog_version === 'string'
                ? cleaned.catalog_version
                : null,
          quantity,
          unit: typeof cleaned.unit === 'string' ? cleaned.unit : null,
          quantity_g: extras.quantityG,
          quantity_conversion: extras.quantityConversion,
          calories: finiteOrNull(cleaned.calories),
          protein_g: macros ? finiteOrNull(macros.protein ?? macros.protein_g) : null,
          fiber_g: macros ? finiteOrNull(macros.fiber ?? macros.fiber_g) : null,
          added_sugar_g: macros ? finiteOrNull(macros.added_sugar_g ?? macros.addedSugar) : null,
          added_sugar_provenance:
            macros && typeof macros.added_sugar_provenance === 'string'
              ? (macros.added_sugar_provenance as ConsumedNutritionEvidence['added_sugar_provenance'])
              : cleaned.added_sugar_provenance === 'authored'
                ? 'authored'
                : finiteOrNull(macros?.added_sugar_g ?? macros?.addedSugar) === null
                  ? 'unknown'
                  : null,
          nutrient_basis:
            typeof cleaned.nutrition_basis === 'string' ? cleaned.nutrition_basis : null,
        };

  return { ...cleaned, consumed_nutrition_evidence: evidence };
}

export function readRetainedEvidence(
  payload: Record<string, unknown>,
): ConsumedNutritionEvidence | null {
  const raw = payload.consumed_nutrition_evidence;
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as ConsumedNutritionEvidence;
  if (record.schema_version !== NDS_CONSUMED_EVIDENCE_VERSION) return null;
  return record;
}
