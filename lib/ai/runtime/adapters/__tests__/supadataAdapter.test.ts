import { supadataAdapter } from '../supadataAdapter';

describe('supadataAdapter', () => {
  const originalApiKey = process.env.SUPADATA_API_KEY;

  afterEach(() => {
    if (typeof originalApiKey === 'undefined') {
      delete process.env.SUPADATA_API_KEY;
    } else {
      process.env.SUPADATA_API_KEY = originalApiKey;
    }
    jest.restoreAllMocks();
  });

  it('records a clear missing-key decline for video transcript requests', async () => {
    delete process.env.SUPADATA_API_KEY;
    const fetchSpy = jest.spyOn(global, 'fetch');

    const result = await supadataAdapter.execute({
      taskType: 'video_transcript_external',
      modelKey: 'default',
      input: {
        video_url: 'https://www.youtube.com/watch?v=abc12345678',
        video_id: 'abc12345678',
        platform: 'youtube',
        lang: 'en',
      },
      personId: 'person-1',
      planId: null,
    });

    expect(result.handled).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.output).toMatchObject({
      kind: 'ai',
      value: {
        transcript: null,
        language: null,
        available_languages: [],
        provider_unavailable: true,
        provider_error: 'SUPADATA_API_KEY is not configured in this runtime.',
      },
      _meta: {
        provider: 'supadata',
        video_url: 'https://www.youtube.com/watch?v=abc12345678',
        video_id: 'abc12345678',
        platform: 'youtube',
        http_status: null,
        latency_ms: 0,
      },
    });
  });

  it('does not handle malformed transcript requests', async () => {
    delete process.env.SUPADATA_API_KEY;

    const result = await supadataAdapter.execute({
      taskType: 'video_transcript_external',
      modelKey: 'default',
      input: {
        video_url: '',
      },
      personId: 'person-1',
      planId: null,
    });

    expect(result).toEqual({ handled: false });
  });
});
