import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { runAITask } from '@/lib/ai/runtime/aiRuntimeServerService';
import type { AIRunOutcome, AIResolvedRoute } from '@/lib/ai/runtime/types';
import {
  hasDraftableNarrativeEvidence,
  runSocialEvidenceExtraction,
} from '../extractionService';
import type {
  SocialEvidenceQuality,
  SocialEvidenceSourceKind,
  SocialImportEvidenceSource,
  SocialImportExtractionPayload,
  SocialImportReviewItem,
} from '../types';
import { SOCIAL_IMPORT_VERSION } from '../types';

jest.mock('@/lib/ai/runtime/aiRuntimeServerService', () => ({
  runAITask: jest.fn(),
}));

const runAITaskMock = jest.mocked(runAITask);

const openAiRoute: AIResolvedRoute = {
  task_type: 'social_video_recipe_extract',
  provider_key: 'openai',
  model_key: 'gpt-test',
  model_config: null,
  tier: null,
  source: 'preferred',
  deterministic_fallback_available: true,
};

const deterministicRoute: AIResolvedRoute = {
  task_type: 'social_video_recipe_extract',
  provider_key: 'deterministic',
  model_key: null,
  model_config: null,
  tier: null,
  source: 'deterministic_only',
  deterministic_fallback_available: true,
};

function evidenceSource(
  overrides: Partial<SocialImportEvidenceSource> & {
    id: string;
    source_kind: SocialEvidenceSourceKind;
    quality: SocialEvidenceQuality;
  },
): SocialImportEvidenceSource {
  return {
    job_id: '00000000-0000-4000-8000-000000000010',
    person_id: '00000000-0000-4000-8000-000000000011',
    source_label: null,
    platform: 'instagram',
    raw_text: null,
    normalized_text: null,
    language: null,
    metadata_json: {},
    created_at: '2026-05-02T00:00:00.000Z',
    ...overrides,
  };
}

const missingEvidenceReviews: SocialImportReviewItem[] = [
  {
    code: 'needs_user_assisted_text',
    severity: 'warning',
    message:
      'Automatic caption acquisition is not implemented for Instagram or Facebook yet. Add user-assisted caption, transcript, or on-screen text.',
    evidence_refs: [],
  },
  {
    code: 'insufficient_evidence',
    severity: 'blocker',
    message:
      'No recipe or meal evidence was acquired beyond metadata or user hints. Add caption, transcript, or on-screen text.',
    evidence_refs: [],
  },
];

function emptyExtractionPayload(
  reviewItems: SocialImportReviewItem[] = [],
): SocialImportExtractionPayload {
  return {
    version: SOCIAL_IMPORT_VERSION,
    content_type: 'unknown_or_insufficient',
    title: {
      value: null,
      confidence: 'low',
      evidence_refs: [],
    },
    summary: null,
    recipes: [],
    meal_plan_items: [],
    review_items: reviewItems,
    warnings: [],
  };
}

describe('hasDraftableNarrativeEvidence', () => {
  test('excludes metadata, user hints, unavailable, weak, and partial sources', () => {
    expect(
      hasDraftableNarrativeEvidence([
        evidenceSource({
          id: '00000000-0000-4000-8000-000000000001',
          source_kind: 'metadata',
          quality: 'partial',
          normalized_text: 'https://www.instagram.com/reel/example',
        }),
        evidenceSource({
          id: '00000000-0000-4000-8000-000000000002',
          source_kind: 'user_hint',
          quality: 'partial',
          normalized_text: 'this was pasta',
        }),
        evidenceSource({
          id: '00000000-0000-4000-8000-000000000003',
          source_kind: 'creator_caption',
          quality: 'weak',
          normalized_text: 'pasta',
        }),
        evidenceSource({
          id: '00000000-0000-4000-8000-000000000004',
          source_kind: 'creator_caption',
          quality: 'partial',
          normalized_text: 'short title only',
        }),
        evidenceSource({
          id: '00000000-0000-4000-8000-000000000005',
          source_kind: 'transcript',
          quality: 'unavailable',
          normalized_text: null,
        }),
      ]),
    ).toBe(false);
  });

  test('allows strong narrative caption, transcript, assisted, or on-screen text', () => {
    expect(
      hasDraftableNarrativeEvidence([
        evidenceSource({
          id: '00000000-0000-4000-8000-000000000006',
          source_kind: 'creator_caption',
          quality: 'strong',
          normalized_text: 'Blend bananas, yogurt, oats, and cinnamon until smooth.',
        }),
      ]),
    ).toBe(true);
  });
});

