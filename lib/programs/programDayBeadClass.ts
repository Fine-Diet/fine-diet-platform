import type { ProgramDayRailItem } from './programDeliveryNavigation';

export interface ProgramDayBeadAccentTokens {
  accentSurface: string;
  accentForeground: string;
}

export interface ProgramDayBeadInlineStyle {
  backgroundColor: string;
  color: string;
  borderColor: string;
}

/** Shared day-circle styles for the Partner Demo and member experience. */
export function programDayBeadClass(
  item: ProgramDayRailItem,
  selected: boolean,
): string {
  const chrome =
    'flex h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:h-8 md:min-w-8 md:px-2.5';

  if (item.state === 'current') {
    return `${chrome} bg-[#55789b] text-black${
      selected ? ' ring-2 ring-white ring-offset-2 ring-offset-black/30' : ''
    }`;
  }

  if (item.state === 'locked') {
    return `${chrome} border border-white/50 bg-white/20 text-white/50`;
  }

  if (selected) return `${chrome} bg-white text-black ring-2 ring-white`;
  if (item.accessible) {
    return `${chrome} border border-transparent bg-white/50 text-black`;
  }
  return `${chrome} border border-white/50 text-white/50`;
}

/** Apply authored accent tokens to the current day in both renderers. */
export function programDayBeadStyle(
  item: ProgramDayRailItem,
  tokens?: ProgramDayBeadAccentTokens,
): ProgramDayBeadInlineStyle | undefined {
  if (item.state !== 'current' || !tokens) return undefined;
  return {
    backgroundColor: tokens.accentSurface,
    color: tokens.accentForeground,
    borderColor: tokens.accentSurface,
  };
}
