/**
 * Tests for the non-destructive authoring inspector.
 *
 * The render path (validateComposition) drops invalid modules; this inspector
 * must instead PRESERVE every module and report per-module validity so the admin
 * editor can keep partial modules editable and explain what is wrong.
 */

import {
  inspectModule,
  inspectModules,
  inspectComposition,
  type LooseModule,
} from '../compositionValidation';

const validCtaBand: LooseModule = {
  id: 'cta-1',
  type: 'cta.band.v1',
  content: { headline: 'Join now' },
};

const invalidCtaBand: LooseModule = {
  id: 'cta-2',
  type: 'cta.band.v1',
  content: {}, // missing required `headline`
};

const emptyNewModule: LooseModule = {
  id: 'faq-new',
  type: 'faq.accordion.v1',
  content: {}, // freshly added, not yet filled (missing required `items`)
};

const unknownTypeModule: LooseModule = {
  id: 'ghost-1',
  type: 'totally.made-up.v9',
  content: { foo: 'bar' },
};

describe('inspectModule', () => {
  it('marks a well-formed module valid with no issues', () => {
    const result = inspectModule(validCtaBand);
    expect(result.valid).toBe(true);
    expect(result.unknownType).toBe(false);
    expect(result.issues).toHaveLength(0);
  });

  it('marks a known module with missing required content invalid (not unknown)', () => {
    const result = inspectModule(invalidCtaBand);
    expect(result.valid).toBe(false);
    expect(result.unknownType).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.path.includes('headline'))).toBe(true);
  });

  it('flags an unknown module type instead of throwing', () => {
    const result = inspectModule(unknownTypeModule);
    expect(result.valid).toBe(false);
    expect(result.unknownType).toBe(true);
    expect(result.issues[0]?.path).toBe('type');
  });

  it('reports a freshly added empty module as invalid but editable', () => {
    const result = inspectModule(emptyNewModule);
    expect(result.valid).toBe(false);
    expect(result.unknownType).toBe(false);
  });
});

describe('inspectModules', () => {
  it('returns validity parallel to input order/length', () => {
    const validity = inspectModules([validCtaBand, invalidCtaBand, unknownTypeModule]);
    expect(validity).toHaveLength(3);
    expect(validity[0].valid).toBe(true);
    expect(validity[1].valid).toBe(false);
    expect(validity[2].unknownType).toBe(true);
  });
});

describe('inspectComposition (non-destructive)', () => {
  it('preserves ALL modules including invalid and unknown ones', () => {
    const raw = {
      key: 'composition:programs:test',
      version: 1,
      modules: [validCtaBand, invalidCtaBand, unknownTypeModule],
    };
    const result = inspectComposition(raw);
    expect(result).not.toBeNull();
    // Critically: nothing is dropped (round-trip preserves count).
    expect(result!.modules).toHaveLength(3);
    expect(result!.validity).toHaveLength(3);
    expect(result!.validCount).toBe(1);
    expect(result!.invalidCount).toBe(2);
    expect(result!.allValid).toBe(false);
  });

  it('reports allValid when every module passes', () => {
    const raw = {
      key: 'composition:programs:test',
      modules: [validCtaBand],
    };
    const result = inspectComposition(raw);
    expect(result!.allValid).toBe(true);
    expect(result!.invalidCount).toBe(0);
  });

  it('defaults missing content to an empty object rather than dropping the module', () => {
    const raw = {
      key: 'composition:programs:test',
      modules: [{ id: 'no-content', type: 'cta.band.v1' }],
    };
    const result = inspectComposition(raw);
    expect(result!.modules).toHaveLength(1);
    expect(result!.modules[0].content).toEqual({});
    expect(result!.validity[0].valid).toBe(false);
  });

  it('returns null when the top-level shape is unusable', () => {
    expect(inspectComposition({ key: 'x', modules: 'not-an-array' })).toBeNull();
    expect(inspectComposition(null)).toBeNull();
    expect(inspectComposition({ modules: [] })).toBeNull(); // missing key
  });
});
