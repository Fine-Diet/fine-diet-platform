/**
 * Tests for YouTube URL parsing and embed URL building
 */

import { parseYouTube, buildYouTubeEmbedUrl } from '../youtube';

describe('parseYouTube', () => {
  describe('Watch URL formats', () => {
    it('should parse standard watch URL', () => {
      const result = parseYouTube('https://www.youtube.com/watch?v=ig61sqn2lyM');
      expect(result).toEqual({
        videoId: 'ig61sqn2lyM',
        startSeconds: undefined,
      });
    });

    it('should parse watch URL with time parameter (t=50s)', () => {
      const result = parseYouTube('https://www.youtube.com/watch?v=ig61sqn2lyM&t=50s');
      expect(result).toEqual({
        videoId: 'ig61sqn2lyM',
        startSeconds: 50,
      });
    });

    it('should parse watch URL with time parameter (t=50)', () => {
      const result = parseYouTube('https://www.youtube.com/watch?v=ig61sqn2lyM&t=50');
      expect(result).toEqual({
        videoId: 'ig61sqn2lyM',
        startSeconds: 50,
      });
    });

    it('should parse watch URL with time parameter (t=1m20s)', () => {
      const result = parseYouTube('https://www.youtube.com/watch?v=ig61sqn2lyM&t=1m20s');
      expect(result).toEqual({
        videoId: 'ig61sqn2lyM',
        startSeconds: 80, // 1 minute + 20 seconds
      });
    });

    it('should parse watch URL with time parameter (t=1h30m45s)', () => {
      const result = parseYouTube('https://www.youtube.com/watch?v=ig61sqn2lyM&t=1h30m45s');
      expect(result).toEqual({
        videoId: 'ig61sqn2lyM',
        startSeconds: 5445, // 1 hour + 30 minutes + 45 seconds
      });
    });

    it('should parse watch URL with multiple parameters', () => {
      const result = parseYouTube('https://www.youtube.com/watch?v=ig61sqn2lyM&t=50s&list=PLxxx');
      expect(result).toEqual({
        videoId: 'ig61sqn2lyM',
        startSeconds: 50,
      });
    });
  });

  describe('youtu.be short URL formats', () => {
    it('should parse youtu.be URL', () => {
      const result = parseYouTube('https://youtu.be/ig61sqn2lyM');
      expect(result).toEqual({
        videoId: 'ig61sqn2lyM',
        startSeconds: undefined,
      });
    });

    it('should parse youtu.be URL with time parameter', () => {
      const result = parseYouTube('https://youtu.be/ig61sqn2lyM?t=50s');
      expect(result).toEqual({
        videoId: 'ig61sqn2lyM',
        startSeconds: 50,
      });
    });

    it('should parse youtu.be URL with time parameter (1m20s)', () => {
      const result = parseYouTube('https://youtu.be/ig61sqn2lyM?t=1m20s');
      expect(result).toEqual({
        videoId: 'ig61sqn2lyM',
        startSeconds: 80,
      });
    });
  });

  describe('Embed URL formats', () => {
    it('should parse embed URL', () => {
      const result = parseYouTube('https://www.youtube.com/embed/ig61sqn2lyM');
      expect(result).toEqual({
        videoId: 'ig61sqn2lyM',
        startSeconds: undefined,
      });
    });

    it('should parse embed URL with start parameter', () => {
      const result = parseYouTube('https://www.youtube.com/embed/ig61sqn2lyM?start=50');
      expect(result).toEqual({
        videoId: 'ig61sqn2lyM',
        startSeconds: 50,
      });
    });

    it('should parse embed URL with multiple parameters', () => {
      const result = parseYouTube('https://www.youtube.com/embed/ig61sqn2lyM?start=50&autoplay=1');
      expect(result).toEqual({
        videoId: 'ig61sqn2lyM',
        startSeconds: 50,
      });
    });
  });

  describe('Shorts URL formats', () => {
    it('should parse shorts URL', () => {
      const result = parseYouTube('https://www.youtube.com/shorts/ig61sqn2lyM');
      expect(result).toEqual({
        videoId: 'ig61sqn2lyM',
        startSeconds: undefined,
      });
    });
  });

  describe('Video ID only', () => {
    it('should parse video ID only', () => {
      const result = parseYouTube('ig61sqn2lyM');
      expect(result).toEqual({
        videoId: 'ig61sqn2lyM',
        startSeconds: undefined,
      });
    });

    it('should parse video ID with underscores and hyphens', () => {
      const result = parseYouTube('ig61sqn2l-M');
      expect(result).toEqual({
        videoId: 'ig61sqn2l-M',
        startSeconds: undefined,
      });
    });
  });

  describe('Edge cases', () => {
    it('should return null for invalid input', () => {
      expect(parseYouTube('')).toBeNull();
      expect(parseYouTube('   ')).toBeNull();
      expect(parseYouTube('not-a-url')).toBeNull();
      expect(parseYouTube('https://example.com/video')).toBeNull();
    });

    it('should return null for null/undefined input', () => {
      expect(parseYouTube(null as any)).toBeNull();
      expect(parseYouTube(undefined as any)).toBeNull();
    });

    it('should handle video IDs that are too short', () => {
      expect(parseYouTube('short')).toBeNull();
    });

    it('should handle video IDs that are too long', () => {
      expect(parseYouTube('ig61sqn2lyMx')).toBeNull();
    });
  });

  describe('Time parsing edge cases', () => {
    it('should handle minutes only', () => {
      const result = parseYouTube('https://www.youtube.com/watch?v=ig61sqn2lyM&t=5m');
      expect(result).toEqual({
        videoId: 'ig61sqn2lyM',
        startSeconds: 300, // 5 minutes
      });
    });

    it('should handle hours only', () => {
      const result = parseYouTube('https://www.youtube.com/watch?v=ig61sqn2lyM&t=2h');
      expect(result).toEqual({
        videoId: 'ig61sqn2lyM',
        startSeconds: 7200, // 2 hours
      });
    });

    it('should handle seconds only with s suffix', () => {
      const result = parseYouTube('https://www.youtube.com/watch?v=ig61sqn2lyM&t=120s');
      expect(result).toEqual({
        videoId: 'ig61sqn2lyM',
        startSeconds: 120,
      });
    });
  });
});

