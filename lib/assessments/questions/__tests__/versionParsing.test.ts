/**
 * Tests for version parsing logic
 * 
 * Tests the version parsing from query parameters for /gut-check
 *
 * The resolver (resolveAssessmentExperience) always passes `entry.defaultVersion`
 * from the registry as the default, so the standalone `2` default below is a
 * legacy fallback only — new assessment types are not assumed to be version 2.
 */

import { parseVersionFromQuery } from '../parseVersion';

describe('parseVersionFromQuery', () => {
  it('should return default version (2) when query param is missing', () => {
    expect(parseVersionFromQuery(undefined)).toBe(2);
  });

  it('should parse valid version number from string', () => {
    expect(parseVersionFromQuery('3')).toBe(3);
    expect(parseVersionFromQuery('1')).toBe(1);
    expect(parseVersionFromQuery('99')).toBe(99);
  });

  it('should use first element when query param is array', () => {
    expect(parseVersionFromQuery(['3', '4'])).toBe(3);
  });

  it('should return default when version is out of bounds (< 1)', () => {
    expect(parseVersionFromQuery('0')).toBe(2);
    expect(parseVersionFromQuery('-1')).toBe(2);
  });

  it('should return default when version is out of bounds (> 99)', () => {
    expect(parseVersionFromQuery('100')).toBe(2);
    expect(parseVersionFromQuery('999')).toBe(2);
  });

  it('should return default when version is not a number', () => {
    expect(parseVersionFromQuery('abc')).toBe(2);
    expect(parseVersionFromQuery('v2')).toBe(2);
    expect(parseVersionFromQuery('')).toBe(2);
  });

  it('should respect custom default version', () => {
    expect(parseVersionFromQuery(undefined, 1)).toBe(1);
    expect(parseVersionFromQuery('invalid', 3)).toBe(3);
  });

  it('falls back to a custom registry default when the query value is out of bounds', () => {
    // Mirrors the resolver flow: parseVersionFromQuery(v, entry.defaultVersion).
    // A future assessment with defaultVersion=3 must fall back to 3, not the
    // legacy 2, for any invalid/out-of-bounds input.
    expect(parseVersionFromQuery('0', 3)).toBe(3);
    expect(parseVersionFromQuery('-1', 3)).toBe(3);
    expect(parseVersionFromQuery('100', 3)).toBe(3);
    expect(parseVersionFromQuery('999', 3)).toBe(3);
    expect(parseVersionFromQuery('abc', 3)).toBe(3);
    expect(parseVersionFromQuery('', 3)).toBe(3);
  });

  it('falls back to a custom default when the query param is missing', () => {
    expect(parseVersionFromQuery(undefined, 3)).toBe(3);
    expect(parseVersionFromQuery(null as any, 3)).toBe(3);
  });

  it('accepts a valid in-bounds version over a custom default', () => {
    expect(parseVersionFromQuery('2', 3)).toBe(2);
    expect(parseVersionFromQuery('1', 3)).toBe(1);
    expect(parseVersionFromQuery('99', 3)).toBe(99);
  });
});

