import type { ProgramDeliveryModuleDefinition } from './deliveryModuleTypes';
import type { ProgramBlueprint } from './programBlueprint';

/** Maps the Blueprint's single module source into the existing Packet 16 rows. */
export function toProgramDeliveryModulePayloads(
  blueprint: ProgramBlueprint,
  programVersionId: string,
) {
  return blueprint.modules.map((module, displayOrder) => ({
    program_version_id: programVersionId,
    module_key: module.id,
    module_type: module.moduleType,
    title: module.title,
    eyebrow: module.eyebrow ?? null,
    body: module.body,
    day_start: module.dayStart ?? null,
    day_end: module.dayEnd ?? null,
    status_visibility: module.statusVisibility,
    capacity_variants_json: module.capacityVariants ?? {},
    cta_json: module.cta ?? {},
    anchor_json: {
      ...(module.anchorId ? { anchorId: module.anchorId } : {}),
      ...(module.groupId ? { groupId: module.groupId } : {}),
      ...(module.groupTitle ? { groupTitle: module.groupTitle } : {}),
    },
    display_order: displayOrder,
    status: 'draft' as const,
    safety_notes: module.safetyNotes ?? [],
    no_claims_notes: module.noClaimsNotes ?? [],
    // Blueprint's Zod shape accepts generic JSON blocks; the existing module
    // authoring validator remains the authority for the renderer block union.
    metadata: moduleMetadata(module as ProgramDeliveryModuleDefinition),
  }));
}

function moduleMetadata(module: ProgramDeliveryModuleDefinition): Record<string, unknown> {
  return {
    ...(module.groupId ? { groupId: module.groupId } : {}),
    ...(module.groupTitle ? { groupTitle: module.groupTitle } : {}),
    ...(module.blocks ? { blocks: module.blocks } : {}),
    ...(module.showWhen ? { showWhen: module.showWhen } : {}),
    ...(module.statusCopy ? { statusCopy: module.statusCopy } : {}),
    ...(module.moduleType === 'guide' && module.dayStart != null
      ? { completionRequired: true }
      : {}),
  };
}
