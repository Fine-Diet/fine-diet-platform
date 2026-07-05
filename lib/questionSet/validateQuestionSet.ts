/**
 * Question Set validation and hashing — server entry point.
 *
 * The pure v2 validator lives in `./validateQuestionSetShared` (client-safe,
 * no Node-only imports) and is re-exported here so existing server imports
 * (`import { validateQuestionSet, hashQuestionSetJson } from '@/lib/questionSet/validateQuestionSet'`)
 * keep working unchanged. The crypto-backed content hash stays here because
 * `crypto` must not be pulled into the browser bundle.
 */

import crypto from 'crypto';

export {
  type QuestionSet,
  type QuestionSetValidationResult,
  validateQuestionSet,
} from './validateQuestionSetShared';

/**
 * Recursively sort object keys for stable stringify
 * Ensures same content produces same hash regardless of key order
 */
function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(item => stableStringify(item)).join(',') + ']';
  }

  const sortedKeys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const key of sortedKeys) {
    parts.push(JSON.stringify(key) + ':' + stableStringify(obj[key]));
  }
  return '{' + parts.join(',') + '}';
}

/**
 * Generate SHA256 hash of normalized question set JSON
 */
export function hashQuestionSetJson(contentJson: any): string {
  const normalized = stableStringify(contentJson);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