describe('runSocialEvidenceExtraction', () => {
  beforeEach(() => {
    runAITaskMock.mockReset();
  });

  test('skips AI extraction when no draftable narrative evidence exists', async () => {
    const result = await runSocialEvidenceExtraction({
      ctx: { personId: '00000000-0000-4000-8000-000000000011' },
      platform: 'instagram',
      sourceUrl: 'https://www.instagram.com/reel/example',
      evidenceSources: [
        evidenceSource({
          id: '00000000-0000-4000-8000-000000000007',
          source_kind: 'metadata',
          quality: 'partial',
          normalized_text: 'https://www.instagram.com/reel/example',
        }),
      ],
      preexistingReviewItems: missingEvidenceReviews,
    });

    expect(runAITaskMock).not.toHaveBeenCalled();
    expect(result.provider).toBe('not_run');
    expect(result.model).toBeNull();
    expect(result.fallback_used).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.payload.warnings).toEqual([]);
    expect(result.payload.review_items.map((item) => item.code)).toEqual([
      'needs_user_assisted_text',
      'insufficient_evidence',
    ]);
  });

  test('keeps weak TikTok captions in clean manual-review state', async () => {
    const result = await runSocialEvidenceExtraction({
      ctx: { personId: '00000000-0000-4000-8000-000000000011' },
      platform: 'tiktok',
      sourceUrl: 'https://www.tiktok.com/@chef/video/123',
      evidenceSources: [
        evidenceSource({
          id: '00000000-0000-4000-8000-000000000009',
          source_kind: 'creator_caption',
          platform: 'tiktok',
          quality: 'weak',
          normalized_text: 'pasta',
        }),
      ],
      preexistingReviewItems: missingEvidenceReviews,
    });

    expect(runAITaskMock).not.toHaveBeenCalled();
    expect(result.payload.review_items.map((item) => item.code)).toEqual([
      'needs_user_assisted_text',
      'insufficient_evidence',
    ]);
    expect(result.payload.recipes).toEqual([]);
  });

  test('preserves validation failure reporting when useful evidence exists', async () => {
    runAITaskMock.mockResolvedValueOnce({
      output: { kind: 'ai' as const, value: { malformed: true } },
      route: openAiRoute,
      latency_ms: 10,
      fallback_used: false,
      errors: [],
    } satisfies AIRunOutcome<unknown>);

    const result = await runSocialEvidenceExtraction({
      ctx: { personId: '00000000-0000-4000-8000-000000000011' },
      platform: 'tiktok',
      sourceUrl: 'https://www.tiktok.com/@chef/video/123',
      evidenceSources: [
        evidenceSource({
          id: '00000000-0000-4000-8000-000000000008',
          source_kind: 'creator_caption',
          platform: 'tiktok',
          quality: 'strong',
          normalized_text:
            'Tomato pasta: simmer tomatoes with garlic, add cooked pasta, finish with basil.',
        }),
      ],
      preexistingReviewItems: [],
    });

    expect(runAITaskMock).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe('openai');
    expect(result.fallback_used).toBe(true);
    expect(result.payload.review_items.map((item) => item.code)).toContain(
      'extraction_validation_failed',
    );
  });

  test('preserves operational failure reporting when useful evidence exists', async () => {
    const timedOutFallback = {
      output: {
        kind: 'deterministic' as const,
        value: emptyExtractionPayload(),
      },
      route: deterministicRoute,
      latency_ms: 10,
      fallback_used: true,
      errors: ['preferred(openai/gpt-test):Request timed out'],
    } satisfies AIRunOutcome<unknown>;
    runAITaskMock
      .mockResolvedValueOnce(timedOutFallback)
      .mockResolvedValueOnce(timedOutFallback);

    const result = await runSocialEvidenceExtraction({
      ctx: { personId: '00000000-0000-4000-8000-000000000011' },
      platform: 'youtube',
      sourceUrl: 'https://www.youtube.com/watch?v=abc123',
      evidenceSources: [
        evidenceSource({
          id: '00000000-0000-4000-8000-000000000012',
          source_kind: 'transcript',
          platform: 'youtube',
          quality: 'strong',
          normalized_text:
            'Add oats, yogurt, milk, and berries to a jar. Chill overnight and serve cold.',
        }),
      ],
      preexistingReviewItems: [],
    });

    expect(runAITaskMock).toHaveBeenCalledTimes(2);
    expect(result.payload.review_items.map((item) => item.code)).toContain(
      'provider_timeout',
    );
  });
});
