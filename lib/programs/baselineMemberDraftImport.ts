/**
 * Source-only mapping for a new Baseline member draft.
 *
 * This file prepares version metadata and draft module payloads. It does not
 * insert, publish, or alter Baseline v1 or the unrelated v2 draft. Importing
 * the server client keeps the authoring candidate off the member browser graph.
 */
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { BASELINE_DAY_0_TO_21_BLUEPRINT } from './baselineDay0To21Candidate';
import {
  PROGRAM_BLUEPRINT_METADATA_KEY,
  toProgramBlueprintVersionFields,
} from './programBlueprint';
import { toProgramDeliveryModulePayloads } from './programBlueprintStorage';
import {
  BASELINE_MEMBER_DRAFT_VERSION_LABEL,
  PROTECTED_BASELINE_V1,
  UNTOUCHED_BASELINE_DRAFT,
} from './baselineMemberBinding';
import { GENERATED_PROGRAM_VERSION_KEY } from './baselineMemberModuleIdentity';

void supabaseAdmin;

const PROTECTED_VERSION_IDS = new Set<string>([
  PROTECTED_BASELINE_V1.versionId,
  UNTOUCHED_BASELINE_DRAFT.versionId,
]);

export function baselineMemberDraftVersionRecord() {
  return {
    versionLabel: BASELINE_MEMBER_DRAFT_VERSION_LABEL,
    durationDays: BASELINE_DAY_0_TO_21_BLUEPRINT.version.durationDays,
    status: 'draft' as const,
    metadata: {
      [PROGRAM_BLUEPRINT_METADATA_KEY]: toProgramBlueprintVersionFields(
        BASELINE_DAY_0_TO_21_BLUEPRINT,
      ),
    },
  };
}

export function assessBaselineMemberPublication() {
  const checkInDays = BASELINE_DAY_0_TO_21_BLUEPRINT.interactions.checkIns.map(
    (checkIn) => checkIn.day,
  );
  return {
    generatedVersionKeyPattern: GENERATED_PROGRAM_VERSION_KEY.source,
    draftApiAccepts: ['source_version_id', 'version_label', 'duration_days'] as const,
    durationDays: BASELINE_DAY_0_TO_21_BLUEPRINT.version.durationDays,
    moduleCount: BASELINE_DAY_0_TO_21_BLUEPRINT.modules.length,
    checkInDays,
    gaps: [
      {
        code: 'version-key-assigned-by-draft-rpc' as const,
        detail: 'create_program_version_draft assigns version_key as vN-xxxxxxxx. The admin draft API cannot supply a custom key.',
      },
      {
        code: 'version-metadata-not-accepted-by-draft-api' as const,
        detail: 'programBlueprintV1 is not a create-draft field. A new draft starts with empty metadata unless it is copied from a published source version.',
      },
      {
        code: 'checkin-templates-not-in-module-import' as const,
        detail: `Days ${checkInDays.join(', ')} require published program_checkin_templates before day completion can enforce them. The module import does not create those rows, and the blueprint does not include check-in questions.`,
      },
    ],
  };
}

export function toBaselineMemberDraftImportPayloads(programVersionId: string) {
  if (PROTECTED_VERSION_IDS.has(programVersionId)) {
    throw new Error('Refusing to map the member draft onto a protected Baseline version.');
  }
  const payloads = toProgramDeliveryModulePayloads(
    BASELINE_DAY_0_TO_21_BLUEPRINT,
    programVersionId,
  );
  if (payloads.some((payload) => payload.status !== 'draft')) {
    throw new Error('Member draft import payloads must stay drafts.');
  }
  if (payloads.some((payload) => payload.program_version_id !== programVersionId)) {
    throw new Error('Member draft import payloads must stay on the requested draft version.');
  }
  return payloads;
}
