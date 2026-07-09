import { BASELINE_READINESS_RESULT_LEVELS } from '@/lib/assessments/baselineReadiness/constants';
import type { AssessmentDeploymentConfig } from '@/lib/assessments/deployment/types';

/** Baseline Readiness deployment operator config (proof path — X4–X7). */
export const BASELINE_READINESS_DEPLOYMENT_CONFIG: AssessmentDeploymentConfig = {
  slug: 'baseline-readiness',
  assessmentType: 'baseline-readiness',
  displayTitle: 'Baseline Readiness',
  packetId: 'f6b55849-cf1e-4100-9450-a087134a01c1',

  contentPaths: {
    questionSetJson: 'content/assessments/baseline-readiness/questions_v1.json',
    resultsPacksJson: 'content/assessments/baseline-readiness/results_v1-internal.json',
  },

  questionSet: {
    cmsVersion: '1',
    schemaVersion: '2',
    expectedQuestionIds: ['br-q1', 'br-q2', 'br-q3', 'br-q4', 'br-q5'],
    expectedAvatars: [...BASELINE_READINESS_RESULT_LEVELS],
  },

  results: {
    resultsVersion: 'v1-internal',
    levelIds: [...BASELINE_READINESS_RESULT_LEVELS],
  },

  liveE2e: {
    defaultBaseUrl: 'https://myfinediet.com',
    methodDestinationPath: '/the-fine-diet-method',
    outcomes: [
      {
        levelId: 'readiness-low',
        expectedLabel: 'Foundation Builder',
        expectedMethodCtaLabel: 'Start with the Fine Diet Method',
        expectedMethodCtaUrl: '/the-fine-diet-method',
        defaultSubmissionId: 'd918fcf0-ded6-4792-b89e-f0dd38373f27',
      },
      {
        levelId: 'readiness-building',
        expectedLabel: 'Rhythm Builder',
        expectedMethodCtaLabel: 'Build your rhythm with the Fine Diet Method',
        expectedMethodCtaUrl: '/the-fine-diet-method',
        defaultSubmissionId: '51bf16c8-c9c2-4f7f-a7ed-90634fef14aa',
      },
      {
        levelId: 'readiness-ready',
        expectedLabel: 'Ready for Guided Observation',
        expectedMethodCtaLabel: 'Begin the Fine Diet Method',
        expectedMethodCtaUrl: '/the-fine-diet-method',
        defaultSubmissionId: '1c92ade1-608f-490c-a429-88c25ff64623',
      },
    ],
  },

  copyVersionRepublish: {
    targetCopyVersion: 'v1',
    changeSummary:
      'Mechanical copyVersion bump to v1 (founder-approved launch content)',
    actorId: 'ad4805d2-b9ec-4bb8-a9a1-f50e5bed9d9b',
    packIds: {
      'readiness-low': { packId: '1e4ab583-218b-496a-9669-24d8cbdd81f9' },
      'readiness-building': { packId: 'c9fe2037-1bad-4425-85b2-03878633d0a5' },
      'readiness-ready': { packId: 'e84a7e1f-cc93-465c-8463-7bba7fa5e3fe' },
    },
  },

  launchGates: {
    expectations: [
      { gate: 'runtime', description: 'Registry status active; direct link routable', inRepoCheck: 'registry-active' },
      { gate: 'catalog', description: 'catalogVisible drives /assessments listing', inRepoCheck: 'catalog-visible' },
      { gate: 'seo', description: 'Index posture matches catalogVisible (no override when launched)', inRepoCheck: 'catalog-visible' },
      { gate: 'sitemap', description: 'Catalog routes in sitemap when indexable' },
      { gate: 'artifacts', description: 'Downstream artifacts disabled at launch', inRepoCheck: 'artifacts-disabled' },
    ],
    artifactKeys: ['email', 'pdf', 'claim', 'account-save'],
  },

  siblingRegression: [
    {
      slug: 'gut-check',
      assessmentType: 'gut-check',
      resultsVersion: 'v2',
      sampleLevelId: 'level1',
      coverMustBeIndexable: true,
    },
  ],

  forcedPreview: {
    adminPathTemplate: '/admin/assessments/baseline-readiness/preview?forceOutcome={forceOutcome}',
  },

  placeholderScan: {
    bannedSubstrings: ['ig61sqn2lyM', '(placeholder)'],
  },

  stagingQa: {
    adminCookieEnvVar: 'BASELINE_READINESS_QA_ADMIN_COOKIE',
    vercelBypassEnvVar: 'BASELINE_READINESS_QA_VERCEL_BYPASS',
    reportFilenamePrefix: 'baseline-readiness-qa',
  },
};