describe('buildYouTubeEmbedUrl', () => {
  it('should build embed URL without start time', () => {
    const url = buildYouTubeEmbedUrl('ig61sqn2lyM');
    expect(url).toBe('https://www.youtube.com/embed/ig61sqn2lyM?autoplay=1&rel=0');
  });

  it('should build embed URL with start time', () => {
    const url = buildYouTubeEmbedUrl('ig61sqn2lyM', 50);
    expect(url).toBe('https://www.youtube.com/embed/ig61sqn2lyM?autoplay=1&rel=0&start=50');
  });

  it('should build embed URL with zero start time (should not include start)', () => {
    const url = buildYouTubeEmbedUrl('ig61sqn2lyM', 0);
    expect(url).toBe('https://www.youtube.com/embed/ig61sqn2lyM?autoplay=1&rel=0');
  });

  it('should throw error for invalid video ID', () => {
    expect(() => buildYouTubeEmbedUrl('invalid')).toThrow('Invalid video ID format');
    expect(() => buildYouTubeEmbedUrl('')).toThrow('videoId is required');
    expect(() => buildYouTubeEmbedUrl(null as any)).toThrow('videoId is required');
  });

  it('should handle video IDs with underscores and hyphens', () => {
    const url = buildYouTubeEmbedUrl('ig61sqn2l-M');
    expect(url).toBe('https://www.youtube.com/embed/ig61sqn2l-M?autoplay=1&rel=0');
  });
});

describe('Integration: parseYouTube + buildYouTubeEmbedUrl', () => {
  it('should parse watch URL and build embed URL with time', () => {
    const parsed = parseYouTube('https://www.youtube.com/watch?v=ig61sqn2lyM&t=50s');
    expect(parsed).not.toBeNull();
    if (parsed) {
      const embedUrl = buildYouTubeEmbedUrl(parsed.videoId, parsed.startSeconds);
      expect(embedUrl).toBe('https://www.youtube.com/embed/ig61sqn2lyM?autoplay=1&rel=0&start=50');
    }
  });

  it('should parse youtu.be URL and build embed URL', () => {
    const parsed = parseYouTube('https://youtu.be/ig61sqn2lyM?t=1m20s');
    expect(parsed).not.toBeNull();
    if (parsed) {
      const embedUrl = buildYouTubeEmbedUrl(parsed.videoId, parsed.startSeconds);
      expect(embedUrl).toBe('https://www.youtube.com/embed/ig61sqn2lyM?autoplay=1&rel=0&start=80');
    }
  });

  it('should parse video ID only and build embed URL', () => {
    const parsed = parseYouTube('ig61sqn2lyM');
    expect(parsed).not.toBeNull();
    if (parsed) {
      const embedUrl = buildYouTubeEmbedUrl(parsed.videoId, parsed.startSeconds);
      expect(embedUrl).toBe('https://www.youtube.com/embed/ig61sqn2lyM?autoplay=1&rel=0');
    }
  });
});
