/**
 * Collection naming layer — verifies the canonical `ProgramCollection*` types are
 * exact aliases of the storage-aligned `ProgramSeries*` types (no structural
 * drift) and that real catalogue data satisfies the Collection-facing types.
 *
 * The compile-time assertions below fail `tsc --noEmit` if any alias diverges
 * from its source; the runtime assertions exercise the aliases against the live
 * catalogue so the test is a real Jest test (not type-only).
 */
import { describe, it, expect } from '@jest/globals';
import {
  getProgramSeriesBySlug,
  getProgramSeriesProgramBySlugs,
  resolveProgramMarketingCta,
} from '../programSeriesCatalogue';
import type {
  ProgramSeriesCategory,
  ProgramSeriesProgramStatus,
  ProgramSeriesCtaConfig,
  ProgramSeriesProgramDefinition,
  ProgramSeriesProgramResolution,
  ProgramSeriesDefinition,
  ProgramMarketingCtaResolution as SeriesCtaResolution,
} from '../programSeriesTypes';
import type {
  ProgramCollectionCategory,
  ProgramCollectionProgramStatus,
  ProgramCollectionCtaConfig,
  ProgramCollectionProgramDefinition,
  ProgramCollectionProgramResolution,
  ProgramCollectionDefinition,
  ProgramMarketingCtaResolution as CollectionCtaResolution,
} from '../programCollectionTypes';

// ── Compile-time alias identity (both directions) ───────────────────────────
// `Mutual<A, B>` is the literal `true` only when A and B are mutually
// assignable. Each const is declared as `true` with that type, so if any
// ProgramCollection* alias structurally diverges from its ProgramSeries*
// source, `const x: false = true` stops compiling under tsc.
type Extends<A, B> = A extends B ? true : false;
type Mutual<A, B> = Extends<A, B> extends true
  ? Extends<B, A> extends true
    ? true
    : false
  : false;

const aliasChecks: boolean[] = [
  ((): Mutual<ProgramCollectionCategory, ProgramSeriesCategory> => true)(),
  ((): Mutual<ProgramCollectionProgramStatus, ProgramSeriesProgramStatus> =>
    true)(),
  ((): Mutual<ProgramCollectionCtaConfig, ProgramSeriesCtaConfig> => true)(),
  ((): Mutual<
    ProgramCollectionProgramDefinition,
    ProgramSeriesProgramDefinition
  > => true)(),
  ((): Mutual<
    ProgramCollectionProgramResolution,
    ProgramSeriesProgramResolution
  > => true)(),
  ((): Mutual<ProgramCollectionDefinition, ProgramSeriesDefinition> => true)(),
  ((): Mutual<CollectionCtaResolution, SeriesCtaResolution> => true)(),
];

describe('collection naming layer — alias identity', () => {
  it('keeps every ProgramCollection* alias mutually assignable with its source', () => {
    // If any alias diverged, the corresponding entry above would be typed
    // `false` and fail compilation; at runtime they are all literally true.
    expect(aliasChecks).toHaveLength(7);
    expect(aliasChecks.every((v) => v === true)).toBe(true);
  });
});

describe('collection naming layer — real catalogue data satisfies the aliases', () => {
  it('treats a catalogue series as a ProgramCollectionDefinition', () => {
    const collection: ProgramCollectionDefinition | null =
      getProgramSeriesBySlug('nutrition');
    expect(collection).not.toBeNull();
    expect(collection!.slug).toBe('nutrition');
    expect(Array.isArray(collection!.programs)).toBe(true);

    const program: ProgramCollectionProgramDefinition = collection!.programs[0];
    expect(typeof program.slug).toBe('string');

    const status: ProgramCollectionProgramStatus = program.status;
    expect(typeof status).toBe('string');

    const category: ProgramCollectionCategory = collection!.category;
    expect(typeof category).toBe('string');
  });

  it('treats a resolution as a ProgramCollectionProgramResolution', () => {
    const resolution: ProgramCollectionProgramResolution | null =
      getProgramSeriesProgramBySlugs('nutrition', 'baseline');
    expect(resolution).not.toBeNull();
    // `series` is the storage-aligned field name; it represents the Collection.
    expect(resolution!.series.slug).toBe('nutrition');
    expect(resolution!.program.slug).toBe('baseline');
    expect(resolution!.index).toBe(0);
    expect(resolution!.previousProgram).toBeNull();
  });

  it('re-exports the centralized CTA resolution type for marketing code', () => {
    const collection = getProgramSeriesBySlug('nutrition')!;
    const cta: CollectionCtaResolution = resolveProgramMarketingCta({
      series: collection,
    });
    expect(typeof cta.kind).toBe('string');
    expect(typeof cta.label).toBe('string');
  });
});
