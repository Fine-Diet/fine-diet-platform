/**
 * YouTube URL Parsing and Embed URL Building
 * 
 * Handles parsing various YouTube URL formats and building embed URLs
 * for reliable iframe embedding.
 */

export interface YouTubeParseResult {
  videoId: string;
  startSeconds?: number;
}

/**
 * Parse YouTube URL or video ID to extract video ID and optional start time
 * 
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEOID
 * - https://youtu.be/VIDEOID
 * - https://www.youtube.com/embed/VIDEOID
 * - https://www.youtube.com/shorts/VIDEOID
 * - Just a video ID string
 * 
 * Time parameter formats:
 * - t=50s, t=50, t=1m20s (watch URLs)
 * - start=50 (embed URLs)
 * 
 * @param input - YouTube URL or video ID
 * @returns Parse result with videoId and optional startSeconds, or null if invalid
 */
export function parseYouTube(input: string): YouTubeParseResult | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  let videoId: string | null = null;
  let startSeconds: number | undefined = undefined;

  // Try to extract video ID from various URL formats
  // 1. Watch URL: https://www.youtube.com/watch?v=VIDEOID&t=50s
  const watchMatch = trimmed.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) {
    videoId = watchMatch[1];
    
    // Extract time parameter (t=50s, t=50, t=1m20s)
    const timeMatch = trimmed.match(/[?&]t=([^&]+)/);
    if (timeMatch) {
      startSeconds = parseTimeString(timeMatch[1]);
    }
  }

  // 2. Short URL: https://youtu.be/VIDEOID?t=50s
  if (!videoId) {
    const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) {
      videoId = shortMatch[1];
      
      // Extract time parameter
      const timeMatch = trimmed.match(/[?&]t=([^&]+)/);
      if (timeMatch) {
        startSeconds = parseTimeString(timeMatch[1]);
      }
    }
  }

  // 3. Embed URL: https://www.youtube.com/embed/VIDEOID?start=50
  if (!videoId) {
    const embedMatch = trimmed.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) {
      videoId = embedMatch[1];
      
      // Extract start parameter
      const startMatch = trimmed.match(/[?&]start=(\d+)/);
      if (startMatch) {
        startSeconds = parseInt(startMatch[1], 10);
      }
    }
  }

  // 4. Shorts URL: https://www.youtube.com/shorts/VIDEOID
  if (!videoId) {
    const shortsMatch = trimmed.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) {
      videoId = shortsMatch[1];
    }
  }

  // 5. Just a video ID (11 characters, alphanumeric + _ and -)
  if (!videoId) {
    const idOnlyMatch = trimmed.match(/^([a-zA-Z0-9_-]{11})$/);
    if (idOnlyMatch) {
      videoId = idOnlyMatch[1];
    }
  }

  if (!videoId) {
    return null;
  }

  return {
    videoId,
    startSeconds,
  };
}

/**
 * Parse time string to seconds
 * Supports formats:
 * - "50s" -> 50
 * - "50" -> 50
 * - "1m20s" -> 80
 * - "1h30m45s" -> 5445
 * 
 * @param timeStr - Time string to parse
 * @returns Number of seconds, or undefined if invalid
 */
function parseTimeString(timeStr: string): number | undefined {
  if (!timeStr) {
    return undefined;
  }

  // If it's just a number, treat as seconds
  const numericMatch = timeStr.match(/^(\d+)$/);
  if (numericMatch) {
    return parseInt(numericMatch[1], 10);
  }

  // Parse format like "1m20s" or "1h30m45s"
  let totalSeconds = 0;
  
  // Hours: 1h
  const hoursMatch = timeStr.match(/(\d+)h/);
  if (hoursMatch) {
    totalSeconds += parseInt(hoursMatch[1], 10) * 3600;
  }

  // Minutes: 1m
  const minutesMatch = timeStr.match(/(\d+)m/);
  if (minutesMatch) {
    totalSeconds += parseInt(minutesMatch[1], 10) * 60;
  }

  // Seconds: 20s
  const secondsMatch = timeStr.match(/(\d+)s/);
  if (secondsMatch) {
    totalSeconds += parseInt(secondsMatch[1], 10);
  }

  // If we found at least one component, return the total
  if (hoursMatch || minutesMatch || secondsMatch) {
    return totalSeconds;
  }

  return undefined;
}

/**
 * Build YouTube embed URL from video ID and optional start time
 * 
 * @param videoId - YouTube video ID (11 characters)
 * @param startSeconds - Optional start time in seconds
 * @returns Embed URL with autoplay=1&rel=0, and start parameter if provided
 */
export function buildYouTubeEmbedUrl(videoId: string, startSeconds?: number): string {
  if (!videoId || typeof videoId !== 'string') {
    throw new Error('videoId is required');
  }

  // Validate video ID format (11 characters, alphanumeric + _ and -)
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    throw new Error(`Invalid video ID format: ${videoId}`);
  }

  const baseUrl = `https://www.youtube.com/embed/${videoId}`;
  const params = new URLSearchParams();
  
  // Always add autoplay and disable related videos
  params.set('autoplay', '1');
  params.set('rel', '0');
  
  // Add start time if provided
  if (startSeconds !== undefined && startSeconds > 0) {
    params.set('start', startSeconds.toString());
  }

  return `${baseUrl}?${params.toString()}`;
}
