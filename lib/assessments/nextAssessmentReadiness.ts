/**
 * Next Assessment Readiness Inventory (Packet X12)
 *
 * Pure inventory of wiring surfaces for a slug + assessmentType pair. Reports
 * what is present vs missing before activating a new assessment. Does not
 * register assessments, write CMS data, or mutate runtime state.
 *
 * Use after product/strategy confirms a canonical slug and assessmentType.
 * Do not call with invented placeholders — the inventory is for confirmed
 * identities only.
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  getAssessmentEntry,
  getAssessmentEntryByType,
  listActiveAssessments,
  type AssessmentRegistryEntry,
} from '@/lib/assessments/assessmentRegistry';
import { hasDedicatedAssessmentCoverConfig } from '@/lib/assessments/coverConfig';
import { getDeploymentConfig } from '@/lib/assessments/deployment/configRegistry';
import { isStagingQaRunnerRegistered } from '@/lib/assessments/deployment/stagingQaRunner';
import { hasOperationsContract, getOperationsContract } from '@/lib/assessments/operationsContract';
import { getOutcomeMapper } from '@/lib/assessments/outcomes/outcomeMapping';
import { getScoringAdapter } from '@/lib/assessments/scoring/scoringDispatch';

/** Code-owned surfaces an assessment must wire before activation. */
export type ReadinessSurfaceId =
  | 'registry'
  | 'scoring-adapter'
  | 'outcome-mapper'
  | 'operations-contract'
  | 'deployment-config'
  | 'staging-qa-runner'
  | 'dedicated-cover-config'
  | 'forced-result-preview'
  | 'repo-content-folder';

export type ReadinessSurfaceStatus = 'present' | 'missing' | 'optional-missing';

export interface ReadinessSurfaceResult {
  surface: ReadinessSurfaceId;
  status: ReadinessSurfaceStatus;
  detail: string;
}

export interface NextAssessmentReadinessInventory {
  slug: string;
  assessmentType: string;
  surfaces: ReadinessSurfaceResult[];
  /** Registry + adapter + mapper + operations contract all present. */
  draftActivationReady: boolean;
  /** Draft activation plus deployment operator surfaces (config + staging QA + repo content). */
  operatorReady: boolean;
  missingRequired: ReadinessSurfaceId[];
}

/** Surfaces required before a draft/direct-link assessment can score and map outcomes. */
export const DRAFT_ACTIVATION_SURFACES: readonly ReadinessSurfaceId[] = Object.freeze([
  'registry',
  'scoring-adapter',
  'outcome-mapper',
  'operations-contract',
]);

/** Surfaces required before deployment operators (staging QA, live E2E) can run. */
export const OPERATOR_SURFACES: readonly ReadinessSurfaceId[] = Object.freeze([
  'deployment-config',
  'staging-qa-runner',
  'repo-content-folder',
]);

function surface(
  id: ReadinessSurfaceId,
  status: ReadinessSurfaceStatus,
  detail: string
): ReadinessSurfaceResult {
  return { surface: id, status, detail };
}

