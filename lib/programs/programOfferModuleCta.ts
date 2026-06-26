/**
 * Resolver for the `cta.program-offer.v1` marketing module.
 *
 * The module's authorable content references a program by slug
 * ({ collectionSlug, programSlug? }); the actual CTA label, href, availability
 * (coming_soon / planned -> disabled), checkout offer link, and secondary CTA
 * are ALWAYS produced by the centralized `resolveProgramMarketingCta`. Editors
 * cannot override offer/checkout truth from the composition — they only choose
 * which program/collection the CTA targets and the surrounding copy.
 *
 * Resolution uses the code-owned catalogue (the source of CTA config). Returns
 * null when the collection is unknown, or when a `programSlug` is given but does
 * not exist in that collection, so the renderer can skip gracefully.
 */
import {
  getProgramSeriesBySlug,
  getProgramBySlugWithinSeries,
  resolveProgramMarketingCta,
} from './programSeriesCatalogue';
import type {
  ProgramCollectionDefinition,
  ProgramCollectionProgramDefinition,
  ProgramMarketingCtaResolution,
} from './programCollectionTypes';

export interface ProgramOfferModuleCtaInput {
  collectionSlug: string;
  programSlug?: string;
}

export interface ResolvedProgramOfferModuleCta {
  collection: ProgramCollectionDefinition;
  program: ProgramCollectionProgramDefinition | null;
  cta: ProgramMarketingCtaResolution;
}

export function resolveProgramOfferModuleCta(
  input: ProgramOfferModuleCtaInput,
): ResolvedProgramOfferModuleCta | null {
  const collection = getProgramSeriesBySlug(input.collectionSlug);
  if (!collection) return null;

  let program: ProgramCollectionProgramDefinition | null = null;
  if (input.programSlug) {
    program = getProgramBySlugWithinSeries(collection, input.programSlug);
    if (!program) return null;
  }

  const cta = resolveProgramMarketingCta({ series: collection, program });
  return { collection, program, cta };
}
