/**
 * Generic assessment deployment operator types (Packet X10).
 *
 * Config-driven tooling for live E2E, launch-gate checks, staging validation,
 * and copyVersion republish. See docs/assessments/assessment-deployment-sop.md.
 */

import type { AssessmentType } from '@/lib/assessmentTypes';

/** Output artifact keys checked by deployment operators. */
export type DeploymentArtifactKey =
  | 'email'
  | 'pdf'
  | 'claim'
  | 'account-save'
  | 'share';

/** Independent launch gates from X9 SOP §2. */
export type LaunchGateId =
  | 'runtime'
  | 'cms'
  | 'catalog'
  | 'seo'
  | 'sitemap'
  | 'marketing-surfaces'
  | 'artifacts';

export interface LaunchGateExpectation {
  gate: LaunchGateId;
  /** Human-readable expectation for reports. */
  description: string;
  /**
   * When set, in-repo checks compare registry/contract state to this target.
   * Omit for gates verified only via HTTP (e.g. sitemap).
   */
  inRepoCheck?: 'registry-active' | 'catalog-visible' | 'catalog-hidden' | 'artifacts-disabled';
}

export interface LiveE2eOutcomeCase {
  levelId: string;
  expectedLabel: string;
  expectedMethodCtaLabel: string;
  expectedMethodCtaUrl: string;
  defaultSubmissionId: string;
}

export interface SiblingRegressionTarget {
  slug: string;
  assessmentType: AssessmentType | string;
  resultsVersion: string;
  sampleLevelId: string;
  /** Cover route must not have noindex (Gut Check default). */
  coverMustBeIndexable: boolean;
}

export interface CopyVersionRepublishPackRef {
  packId: string;
}

export interface AssessmentDeploymentConfig {
  slug: string;
  assessmentType: AssessmentType | string;
  displayTitle: string;
  /** Optional packet UUID for report headers. */
  packetId?: string;

  contentPaths: {
    questionSetJson: string;
    resultsPacksJson: string;
  };

  questionSet: {
    cmsVersion: string;
    schemaVersion: string;
    expectedQuestionIds: readonly string[];
    expectedAvatars: readonly string[];
  };

  results: {
    resultsVersion: string;
    levelIds: readonly string[];
  };

  liveE2e: {
    defaultBaseUrl: string;
    outcomes: readonly LiveE2eOutcomeCase[];
    /** Method destination probed after each outcome (shared CTA target). */
    methodDestinationPath: string;
  };

  /** Optional mechanical copyVersion republish (X6.1-style). */
  copyVersionRepublish?: {
    targetCopyVersion: string;
    changeSummary: string;
    actorId: string;
    packIds: Record<string, CopyVersionRepublishPackRef>;
  };

  launchGates: {
    expectations: readonly LaunchGateExpectation[];
    artifactKeys: readonly DeploymentArtifactKey[];
  };

  siblingRegression: readonly SiblingRegressionTarget[];

  forcedPreview: {
    adminPathTemplate: string;
  };

  placeholderScan: {
    bannedSubstrings: readonly string[];
  };

  stagingQa: {
    adminCookieEnvVar: string;
    vercelBypassEnvVar: string;
    reportFilenamePrefix: string;
  };
}

export type CheckStatus = 'pass' | 'fail' | 'skipped';

export interface NamedCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface LiveE2eOutcomeResult {
  levelId: string;
  submissionId: string;
  status: 'pass' | 'fail';
  checks: NamedCheck[];
}

export interface LiveE2eReport {
  generatedAt: string;
  baseUrl: string;
  config: Pick<AssessmentDeploymentConfig, 'slug' | 'displayTitle' | 'assessmentType' | 'packetId'>;
  outcomes: LiveE2eOutcomeResult[];
  siblingRegression: { status: 'pass' | 'fail'; checks: NamedCheck[] };
  launchGateSummary: NamedCheck[];
  recommendation: string;
}

export interface CopyVersionRepublishResult {
  levelId: string;
  packId: string;
  beforeRevisionId: string | null;
  beforeRevisionNumber: number | null;
  beforeCopyVersion: string | null;
  afterRevisionId?: string;
  afterRevisionNumber?: number;
  afterCopyVersion?: string;
  status: 'pass' | 'fail' | 'skipped';
  detail: string;
}
