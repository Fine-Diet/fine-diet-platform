import { createDefaultIngredientLookup } from '@/lib/plans/ingredientMatcher';
import { createImportedMeal } from '@/lib/plans/importsServerService';
import { rebuildDerivedFromIngredientsGrounded } from '@/lib/plans/recipeImporter';
import type {
  ImportedMeal,
  ImportedMealDraftIngredient,
  ImportedMealDraftStep,
} from '@/lib/plans/types';
import type {
  SocialEvidenceReference,
  SocialImportedMealDraftPayload,
  SocialImportEvidenceSource,
  SocialImportExtraction,
  SocialImportJob,
  SocialQuantityStatus,
} from './types';
import { SOCIAL_IMPORT_VERSION } from './types';

export async function createImportedMealFromSocialExtraction(args: {
  personId: string;
  job: SocialImportJob;
  evidenceSources: SocialImportEvidenceSource[];
  extraction: SocialImportExtraction;
}): Promise<ImportedMeal | null> {
  const { personId, job, extraction, evidenceSources } = args;
  const payload = extraction.output_json;
  if (payload.content_type !== 'single_recipe') return null;
  const recipe = payload.recipes[0];
  if (!recipe) return null;
  const hasDraftableContent = recipe.ingredients.length > 0 || recipe.steps.length > 0;
  if (!hasDraftableContent) return null;

  const title =
    recipe.title.value?.trim() ||
    payload.title.value?.trim() ||
    'Social recipe draft';
  const ingredients: ImportedMealDraftIngredient[] = recipe.ingredients.map((ingredient) => {
    const quantityAllowed = ingredient.quantity_status === 'stated';
    return {
      raw_text: buildIngredientRawText(ingredient),
      normalized_name: ingredient.name,
      quantity_value: quantityAllowed ? ingredient.quantity : null,
      quantity_unit: quantityAllowed ? ingredient.unit : null,
      preparation_note: ingredient.preparation_note,
      parse_confidence:
        ingredient.confidence === 'high' && quantityAllowed
          ? 'high'
          : ingredient.confidence === 'low'
            ? 'low'
            : 'medium',
      quantity_source: quantitySourceFor(ingredient.quantity_status),
    };
  });

  const steps: ImportedMealDraftStep[] = recipe.steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((step, idx) => ({
      step_number: idx + 1,
      instruction: step.timing_text
        ? `${step.instruction} (${step.timing_text})`
        : step.instruction,
    }));

  const claim_provenance: Record<string, SocialEvidenceReference[]> = {
    title: recipe.title.evidence_refs,
    description: recipe.description.evidence_refs,
    servings: recipe.servings.evidence_refs,
  };
  recipe.ingredients.forEach((ingredient, idx) => {
    claim_provenance[`ingredient:${idx}`] = ingredient.evidence_refs;
  });
  recipe.steps.forEach((step, idx) => {
    claim_provenance[`step:${idx}`] = step.evidence_refs;
  });

  const draft: SocialImportedMealDraftPayload = {
    title,
    description: recipe.description.value ?? payload.summary,
    servings: recipe.servings.status === 'stated' ? recipe.servings.value : null,
    ingredients,
    steps,
    meal_type_hint: 'unknown',
    acquisition_mode: 'automatic',
    onscreen_assist: {
      used: evidenceSources.some((source) => source.source_kind === 'onscreen_text'),
      source: evidenceSources.some((source) => source.source_kind === 'onscreen_text')
        ? 'user_supplied'
        : null,
      chars: evidenceSources
        .filter((source) => source.source_kind === 'onscreen_text')
        .reduce(
          (sum, source) => sum + (source.normalized_text ?? source.raw_text ?? '').length,
          0,
        ),
    },
    translated_from_language: null,
    transcript_source: null,
    social_import: {
      version: SOCIAL_IMPORT_VERSION,
      job_id: job.id,
      extraction_id: extraction.id,
      content_type: payload.content_type,
      review_items: [...payload.review_items, ...recipe.review_items],
      evidence_source_ids: evidenceSources.map((source) => source.id),
      claim_provenance,
    },
  };

  const rebuilt = await rebuildDerivedFromIngredientsGrounded({
    title,
    ingredients,
    servings: draft.servings,
    lookup: createDefaultIngredientLookup(),
  });
  const needsReview =
    draft.social_import.review_items.some((item) => item.severity !== 'info') ||
    ingredients.some((ingredient) => ingredient.quantity_value == null);

  return await createImportedMeal({
    personId,
    title,
    source_type: 'video',
    source_url: job.source_url,
    import_type: 'video',
    source_platform: job.platform,
    raw_input_text: renderRawEvidence(evidenceSources),
    parse_status: needsReview ? 'manual_review' : rebuilt.parse_status,
    parsed_payload_json: draft,
    nutrition_estimate_json: rebuilt.nutrition_estimate,
    ingredient_match_json: rebuilt.ingredient_match,
    payload: rebuilt.payload,
    protein_score_10: rebuilt.nds.protein_score_10,
    is_main_meal: rebuilt.nds.is_main_meal,
    psq_multiplier: rebuilt.nds.psq_multiplier,
    meal_derived_data: rebuilt.nds.meal_derived_data,
    nds_confidence: rebuilt.nds.nds_confidence,
  });
}

function buildIngredientRawText(ingredient: {
  name: string;
  quantity: number | null;
  unit: string | null;
  quantity_text: string | null;
  quantity_status: SocialQuantityStatus;
  preparation_note: string | null;
}): string {
  const parts: string[] = [];
  if (ingredient.quantity_status === 'stated' && ingredient.quantity != null) {
    parts.push(String(ingredient.quantity));
    if (ingredient.unit) parts.push(ingredient.unit);
  } else if (ingredient.quantity_text) {
    parts.push(ingredient.quantity_text);
  }
  parts.push(ingredient.name);
  if (ingredient.preparation_note) parts.push(`(${ingredient.preparation_note})`);
  return parts.join(' ').trim();
}

function quantitySourceFor(
  status: SocialQuantityStatus,
): ImportedMealDraftIngredient['quantity_source'] {
  if (status === 'stated') return 'explicit';
  if (status === 'vague' || status === 'inferred') return 'approximated';
  return null;
}

function renderRawEvidence(sources: SocialImportEvidenceSource[]): string {
  return sources
    .map((source) => {
      const text = source.normalized_text ?? source.raw_text ?? '';
      return `[${source.source_kind}${source.source_label ? `: ${source.source_label}` : ''}]\n${text}`;
    })
    .filter((block) => block.trim().length > 0)
    .join('\n\n---\n\n');
}
