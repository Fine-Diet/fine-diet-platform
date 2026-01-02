/**
 * Results Pack Validation and Hashing
 * 
 * Validates results pack JSON structure and generates content hashes
 * for change detection and caching.
 */

import crypto from 'crypto';
import { parseYouTube } from '../video/youtube';

export type PackValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  normalized?: any;
};

/**
 * Deterministic stringify for consistent hashing
 */
function stableStringify(obj: any): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/**
 * Generate SHA256 hash of normalized pack JSON
 */
export function hashPackJson(normalizedJson: any): string {
  const s = JSON.stringify(normalizedJson);
  return crypto.createHash('sha256').update(s).digest('hex');
}

/**
 * Validate results pack JSON structure
 * 
 * Accepts Flow v2 structure (flow.page1/2/3 with required keys) OR legacy structure
 * (core fields: summary, keyPatterns, firstFocusAreas).
 * 
 * Flow v2 validation: checks required keys and exact bullet counts.
 * Legacy validation: checks minimum viable core fields.
 */
export function validateResultsPack(packJson: any): PackValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!packJson || typeof packJson !== 'object') {
    errors.push('Pack JSON must be an object.');
    return { ok: false, errors, warnings };
  }

  const flow = packJson?.flow;

  // Check if Flow v2 structure exists
  if (flow && flow.page1 && flow.page2 && flow.page3) {
    // Validate Flow v2 structure
    
    // Page 1 validation
    if (!flow.page1.headline) {
      errors.push('flow.page1.headline is required.');
    }
    if (!flow.page1.body || !Array.isArray(flow.page1.body) || flow.page1.body.length === 0) {
      errors.push('flow.page1.body must be a non-empty array of strings.');
    }
    if (!flow.page1.snapshotBullets || !Array.isArray(flow.page1.snapshotBullets) || flow.page1.snapshotBullets.length !== 3) {
      errors.push('flow.page1.snapshotBullets must be an array with exactly 3 items.');
    }
    if (!flow.page1.meaningBody || typeof flow.page1.meaningBody !== 'string') {
      errors.push('flow.page1.meaningBody is required and must be a string.');
    }

    // Page 2 validation
    if (!flow.page2.headline) {
      errors.push('flow.page2.headline is required.');
    }
    if (!flow.page2.stepBullets || !Array.isArray(flow.page2.stepBullets) || flow.page2.stepBullets.length !== 3) {
      errors.push('flow.page2.stepBullets must be an array with exactly 3 items.');
    }
    if (!flow.page2.videoCtaLabel || typeof flow.page2.videoCtaLabel !== 'string') {
      errors.push('flow.page2.videoCtaLabel is required and must be a string.');
    }
    if (!flow.page2.videoAssetUrl || typeof flow.page2.videoAssetUrl !== 'string' || flow.page2.videoAssetUrl.trim() === '') {
      errors.push('Page 2 Video Asset URL is required and must be a non-empty string.');
    } else {
      // Validate that it's a parseable YouTube URL or video ID
      const youtubeParse = parseYouTube(flow.page2.videoAssetUrl);
      if (!youtubeParse) {
        errors.push('Page 2 Breakdown Video must be a valid YouTube URL or video ID.');
      }
    }

    // Page 3 validation
    if (!flow.page3.problemHeadline) {
      errors.push('flow.page3.problemHeadline is required.');
    }
    if (!flow.page3.problemBody || !Array.isArray(flow.page3.problemBody) || flow.page3.problemBody.length === 0) {
      errors.push('flow.page3.problemBody must be a non-empty array of strings.');
    }
    if (!flow.page3.tryBullets || !Array.isArray(flow.page3.tryBullets) || flow.page3.tryBullets.length !== 3) {
      errors.push('flow.page3.tryBullets must be an array with exactly 3 items.');
    }
    if (!flow.page3.mechanismTitle) {
      errors.push('flow.page3.mechanismTitle is required.');
    }
    if (!flow.page3.mechanismBodyTop || typeof flow.page3.mechanismBodyTop !== 'string') {
      errors.push('flow.page3.mechanismBodyTop is required and must be a string.');
    }
    if (!flow.page3.mechanismPills || !Array.isArray(flow.page3.mechanismPills) || flow.page3.mechanismPills.length !== 4) {
      errors.push('Page 3 Missing Mechanism Pills must contain exactly 4 items.');
    }
    if (!flow.page3.mechanismBodyBottom || typeof flow.page3.mechanismBodyBottom !== 'string') {
      errors.push('flow.page3.mechanismBodyBottom is required and must be a string.');
    }
    if (!flow.page3.methodTitle) {
      errors.push('flow.page3.methodTitle is required.');
    }
    if (!flow.page3.methodBody || !Array.isArray(flow.page3.methodBody) || flow.page3.methodBody.length === 0) {
      errors.push('flow.page3.methodBody must be a non-empty array of strings.');
    }
    if (!flow.page3.methodLearnBullets || !Array.isArray(flow.page3.methodLearnBullets) || flow.page3.methodLearnBullets.length !== 3) {
      errors.push('flow.page3.methodLearnBullets must be an array with exactly 3 items.');
    }
    if (!flow.page3.methodCtaLabel || typeof flow.page3.methodCtaLabel !== 'string') {
      errors.push('flow.page3.methodCtaLabel is required and must be a string.');
    }
    if (!flow.page3.methodCtaUrl || typeof flow.page3.methodCtaUrl !== 'string' || flow.page3.methodCtaUrl.trim() === '') {
      errors.push('Page 3 Method CTA URL is required and must be a non-empty string.');
    }
    if (!flow.page3.methodEmailLinkLabel || typeof flow.page3.methodEmailLinkLabel !== 'string') {
      errors.push('flow.page3.methodEmailLinkLabel is required and must be a string.');
    }

    // Optional fields warnings
    if (!flow.page1.snapshotTitle) {
      warnings.push('flow.page1.snapshotTitle is missing (will use default: "What We\'re Seeing").');
    }
    if (!flow.page1.meaningTitle) {
      warnings.push('flow.page1.meaningTitle is missing (will use default: "What This Often Means").');
    }
    if (!flow.page2.headline || flow.page2.headline === 'First Steps') {
      warnings.push('flow.page2.headline is missing or using default (will use default: "First Steps").');
    }
  } else {
    // Legacy validation: require minimum viable core fields
    if (!packJson.summary || typeof packJson.summary !== 'string') {
      errors.push('summary is required (legacy pack).');
    }
    if (!packJson.keyPatterns || !Array.isArray(packJson.keyPatterns) || packJson.keyPatterns.length === 0) {
      errors.push('keyPatterns must be a non-empty array (legacy pack).');
    }
    if (!packJson.firstFocusAreas || !Array.isArray(packJson.firstFocusAreas) || packJson.firstFocusAreas.length === 0) {
      errors.push('firstFocusAreas must be a non-empty array (legacy pack).');
    }
    
    if (flow) {
      warnings.push('flow object exists but is incomplete. Consider completing Flow v2 structure or removing flow to use legacy mode.');
    }
  }

  // Normalization: return as-is for now
  const normalized = packJson;

  return { ok: errors.length === 0, errors, warnings, normalized };
}

