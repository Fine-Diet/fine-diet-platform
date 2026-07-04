/**
 * ConversionBandShell — shared presentation shell for the banded conversion
 * modules (`access.code-gate.v1`, `lead.waitlist-capture.v1`).
 *
 * Owns ONLY the visual band: a full-width section with an optional anchor id,
 * a background tone, an optional top repeating rail, and a centered content
 * container. It does NOT touch any submission, verification, claim/grant,
 * billing, or offer-truth behavior — that stays in each module.
 *
 * Backward compatibility: every prop is optional. A module that renders inside
 * the shell with no rail / no anchor renders as a plain full-width band, which
 * is a strict superset of the legacy single-section layout.
 */

import type { ReactNode } from 'react';

export type ConversionBackgroundTone = 'cream' | 'blue' | 'default';

const BG_CLASSES: Record<ConversionBackgroundTone, string> = {
  cream: 'bg-brand-50',
  blue: 'bg-denim-900',
  default: 'bg-brand-50',
};

export interface ConversionBandShellProps {
  /**
   * Stable anchor id rendered as `<section id="...">` so page CTAs / nav can
   * jump to the band (e.g. `#waitlist`, `#access-code`). Sanitized to a safe
   * HTML id slug; empty/whitespace-only values render no id (preserving the
   * legacy no-anchor behavior).
   */
  anchorId?: string | null;
  backgroundTone?: ConversionBackgroundTone;
  /**
   * Repeated rail label shown in the top marquee. The rail renders only when
   * `railEnabled` is true AND `railText` is non-empty.
   */
  railText?: string | null;
  railEnabled?: boolean;
  /** Tailwind max-width class for the centered content container. */
  contentMaxWidth?: string;
  children: ReactNode;
}

/** Reduce an arbitrary editor string to a safe HTML id slug. */
function sanitizeAnchorId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const DEFAULT_CONTENT_MAX_WIDTH = 'max-w-2xl';

export function ConversionBandShell({
  anchorId,
  backgroundTone = 'default',
  railText,
  railEnabled = true,
  contentMaxWidth = DEFAULT_CONTENT_MAX_WIDTH,
  children,
}: ConversionBandShellProps) {
  const id = anchorId ? sanitizeAnchorId(String(anchorId)) : undefined;
  const bgClass = BG_CLASSES[backgroundTone] ?? BG_CLASSES.default;
  const showRail = railEnabled && Boolean(railText && railText.trim());

  return (
    <section
      id={id}
      className={`w-full border-t border-t-brand-900/10 border-b-8 border-b-brand-900 ${bgClass}`}
    >
      {showRail && <ConversionRail text={String(railText).trim()} />}
      <div className={`mx-auto w-full ${contentMaxWidth} px-6 py-16 sm:py-20`}>{children}</div>
    </section>
  );
}

/**
 * Top repeating rail. Purely visual marquee. Marked `aria-hidden` because the
 * label is duplicated in the section heading — it is decorative framing, not
 * primary text.
 *
 * Implementation notes:
 * The project's shared `.animate-marquee-left` utility in styles/globals.css
 * defines no `animation-duration`, so it defaults to 0s and produces no visible
 * motion. To avoid depending on that utility being correctly configured, the
 * rail ships its own keyframes (via a local <style> block), its own duration,
 * and its own reduced-motion override. The seamless-loop pattern is two
 * IDENTICAL flex tracks side by side inside one animated container that
 * translates from 0 → -50% (exactly one track width), so the second track
 * rolls in as the first rolls out with no visible seam.
 */
function ConversionRail({ text }: { text: string }) {
  const separator = '\u00A0\u00A0\u00A0\u00B7\u00A0\u00A0\u00A0';
  const displayText = `${text}${separator}`;
  const repeatsPerTrack = 8;

  // Steady ~45px/s scroll. Estimate width from char count so short and long
  // labels move at a similar perceptual speed.
  const approxTrackPx = displayText.length * 9 * repeatsPerTrack;
  const duration = Math.max(18, Math.round(approxTrackPx / 45));

  const track = (
    <div className="flex shrink-0">
      {Array.from({ length: repeatsPerTrack }).map((_, i) => (
        <span
          key={i}
          className="inline-block px-4 text-xs font-semibold uppercase tracking-[0.18em] text-brand-900/45 antialiased sm:text-sm"
        >
          {displayText}
        </span>
      ))}
    </div>
  );

  return (
    <div aria-hidden="true" className="w-full overflow-hidden border-b border-brand-900/10 py-3">
      <style>{`
@keyframes fdConversionRailScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .fd-conversion-rail-track { animation: none !important; } }
`}</style>
      <div
        className="fd-conversion-rail-track flex w-max"
        style={{ animation: `fdConversionRailScroll ${duration}s linear infinite` }}
      >
        {track}
        {track}
      </div>
    </div>
  );
}
