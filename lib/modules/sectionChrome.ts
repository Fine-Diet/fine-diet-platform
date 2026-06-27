/**
 * Module System v1 — Section chrome (safe, token-mapped wrapper controls)
 *
 * "Chrome" is the OPTIONAL, instance-level wrapper styling for a module inside a
 * page composition — independent of the module's own content. It lets an author
 * control the section shell (rounded top, vertical overlap, surface/background,
 * top/bottom borders + border tone, and optional text tone) WITHOUT the module
 * having to know about it, and WITHOUT ever storing raw Tailwind/class strings in
 * composition data.
 *
 * Safety contract (enforced here):
 *   - Composition data only ever stores ENUM/boolean values from the unions
 *     below. There is no free-text class field.
 *   - `resolveModuleChromeClasses` maps those enums to a FIXED allowlist of
 *     Tailwind classes. An unknown/old value maps to the empty string (ignored),
 *     so a malformed/forward-compat record can never inject arbitrary CSS.
 *
 * Backward compatibility:
 *   - `chrome` is optional on every module instance. When absent, ModuleRenderer
 *     preserves its existing behavior exactly (flat = plain sibling; stacked =
 *     order-derived rounded top / overlap / z-index). Existing compositions are
 *     unchanged.
 */

import { z } from 'zod';

// ── Allowlisted enums ─────────────────────────────────────────────────────────

/** Wrapper background/surface tokens. `none` = transparent (no bg class). */
export const MODULE_CHROME_SURFACES = [
  'none',
  'brand-50',
  'brand-100',
  'brand-900',
  'neutral-0',
  'neutral-900',
  'white',
] as const;
export type ModuleChromeSurface = (typeof MODULE_CHROME_SURFACES)[number];

/** Border color tone, applied to whichever of top/bottom borders are enabled. */
export const MODULE_CHROME_BORDER_TONES = ['subtle', 'strong', 'light'] as const;
export type ModuleChromeBorderTone = (typeof MODULE_CHROME_BORDER_TONES)[number];

/** Optional text tone override for the wrapped section. `inherit` = no override. */
export const MODULE_CHROME_TEXT_TONES = ['inherit', 'dark', 'light'] as const;
export type ModuleChromeTextTone = (typeof MODULE_CHROME_TEXT_TONES)[number];

export interface ModuleChrome {
  /** Round the top corners of the section (rounded-t-[2rem] + overflow-hidden). */
  roundedTop?: boolean;
  /** Pull the section up to overlap the previous layer (negative top margin). */
  overlap?: boolean;
  /** Wrapper background/surface. Defaults to 'none' (transparent). */
  surface?: ModuleChromeSurface;
  /** Draw a top border. */
  topBorder?: boolean;
  /** Draw a bottom border. */
  bottomBorder?: boolean;
  /** Border color tone for enabled borders. Defaults to 'subtle'. */
  borderTone?: ModuleChromeBorderTone;
  /** Optional text color override. Defaults to 'inherit'. */
  textTone?: ModuleChromeTextTone;
}

// ── Token maps (the ONLY place chrome values become CSS classes) ───────────────

const OVERLAP_CLASS = '-mt-8';
const ROUNDED_TOP_CLASS = 'rounded-t-[2rem]';

const SURFACE_CLASS: Record<ModuleChromeSurface, string> = {
  none: '',
  'brand-50': 'bg-brand-50',
  'brand-100': 'bg-brand-100',
  'brand-900': 'bg-brand-900',
  'neutral-0': 'bg-neutral-0',
  'neutral-900': 'bg-neutral-900',
  white: 'bg-white',
};

const BORDER_TONE_CLASS: Record<ModuleChromeBorderTone, string> = {
  subtle: 'border-brand-900/20',
  strong: 'border-brand-900/40',
  light: 'border-white/40',
};

const TEXT_TONE_CLASS: Record<ModuleChromeTextTone, string> = {
  inherit: '',
  dark: 'text-brand-900',
  light: 'text-white',
};

// ── Zod schema (validates stored chrome; strips unknown keys) ──────────────────

export const moduleChromeSchema = z
  .object({
    roundedTop: z.boolean().optional(),
    overlap: z.boolean().optional(),
    surface: z.enum(MODULE_CHROME_SURFACES).optional(),
    topBorder: z.boolean().optional(),
    bottomBorder: z.boolean().optional(),
    borderTone: z.enum(MODULE_CHROME_BORDER_TONES).optional(),
    textTone: z.enum(MODULE_CHROME_TEXT_TONES).optional(),
  })
  .strict();

// ── Resolver ───────────────────────────────────────────────────────────────────

/**
 * Map a ModuleChrome record to a SAFE, allowlisted Tailwind class string.
 *
 * Every output token comes from a fixed map above — there is no path for raw
 * composition strings to reach the DOM. Unknown enum values map to '' (ignored).
 *
 * @param chrome  The instance chrome record.
 * @param opts.zClass  Optional pre-computed z-index token (stacked layout only).
 *                     ModuleRenderer supplies a safe `z-*` token; chrome data
 *                     never carries a z value itself.
 */
export function resolveModuleChromeClasses(
  chrome: ModuleChrome,
  opts: { zClass?: string } = {},
): string {
  const parts: string[] = ['relative'];

  if (chrome.overlap) parts.push(OVERLAP_CLASS);
  if (chrome.roundedTop) parts.push(ROUNDED_TOP_CLASS, 'overflow-hidden');

  const surface = SURFACE_CLASS[chrome.surface ?? 'none'] ?? '';
  if (surface) parts.push(surface);

  const tone = BORDER_TONE_CLASS[chrome.borderTone ?? 'subtle'] ?? '';
  if (chrome.topBorder) parts.push('border-t');
  if (chrome.bottomBorder) parts.push('border-b');
  if ((chrome.topBorder || chrome.bottomBorder) && tone) parts.push(tone);

  const text = TEXT_TONE_CLASS[chrome.textTone ?? 'inherit'] ?? '';
  if (text) parts.push(text);

  if (opts.zClass) parts.push(opts.zClass);

  return parts.join(' ');
}

/** True when a chrome record requests any visible effect (used to skip wrapping). */
export function hasChromeEffect(chrome: ModuleChrome | undefined): chrome is ModuleChrome {
  if (!chrome) return false;
  return Boolean(
    chrome.roundedTop ||
      chrome.overlap ||
      chrome.topBorder ||
      chrome.bottomBorder ||
      (chrome.surface && chrome.surface !== 'none') ||
      (chrome.textTone && chrome.textTone !== 'inherit'),
  );
}
