/**
 * Tests for version parsing logic
 * 
 * Tests the version parsing from query parameters for /gut-check
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
});

