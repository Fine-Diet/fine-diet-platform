import type { AssessmentDeploymentConfig, NamedCheck } from '@/lib/assessments/deployment/types';

const DEFAULT_BANNED_REGEXES = [
  /\/method(?!-)/i,
  /v1-internal-draft/i,
  /v1-test-candidate/i,
];

export function scanTextForPlaceholders(
  text: string,
  config: AssessmentDeploymentConfig
): { clean: boolean; matches: string[] } {
  const matches: string[] = [];

  for (const sub of config.placeholderScan.bannedSubstrings) {
    if (text.includes(sub)) {
      matches.push(sub);
    }
  }

  for (const regex of DEFAULT_BANNED_REGEXES) {
    if (regex.test(text)) {
      matches.push(regex.source);
    }
  }

  return { clean: matches.length === 0, matches: [...new Set(matches)] };
}

export function buildPlaceholderCheck(
  text: string,
  config: AssessmentDeploymentConfig,
  label = 'SSR HTML has no placeholder refs'
): NamedCheck {
  const scan = scanTextForPlaceholders(text, config);
  return {
    name: label,
    status: scan.clean ? 'pass' : 'fail',
    detail: scan.clean ? 'clean' : `found: ${scan.matches.join(', ')}`,
  };
}
