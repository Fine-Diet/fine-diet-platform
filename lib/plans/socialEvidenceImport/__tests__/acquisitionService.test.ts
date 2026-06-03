import { afterEach, describe, expect, jest, test } from '@jest/globals';

// Avoid loading the on-screen text and video transcript chains (which pull in
// the Supabase server client and provider config) during this acquisition-layer
// unit test. The Instagram caption path does not invoke either of them.
jest.mock('@/lib/plans/onscreenText/onscreenTextService', () => ({
  acquireOnscreenText: jest.fn(async () => ({ status: 'unavailable', text: null })),
}));
jest.mock('@/lib/plans/videoTranscript/videoTranscriptService', () => ({
  acquireVideoTranscript: jest.fn(async () => ({ status: 'unavailable', transcript: null })),
  classifyVideoUrl: jest.fn(() => ({ platform: 'instagram', video_id: null })),
}));
jest.mock('@/lib/plans/videoTranscript/adapters/youtubeAdapter', () => ({
  fetchYouTubePublicPageMetadata: jest.fn(async () => ({
    title: null,
    description: null,
    error: null,
  })),
}));

import { acquireSocialEvidence } from '../acquisitionService';
import type { SocialImportCreateInput } from '../types';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

const PERSON_ID = '00000000-0000-4000-8000-000000000099';
const INSTAGRAM_URL = 'https://www.instagram.com/reel/ABC123/';

/** Generic Instagram shell HTML that exposes no usable caption metadata. */
const GENERIC_INSTAGRAM_SHELL =
  '<html><head><title>Instagram</title></head><body></body></html>';

function mockHtmlResponse(html: string, status = 200): void {
  global.fetch = jest.fn(async () =>
    new Response(html, {
      status,
      headers: { 'Content-Type': 'text/html' },
    }),
  ) as typeof fetch;
}

async function acquireInstagram(
  input: Partial<SocialImportCreateInput> = {},
): Promise<Awaited<ReturnType<typeof acquireSocialEvidence>>> {
  return acquireSocialEvidence({
    personId: PERSON_ID,
    platform: 'instagram',
    url: INSTAGRAM_URL,
    input: { url: INSTAGRAM_URL, ...input },
  });
}

describe('acquireSocialEvidence — Instagram caption scenario', () => {
  test('Instagram URL with no metadata caption and no assisted text blocks on missing evidence', async () => {
    mockHtmlResponse(GENERIC_INSTAGRAM_SHELL);

    const { sources, review_items } = await acquireInstagram();

    // Records the metadata acquisition attempt but recovers no usable caption.
    const metadataAttempt = sources.find(
      (s) =>
        s.source_kind === 'metadata' &&
        s.metadata_json?.acquisition_method === 'instagram_public_page_metadata',
    );
    expect(metadataAttempt).toBeDefined();
    expect(metadataAttempt?.quality).toBe('unavailable');

    // Does not create trusted caption evidence from metadata alone.
    expect(sources.some((s) => s.source_kind === 'creator_caption')).toBe(false);

    const codes = review_items.map((item) => item.code);
    expect(codes).toContain('needs_user_assisted_text');
    expect(codes).toContain('insufficient_evidence');

    const captionWarning = review_items.find(
      (item) => item.code === 'needs_user_assisted_text',
    );
    expect(captionWarning?.message).toMatch(/Instagram did not expose caption text/i);
  });

  test('Instagram URL with pasted caption records strong assisted evidence and no blocker', async () => {
    mockHtmlResponse(GENERIC_INSTAGRAM_SHELL);

    const caption =
      'Lemon chickpea salad: combine chickpeas, lemon juice, olive oil, ' +
      'cucumber, and herbs. Toss together and serve chilled.';

    const { sources, review_items } = await acquireInstagram({
      assisted_text: caption,
    });

    const assisted = sources.find((s) => s.source_kind === 'user_assisted_text');
    expect(assisted).toBeDefined();
    expect(assisted?.quality).toBe('strong');
    expect(assisted?.normalized_text).toContain('chickpeas');

    const codes = review_items.map((item) => item.code);
    // Automatic metadata still failed, but pasted caption satisfies evidence,
    // so the Instagram caption warning and the insufficient-evidence blocker
    // are not raised solely because automatic acquisition failed.
    expect(codes).not.toContain('needs_user_assisted_text');
    expect(codes).not.toContain('insufficient_evidence');
  });

  test('short assisted caption is recorded as weak evidence', async () => {
    mockHtmlResponse(GENERIC_INSTAGRAM_SHELL);

    const { sources } = await acquireInstagram({ assisted_text: 'pasta' });

    const assisted = sources.find((s) => s.source_kind === 'user_assisted_text');
    expect(assisted?.quality).toBe('weak');
  });

  test('un-normalizable Instagram URL still routes the user to paste the caption', async () => {
    mockHtmlResponse(GENERIC_INSTAGRAM_SHELL);

    const { review_items } = await acquireSocialEvidence({
      personId: PERSON_ID,
      platform: 'instagram',
      url: 'not a url',
      input: { url: 'not a url' },
    });

    const captionWarning = review_items.find(
      (item) => item.code === 'needs_user_assisted_text',
    );
    expect(captionWarning?.message).toMatch(/could not be normalized/i);
  });
});
