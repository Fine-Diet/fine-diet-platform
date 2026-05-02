import type { SocialImportEvidenceSource } from './types';

export interface PreparedSocialEvidence {
  evidence_text: string;
  source_count: number;
}

const MAX_EVIDENCE_CHARS = 40_000;

export function prepareEvidenceForExtraction(
  sources: SocialImportEvidenceSource[],
): PreparedSocialEvidence {
  const blocks: string[] = [];
  for (const source of sources) {
    const text = dedupeLines(source.normalized_text ?? source.raw_text ?? '');
    if (!text) continue;
    blocks.push(
      [
        `SOURCE_ID: ${source.id}`,
        `SOURCE_KIND: ${source.source_kind}`,
        `SOURCE_LABEL: ${source.source_label ?? source.source_kind}`,
        `PLATFORM: ${source.platform}`,
        `QUALITY: ${source.quality}`,
        source.language ? `LANGUAGE: ${source.language}` : null,
        'TEXT:',
        text,
      ]
        .filter((line): line is string => typeof line === 'string')
        .join('\n'),
    );
  }
  const joined = blocks.join('\n\n---\n\n').trim();
  return {
    evidence_text:
      joined.length > MAX_EVIDENCE_CHARS
        ? `${joined.slice(0, MAX_EVIDENCE_CHARS)}\n[TRUNCATED: evidence exceeded ${MAX_EVIDENCE_CHARS} chars]`
        : joined,
    source_count: blocks.length,
  };
}

function dedupeLines(raw: string): string {
  const lines = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim());
  const out: string[] = [];
  let previous = '';
  for (const line of lines) {
    if (!line) {
      if (previous !== '') out.push('');
      previous = '';
      continue;
    }
    if (line === previous) continue;
    out.push(line);
    previous = line;
  }
  return out.join('\n').trim();
}
