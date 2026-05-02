import type {
  SocialImportContentType,
  SocialImportPlatform,
  SocialImportReviewItem,
} from './types';

const SUPPORTED = new Set<SocialImportPlatform>([
  'youtube',
  'tiktok',
  'instagram',
  'facebook',
]);

function isHostOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export interface SocialUrlClassification {
  platform: SocialImportPlatform;
  supported: boolean;
  canonical_url: string | null;
  review_items: SocialImportReviewItem[];
}

export function classifySocialUrl(rawUrl: string | null | undefined): SocialUrlClassification {
  const review_items: SocialImportReviewItem[] = [];
  if (!rawUrl || rawUrl.trim().length === 0) {
    return {
      platform: 'unknown',
      supported: true,
      canonical_url: null,
      review_items,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return {
      platform: 'unknown',
      supported: false,
      canonical_url: null,
      review_items: [
        {
          code: 'unsupported_platform',
          severity: 'blocker',
          message: 'The URL could not be parsed as a supported social source.',
          evidence_refs: [],
        },
      ],
    };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  let platform: SocialImportPlatform = 'unknown';
  if (host === 'youtu.be' || isHostOrSubdomain(host, 'youtube.com')) platform = 'youtube';
  else if (isHostOrSubdomain(host, 'tiktok.com')) platform = 'tiktok';
  else if (isHostOrSubdomain(host, 'instagram.com')) platform = 'instagram';
  else if (host === 'fb.watch' || isHostOrSubdomain(host, 'facebook.com')) {
    platform = 'facebook';
  } else if (isHostOrSubdomain(host, 'threads.net')) platform = 'threads';
  else if (host === 'x.com' || isHostOrSubdomain(host, 'twitter.com')) platform = 'x';

  const supported = SUPPORTED.has(platform);
  if (!supported) {
    review_items.push({
      code: 'unsupported_platform',
      severity: 'blocker',
      message:
        platform === 'threads' || platform === 'x'
          ? 'This platform is planned for later support. Add user-assisted recipe evidence to continue.'
          : 'This source is not supported by the social evidence importer.',
      evidence_refs: [],
    });
  }

  return {
    platform,
    supported,
    canonical_url: parsed.toString(),
    review_items,
  };
}

export function classifyContentFromText(text: string): SocialImportContentType {
  const lower = text.toLowerCase();
  if (lower.trim().length < 20) return 'unknown_or_insufficient';
  if (/\b(grocery haul|trader joe'?s haul|costco haul|whole foods haul)\b/.test(lower)) {
    return 'grocery_haul';
  }
  if (/\b(restaurant|menu|ordered|takeout|take out|eat out|drive[- ]?thru)\b/.test(lower)) {
    return 'restaurant_or_menu';
  }
  if (/\b(supplement|protein powder|collagen|greens powder|pre[- ]?workout)\b/.test(lower)) {
    return 'supplement_or_product';
  }
  if (/\b(what i eat in a day|full day of eating|day of eating)\b/.test(lower)) {
    return 'what_i_eat_in_a_day';
  }
  if (/\b(weekly meal plan|meal plan for the week|this week'?s meals)\b/.test(lower)) {
    return 'meal_plan';
  }
  if (/\b(meal prep|prep these meals|lunches for the week|dinners for the week)\b/.test(lower)) {
    return 'multi_recipe';
  }
  if (
    /\b(recipe|ingredients?|instructions?|directions?|cook|bake|roast|saute|sauté|mix|combine)\b/.test(
      lower,
    )
  ) {
    return 'single_recipe';
  }
  return 'unknown_or_insufficient';
}

export function socialSourceTypeForImport(platform: SocialImportPlatform): string {
  return platform === 'unknown' ? 'social' : `social_${platform}`;
}
