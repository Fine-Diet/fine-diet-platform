import { programDayBeadClass, programDayBeadStyle } from '../programDayBeadClass';
import type { ProgramDayRailItem } from '../programDeliveryNavigation';

function day(
  state: ProgramDayRailItem['state'],
  accessible: boolean,
  number = 7,
): ProgramDayRailItem {
  return { day: number, label: String(number), state, accessible };
}

describe('program day circle visual states', () => {
  it('uses equal fixed dimensions at mobile and desktop sizes and keeps a visible focus ring', () => {
    const classes = programDayBeadClass(day('review', true), false);

    expect(classes).toContain('h-11 w-11');
    expect(classes).toContain('md:h-8 md:w-8');
    expect(classes).toContain('flex-none');
    expect(classes).toContain('p-0');
    expect(classes).toContain('text-xs font-semibold');
    expect(classes).toContain('items-center justify-center');
    expect(classes).toContain('focus-visible:outline-2');
  });

  it('keeps two-digit labels in the same fixed circle dimensions', () => {
    const classes = programDayBeadClass(day('locked', false, 21), false);

    expect(classes).toContain('h-11 w-11');
    expect(classes).toContain('md:h-8 md:w-8');
    expect(classes).toContain('flex-none');
    expect(classes).toContain('p-0');
  });

  it('emphasizes the selected current day without changing its current-day fill', () => {
    const current = programDayBeadClass(day('current', true), true);
    const currentButNotSelected = programDayBeadClass(day('current', true), false);

    expect(current).toContain('bg-[#55789b] text-black');
    expect(current).toContain('ring-2 ring-white ring-offset-2 ring-offset-black/30');
    expect(currentButNotSelected).toContain('bg-[#55789b] text-black');
    expect(currentButNotSelected).not.toContain('ring-2');
  });

  it('distinguishes a selected review day from other reviewable days', () => {
    const selectedReview = programDayBeadClass(day('review', true), true);
    const review = programDayBeadClass(day('review', true), false);

    expect(selectedReview).toContain('bg-white text-black ring-2 ring-white');
    expect(review).toContain('border-transparent bg-white/50 text-black');
    expect(review).not.toContain('ring-2');
  });

  it('gives locked days a softer translucent fill while keeping them muted', () => {
    const locked = programDayBeadClass(day('locked', false), false);
    const selectedLocked = programDayBeadClass(day('locked', false), true);
    const accessible = programDayBeadClass(day('review', true), false);

    expect(locked).toContain('border border-white/50 bg-white/20 text-white/50');
    expect(selectedLocked).toContain('border border-white/50 bg-white/20 text-white/50');
    expect(selectedLocked).not.toContain('ring-2');
    expect(accessible).toContain('bg-white/50 text-black');
  });

  it('uses authored accent colors for the current day in both renderers', () => {
    const tokens = { accentSurface: '#C0D0DC', accentForeground: '#17100c' };

    expect(programDayBeadStyle(day('current', true), tokens)).toEqual({
      backgroundColor: '#C0D0DC',
      color: '#17100c',
      borderColor: '#C0D0DC',
    });
    expect(programDayBeadStyle(day('review', true), tokens)).toBeUndefined();
    expect(programDayBeadStyle(day('current', true))).toBeUndefined();
  });
});
