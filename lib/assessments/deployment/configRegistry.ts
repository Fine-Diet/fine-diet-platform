import { BASELINE_READINESS_DEPLOYMENT_CONFIG } from '@/lib/assessments/deployment/configs/baselineReadinessDeploymentConfig';
import type { AssessmentDeploymentConfig } from '@/lib/assessments/deployment/types';

const DEPLOYMENT_CONFIGS: Readonly<Record<string, AssessmentDeploymentConfig>> = {
  'baseline-readiness': BASELINE_READINESS_DEPLOYMENT_CONFIG,
};

export function getDeploymentConfig(slug: string): AssessmentDeploymentConfig | null {
  return DEPLOYMENT_CONFIGS[slug] ?? null;
}

export function listDeploymentConfigSlugs(): string[] {
  return Object.keys(DEPLOYMENT_CONFIGS);
}

export function requireDeploymentConfig(slug: string): AssessmentDeploymentConfig {
  const config = getDeploymentConfig(slug);
  if (!config) {
    throw new Error(
      `No deployment config for slug "${slug}". Registered: ${listDeploymentConfigSlugs().join(', ') || '(none)'}`
    );
  }
  return config;
}
