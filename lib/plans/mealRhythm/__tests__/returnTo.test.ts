/**
 * Tests for lib/plans/mealRhythm/returnTo.ts
 */

import { resolveSafeMealRhythmReturnTo } from '../returnTo';

describe('resolveSafeMealRhythmReturnTo', () => {
  it('returns fallback for null input', () => {
    expect(resolveSafeMealRhythmReturnTo(null)).toBe('/app/plans');
  });

  it('returns fallback for undefined input', () => {
    expect(resolveSafeMealRhythmReturnTo(undefined)).toBe('/app/plans');
  });

  it('returns fallback for empty string', () => {
    expect(resolveSafeMealRhythmReturnTo('')).toBe('/app/plans');
  });

  it('allows /app (home)', () => {
    expect(resolveSafeMealRhythmReturnTo('/app')).toBe('/app');
  });

  it('allows /app/plans', () => {
    expect(resolveSafeMealRhythmReturnTo('/app/plans')).toBe('/app/plans');
  });

  it('allows /app/plans/today', () => {
    expect(resolveSafeMealRhythmReturnTo('/app/plans/today')).toBe('/app/plans/today');
  });

  it('allows /app/plans/week', () => {
    expect(resolveSafeMealRhythmReturnTo('/app/plans/week')).toBe('/app/plans/week');
  });

  it('coerces /app/plans/rhythm away from self-return after Done', () => {
    expect(resolveSafeMealRhythmReturnTo('/app/plans/rhythm')).toBe('/app/plans');
    expect(resolveSafeMealRhythmReturnTo('/app/plans/rhythm?x=1')).toBe('/app/plans');
    expect(resolveSafeMealRhythmReturnTo('/app/plans/rhythm', '/app')).toBe('/app');
  });

  it('allows /app/profile', () => {
    expect(resolveSafeMealRhythmReturnTo('/app/profile')).toBe('/app/profile');
  });

  it('allows /app/programs', () => {
    expect(resolveSafeMealRhythmReturnTo('/app/programs')).toBe('/app/programs');
  });

  it('allows /app/log', () => {
    expect(resolveSafeMealRhythmReturnTo('/app/log')).toBe('/app/log');
  });

  it('allows /app/food and subtrees', () => {
    expect(resolveSafeMealRhythmReturnTo('/app/food')).toBe('/app/food');
    expect(resolveSafeMealRhythmReturnTo('/app/food/pantry')).toBe('/app/food/pantry');
    expect(resolveSafeMealRhythmReturnTo('/app/food/groceries')).toBe('/app/food/groceries');
  });

  it('rejects external http URLs', () => {
    expect(resolveSafeMealRhythmReturnTo('https://evil.com/hack')).toBe('/app/plans');
  });

  it('rejects protocol-relative URLs', () => {
    expect(resolveSafeMealRhythmReturnTo('//evil.com/hack')).toBe('/app/plans');
  });

  it('rejects relative paths without leading slash', () => {
    expect(resolveSafeMealRhythmReturnTo('app/plans')).toBe('/app/plans');
  });

  it('rejects unknown /app subpaths', () => {
    expect(resolveSafeMealRhythmReturnTo('/app/unknown-page')).toBe('/app/plans');
  });

  it('uses custom fallback when provided', () => {
    expect(resolveSafeMealRhythmReturnTo('//evil.com', '/app')).toBe('/app');
  });

  it('ignores query string when checking path', () => {
    expect(resolveSafeMealRhythmReturnTo('/app/plans?date=2026-08-21')).toBe(
      '/app/plans?date=2026-08-21',
    );
  });
});
