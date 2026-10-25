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
  /** Provider or draft identity when the catalog id is null. Absent on older snapshots. */
  food_source_key?: string | null;
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

function positiveFinite(value: unknown): number | null {
  const finite = finiteOrNull(value);
  return finite !== null && finite > 0 ? finite : null;
}

/**
 * Retained snapshots scale with the quantity the nutrient basis actually
 * measures. Per 100 g follows grams. Per serving follows the serving
 * multiplier. An unavailable household conversion is not a multiplier.
 */
function retainedNutrientScale(args: {
  basis: string | null;
  priorLineage: ConsumedNutritionEvidence['lineage'];
  conversionExact: boolean;
  priorQuantity: number | null;
  nextQuantity: number | null;
  priorGrams: number | null;
  nextGrams: number | null;
}): number {
  if (!args.conversionExact) return 1;
  // A write-time snapshot stores the source's stated nutrient basis (per
  // serving or per 100 g). Once quantity changes, materialize that source
  // amount at the new quantity before marking the snapshot as retained. A
  // retained snapshot is already a consumed total and is scaled by the ratio
  // between its old and new quantities below.
  if (args.priorLineage === 'write_time_capture') {
    if (args.basis === 'per_100g' && args.nextGrams !== null) {
      return args.nextGrams / 100;
    }
    if (args.basis === 'per_serving' && args.nextQuantity !== null) {
      return args.nextQuantity;
    }
  }
  if (args.basis === 'per_100g' && args.priorGrams !== null && args.nextGrams !== null) {
    return args.nextGrams / args.priorGrams;
  }
  if (args.priorQuantity !== null && args.nextQuantity !== null) {
    return args.nextQuantity / args.priorQuantity;
  }
  return 1;
}

function payloadFoodObjectId(payload: Record<string, unknown>): string | null {
  if (typeof payload.foodObjectId === 'string' && payload.foodObjectId.length > 0) {
    return payload.foodObjectId;
  }
  if (typeof payload.food_object_id === 'string' && payload.food_object_id.length > 0) {
    return payload.food_object_id;
  }
  return null;
}

function presentText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function macroValue(payload: Record<string, unknown>, keys: string[]): number | null {
  const macros = payload.macros && typeof payload.macros === 'object'
    ? payload.macros as Record<string, unknown>
    : null;
  if (!macros) return null;
  for (const key of keys) {
    const value = finiteOrNull(macros[key]);
    if (value !== null) return value;
  }
  return null;
}

/**
 * An unkeyed, null-catalog row is the same record only when the saved food
 * fields are unchanged. A matching display name is not that proof: different
 * calories, macros, or basis mean an unproven replacement.
 */
export function sameUnkeyedFoodRecord(
  prior: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  if (payloadFoodObjectId(prior) || payloadFoodObjectId(next)) return false;
  if (presentText(prior.foodSourceKey) || presentText(next.foodSourceKey)) return false;
  const priorName = presentText(prior.name)?.toLowerCase() ?? '';
  const nextName = presentText(next.name)?.toLowerCase() ?? '';
  return priorName === nextName
    && finiteOrNull(prior.calories) === finiteOrNull(next.calories)
    && (presentText(prior.nutrition_basis) ?? '') === (presentText(next.nutrition_basis) ?? '')
    && macroValue(prior, ['protein', 'protein_g']) === macroValue(next, ['protein', 'protein_g'])
    && macroValue(prior, ['carbs', 'carbs_g']) === macroValue(next, ['carbs', 'carbs_g'])
    && macroValue(prior, ['fat', 'fat_g']) === macroValue(next, ['fat', 'fat_g'])
    && macroValue(prior, ['fiber', 'fiber_g']) === macroValue(next, ['fiber', 'fiber_g'])
    && macroValue(prior, ['added_sugar_g', 'addedSugar']) === macroValue(next, ['added_sugar_g', 'addedSugar']);
}

/**
 * Two null catalog ids are not the same food. Sameness requires a shared
 * catalog id, a shared provider/source key, or an unchanged unkeyed record.
 * A matching display name does not prove identity.
 */
export function consumedFoodIdentityChanged(args: {
  previousFoodObjectId: string | null;
  nextFoodObjectId: string | null;
  previousSourceKey: string | null;
  nextSourceKey: string | null;
  previousName: string | null;
  nextName: string | null;
  sameUnkeyedRecord?: boolean;
}): boolean {
  const previousId = args.previousFoodObjectId;
  const nextId = args.nextFoodObjectId;
  if (previousId && nextId) return previousId !== nextId;
  if (Boolean(previousId) !== Boolean(nextId)) return true;

  const previousSource = args.previousSourceKey;
  const nextSource = args.nextSourceKey;
  if (previousSource && nextSource) return previousSource !== nextSource;
  if (Boolean(previousSource) !== Boolean(nextSource)) return true;

  return args.sameUnkeyedRecord !== true;
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
    previousFoodObjectId?: string | null;
    previousSourceKey?: string | null;
    previousName?: string | null;
    sameUnkeyedRecord?: boolean;
  },
): Record<string, unknown> {
  const cleaned = stripClientClaimedEvidence(payload);
  const nextFoodObjectId = payloadFoodObjectId(cleaned);
  const previousFoodObjectId = extras.previousFoodObjectId ?? null;
  const nextSourceKey = presentText(cleaned.foodSourceKey);
  const identityChanged = consumedFoodIdentityChanged({
    previousFoodObjectId,
    nextFoodObjectId,
    previousSourceKey: extras.previousSourceKey ?? null,
    nextSourceKey,
    previousName: extras.previousName ?? null,
    nextName: presentText(cleaned.name),
    sameUnkeyedRecord: extras.sameUnkeyedRecord,
  });
  const existing = identityChanged ? null : extras.retainExisting;
  const schemaOk = existing?.schema_version === NDS_CONSUMED_EVIDENCE_VERSION;
  const nextGrams = finiteOrNull(extras.quantityG);
  const gramsDiffer = existing != null && finiteOrNull(existing.quantity_g) !== nextGrams;
  // An unchanged serving multiplier is not proof the gram amount is unchanged.
  // Serving size and grams can move together and leave the multiplier put.
  if (existing && schemaOk && !extras.quantityChanged && !gramsDiffer) {
    return { ...cleaned, consumed_nutrition_evidence: existing };
  }
  const retainSnapshot = Boolean(existing) && (Boolean(extras.quantityChanged) || (schemaOk && gramsDiffer));

  const macros = cleaned.macros && typeof cleaned.macros === 'object'
    ? (cleaned.macros as Record<string, unknown>)
    : null;
  const quantity = finiteOrNull(cleaned.quantity);
  const basis =
    existing && typeof existing.nutrient_basis === 'string'
      ? existing.nutrient_basis
      : typeof cleaned.nutrition_basis === 'string'
        ? cleaned.nutrition_basis
        : null;
  const scale = retainSnapshot && existing
    ? retainedNutrientScale({
      basis,
      priorLineage: existing.lineage,
      conversionExact: extras.quantityConversion === 'exact',
        priorQuantity: positiveFinite(existing.quantity),
        nextQuantity: positiveFinite(quantity),
        priorGrams: positiveFinite(existing.quantity_g),
        nextGrams: positiveFinite(nextGrams),
      })
    : 1;

  const scaled = (value: number | null): number | null =>
    value === null ? null : value * scale;

  const evidence: ConsumedNutritionEvidence =
    retainSnapshot && existing
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
          food_object_id: nextFoodObjectId,
          food_source_key: nextSourceKey,
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