function repoContentFolderExists(slug: string): boolean {
  const dir = path.join(process.cwd(), 'content', 'assessments', slug);
  try {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function checkRegistry(
  slug: string,
  assessmentType: string
): { result: ReadinessSurfaceResult; entry?: AssessmentRegistryEntry } {
  const bySlug = getAssessmentEntry(slug);
  const byType = getAssessmentEntryByType(assessmentType);

  if (!bySlug && !byType) {
    return {
      result: surface(
        'registry',
        'missing',
        `No registry entry for slug "${slug}" or assessmentType "${assessmentType}". Add to ASSESSMENT_REGISTRY in lib/assessments/assessmentRegistry.ts.`
      ),
    };
  }

  if (!bySlug) {
    return {
      result: surface(
        'registry',
        'missing',
        `assessmentType "${assessmentType}" is registered but slug "${slug}" is not. Registry slug: "${byType!.slug}".`
      ),
      entry: byType,
    };
  }

  if (!byType) {
    return {
      result: surface(
        'registry',
        'missing',
        `slug "${slug}" is registered but assessmentType "${assessmentType}" is not. Registry type: "${bySlug.assessmentType}".`
      ),
      entry: bySlug,
    };
  }

  if (bySlug.slug !== byType.slug || bySlug.assessmentType !== byType.assessmentType) {
    return {
      result: surface(
        'registry',
        'missing',
        `Slug/type mismatch: slug "${slug}" maps to "${bySlug.assessmentType}"; type "${assessmentType}" maps to slug "${byType.slug}".`
      ),
    };
  }

  return {
    result: surface(
      'registry',
      'present',
      `Registered (status=${bySlug.status}, catalogVisible=${bySlug.catalogVisible}, defaultVersion=${bySlug.defaultVersion}).`
    ),
    entry: bySlug,
  };
}

/**
 * Inventory wiring surfaces for a confirmed slug + assessmentType pair.
 * Optional `checkRepoContent` skips filesystem checks when false (browser-safe).
 */
export function inventoryNextAssessmentReadiness(
  slug: string,
  assessmentType: string,
  options: { checkRepoContent?: boolean } = {}
): NextAssessmentReadinessInventory {
  const checkRepoContent = options.checkRepoContent !== false;
  const surfaces: ReadinessSurfaceResult[] = [];

  const { result: registryResult } = checkRegistry(slug, assessmentType);
  surfaces.push(registryResult);

  const adapter = getScoringAdapter(assessmentType);
  surfaces.push(
    adapter
      ? surface(
          'scoring-adapter',
          'present',
          `Adapter "${adapter.id}" (template=${adapter.scoringTemplateId}).`
        )
      : surface(
          'scoring-adapter',
          'missing',
          `No adapter in lib/assessments/scoring/scoringDispatch.ts for "${assessmentType}". dispatchScoring fails closed.`
        )
  );

  const mapper = getOutcomeMapper(assessmentType);
  surfaces.push(
    mapper
      ? surface(
          'outcome-mapper',
          'present',
          `Mapper "${mapper.id}" (shape=${mapper.shape}).`
        )
      : surface(
          'outcome-mapper',
          'missing',
          `No mapper in lib/assessments/outcomes/outcomeMapping.ts for "${assessmentType}". mapAssessmentOutcome fails closed.`
        )
  );

  const contract = getOperationsContract(assessmentType);
  surfaces.push(
    hasOperationsContract(assessmentType)
      ? surface(
          'operations-contract',
          'present',
          `Contract declared (adapter=${contract!.scoringAdapterId}, levels=${contract!.resultLevels.length}).`
        )
      : surface(
          'operations-contract',
          'missing',
          `No contract in lib/assessments/operationsContract.ts for "${assessmentType}".`
        )
  );

  const deploymentConfig = getDeploymentConfig(slug);
  surfaces.push(
    deploymentConfig
      ? surface(
          'deployment-config',
          'present',
          `Deployment config registered (displayTitle=${deploymentConfig.displayTitle}).`
        )
      : surface(
          'deployment-config',
          'optional-missing',
          `No deployment config in lib/assessments/deployment/configRegistry.ts for slug "${slug}". Staging QA / live E2E CLIs unavailable until added.`
        )
  );

  surfaces.push(
    isStagingQaRunnerRegistered(slug)
      ? surface('staging-qa-runner', 'present', 'Registered in stagingQaRunner.ts.')
      : surface(
          'staging-qa-runner',
          'optional-missing',
          `No staging QA runner for slug "${slug}". npm run assessments:staging-qa will throw until registered.`
        )
  );

  surfaces.push(
    hasDedicatedAssessmentCoverConfig(slug)
      ? surface('dedicated-cover-config', 'present', 'Dedicated cover in coverConfig.ts.')
      : surface(
          'dedicated-cover-config',
          'optional-missing',
          'No dedicated cover — getAssessmentCoverConfig falls back to generic registry-derived cover.'
        )
  );

  const forcedPreview = contract?.preview.forcedResultPreview === true;
  surfaces.push(
    forcedPreview
      ? surface(
          'forced-result-preview',
          'present',
          'Operations contract declares forcedResultPreview; admin route expected.'
        )
      : surface(
          'forced-result-preview',
          'optional-missing',
          'No forced-result preview declared in operations contract (or legacy Gut Check exception applies).'
        )
  );

  if (checkRepoContent) {
    surfaces.push(
      repoContentFolderExists(slug)
        ? surface(
            'repo-content-folder',
            'present',
            `content/assessments/${slug}/ exists.`
          )
        : surface(
            'repo-content-folder',
            'optional-missing',
            `No content/assessments/${slug}/ folder — add questions/results JSON specs before CMS publish.`
          )
    );
  }

  const missingRequired = surfaces
    .filter((s) => s.status === 'missing')
    .map((s) => s.surface);

  const draftActivationReady = DRAFT_ACTIVATION_SURFACES.every((id) =>
    surfaces.some((s) => s.surface === id && s.status === 'present')
  );

  const operatorReady =
    draftActivationReady &&
    OPERATOR_SURFACES.every((id) =>
      surfaces.some((s) => s.surface === id && s.status === 'present')
    );

  return {
    slug,
    assessmentType,
    surfaces,
    draftActivationReady,
    operatorReady,
    missingRequired,
  };
}

export function inventoryLiveAssessments(): NextAssessmentReadinessInventory[] {
  return listActiveAssessments().map((entry) =>
    inventoryNextAssessmentReadiness(entry.slug, entry.assessmentType)
  );
}
