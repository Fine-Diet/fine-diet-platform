import { describe, expect, test } from '@jest/globals';
import {
  currentAcquisitionReviewItems,
  latestExtractionReviewItems,
} from '../reviewSummary';
import type { SocialImportReviewItem } from '../types';

function reviewItem(
  code: SocialImportReviewItem['code'],
  message: string,
  severity: SocialImportReviewItem['severity'] = 'warning',
): SocialImportReviewItem {
  return {
    code,
    severity,
    message,
    evidence_refs: [],
  };
}

describe('social import job review summaries', () => {
  test('reruns start acquisition summary from current pass instead of old blockers', () => {
    const previousReviewItems = [
      reviewItem(
        'needs_user_assisted_text',
        'Automatic caption acquisition is not implemented yet.',
      ),
      reviewItem(
        'insufficient_evidence',
        'No recipe or meal evidence was acquired beyond metadata or user hints.',
        'blocker',
      ),
    ];
    const acquisitionReviewItems = [
      reviewItem(
        'needs_user_assisted_text',
        'Automatic Instagram acquisition is not implemented.',
        'info',
      ),
    ];

    expect(
      currentAcquisitionReviewItems({
        previousReviewItems,
        acquisitionReviewItems,
        replaceEvidence: true,
      }).map((item) => item.code),
    ).toEqual(['needs_user_assisted_text']);
  });

  test('first-pass imports still include existing classification reviews', () => {
    const previousReviewItems = [
      reviewItem('unsupported_platform', 'This source is not supported.', 'blocker'),
    ];
    const acquisitionReviewItems = [
      reviewItem('needs_user_assisted_text', 'Add caption, transcript, or on-screen text.'),
    ];

    expect(
      currentAcquisitionReviewItems({
        previousReviewItems,
        acquisitionReviewItems,
        replaceEvidence: false,
      }).map((item) => item.code),
    ).toEqual(['unsupported_platform', 'needs_user_assisted_text']);
  });

  test('successful draft summaries use latest extraction reviews only', () => {
    const latestReviews = [
      reviewItem('missing_servings', 'Servings were not stated in the source evidence.'),
    ];

    expect(latestExtractionReviewItems(latestReviews).map((item) => item.code)).toEqual([
      'missing_servings',
    ]);
  });
});
