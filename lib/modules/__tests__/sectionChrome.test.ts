/**
 * Tests for section chrome — the safe, token-mapped wrapper controls applied by
 * ModuleRenderer. The contract under test:
 *   1. Enum/boolean chrome values map to a FIXED allowlist of Tailwind classes.
 *   2. There is no path for arbitrary/raw class strings to reach the output.
 *   3. `hasChromeEffect` only triggers wrapping when something is actually set.
 *   4. The Zod schema accepts the allowlist and rejects unknown values/keys.
 */

import {
  resolveModuleChromeClasses,
  hasChromeEffect,
  moduleChromeSchema,
  MODULE_CHROME_SURFACES,
  MODULE_CHROME_BORDER_TONES,
  MODULE_CHROME_TEXT_TONES,
} from '../sectionChrome';

describe('resolveModuleChromeClasses — safe token mapping', () => {
  it('maps each independent control to its allowlisted class', () => {
    const classes = resolveModuleChromeClasses({
      roundedTop: true,
      overlap: true,
      surface: 'brand-900',
      topBorder: true,
      bottomBorder: true,
      borderTone: 'light',
      textTone: 'light',
    }).split(' ');

    expect(classes).toContain('relative');
    expect(classes).toContain('-mt-8'); // overlap
    expect(classes).toContain('rounded-t-[2rem]'); // rounded top
    expect(classes).toContain('overflow-hidden');
    expect(classes).toContain('bg-brand-900'); // surface
    expect(classes).toContain('border-t');
    expect(classes).toContain('border-b');
    expect(classes).toContain('border-white/40'); // border tone (light)
    expect(classes).toContain('text-white'); // text tone (light)
  });

  it('controls are independent — only requested effects appear', () => {
    const classes = resolveModuleChromeClasses({ topBorder: true, borderTone: 'strong' }).split(' ');
    expect(classes).toContain('border-t');
    expect(classes).not.toContain('border-b');
    expect(classes).toContain('border-brand-900/40');
    expect(classes).not.toContain('-mt-8');
    expect(classes).not.toContain('rounded-t-[2rem]');
  });

  it('surface "none" and textTone "inherit" emit no background/text class', () => {
    const classes = resolveModuleChromeClasses({ surface: 'none', textTone: 'inherit' });
    expect(classes).not.toMatch(/\bbg-/);
    expect(classes).not.toMatch(/\btext-/);
  });

  it('appends the safe z-index token only when supplied (stacked layout)', () => {
    expect(resolveModuleChromeClasses({ roundedTop: true }, { zClass: 'z-30' })).toContain('z-30');
    expect(resolveModuleChromeClasses({ roundedTop: true })).not.toMatch(/\bz-/);
  });

  it('omits the border-tone class when neither border is enabled', () => {
    const classes = resolveModuleChromeClasses({ borderTone: 'strong' });
    expect(classes).not.toContain('border-brand-900/40');
  });
});

describe('hasChromeEffect', () => {
  it('is false for undefined / empty / no-op chrome', () => {
    expect(hasChromeEffect(undefined)).toBe(false);
    expect(hasChromeEffect({})).toBe(false);
    expect(hasChromeEffect({ surface: 'none', textTone: 'inherit', borderTone: 'subtle' })).toBe(
      false,
    );
  });

  it('is true when any visible effect is requested', () => {
    expect(hasChromeEffect({ roundedTop: true })).toBe(true);
    expect(hasChromeEffect({ overlap: true })).toBe(true);
    expect(hasChromeEffect({ topBorder: true })).toBe(true);
    expect(hasChromeEffect({ surface: 'brand-900' })).toBe(true);
    expect(hasChromeEffect({ textTone: 'light' })).toBe(true);
  });
});

describe('moduleChromeSchema', () => {
  it('accepts every allowlisted enum value', () => {
    for (const surface of MODULE_CHROME_SURFACES) {
      expect(moduleChromeSchema.safeParse({ surface }).success).toBe(true);
    }
    for (const borderTone of MODULE_CHROME_BORDER_TONES) {
      expect(moduleChromeSchema.safeParse({ borderTone }).success).toBe(true);
    }
    for (const textTone of MODULE_CHROME_TEXT_TONES) {
      expect(moduleChromeSchema.safeParse({ textTone }).success).toBe(true);
    }
  });

  it('rejects unknown enum values (no arbitrary tokens)', () => {
    expect(moduleChromeSchema.safeParse({ surface: 'bg-[#bada55]' }).success).toBe(false);
    expect(moduleChromeSchema.safeParse({ borderTone: 'neon' }).success).toBe(false);
    expect(moduleChromeSchema.safeParse({ textTone: 'purple' }).success).toBe(false);
  });

  it('rejects unknown keys (no raw className field can be smuggled in)', () => {
    expect(moduleChromeSchema.safeParse({ className: 'p-99 bg-red-500' }).success).toBe(false);
  });

  it('accepts an empty object and boolean toggles', () => {
    expect(moduleChromeSchema.safeParse({}).success).toBe(true);
    expect(
      moduleChromeSchema.safeParse({ roundedTop: true, overlap: false, topBorder: true }).success,
    ).toBe(true);
  });
});
