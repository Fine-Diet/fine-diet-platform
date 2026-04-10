/**
 * Module: ambient.marquee-strip.v1
 *
 * Full-width thin auto-scrolling text strip. Infinitely repeating.
 * The text is meaningful editorial copy, not decorative filler.
 * Respects prefers-reduced-motion (via CSS media query in globals.css).
 *
 * Keyframes are defined in styles/globals.css:
 *   @keyframes marquee-left / marquee-right
 *   .animate-marquee-left / .animate-marquee-right
 *
 * Classification: new module — ambient/support module
 */

import type { AmbientMarqueeStripV1Content } from '@/lib/modules/types';

interface Props {
  content: AmbientMarqueeStripV1Content;
}

export function AmbientMarqueeStripV1({ content }: Props) {
  const direction = content.direction ?? 'left';
  const speed = content.speed ?? 40; // pixels per second
  const pauseOnHover = content.pauseOnHover ?? false;

  // Repeat text enough times for seamless infinite loop (two halves = 100%)
  const separator = '\u00A0\u00A0\u00A0\u00B7\u00A0\u00A0\u00A0';
  const displayText = content.text + separator;
  const repeats = 8;

  // Estimate duration: approximate chars × ~9px per char at 0.8rem / speed
  const approxWidthPx = displayText.length * 9 * (repeats / 2);
  const duration = Math.max(10, Math.round(approxWidthPx / speed));

  const animClass = direction === 'left' ? 'animate-marquee-left' : 'animate-marquee-right';

  return (
    <div
      className={`w-full overflow-hidden border-y border-brand-900/10 bg-neutral-0 py-3 ${pauseOnHover ? 'group' : ''}`}
    >
      <div
        className={`flex whitespace-nowrap ${animClass} ${pauseOnHover ? 'group-hover:[animation-play-state:paused]' : ''}`}
        style={{ animationDuration: `${duration}s` }}
      >
        {Array.from({ length: repeats }).map((_, i) => (
          <span
            key={i}
            className="antialiased inline-block px-4 text-xs font-light uppercase tracking-widest text-brand-900/50 sm:text-sm"
          >
            {displayText}
          </span>
        ))}
      </div>
    </div>
  );
}
