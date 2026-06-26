/**
 * Canonical "Collection" naming layer for the Programs marketing hierarchy.
 *
 * Doctrine model (7fb5e621-dfbc-49bf-bb45-488629696e3c):
 *   Category -> Collection -> Program -> Version -> Module
 *
 * "Collection" is the canonical, code/UI-facing name for what the storage layer
 * still calls a "Series" (tables `program_series` / `program_series_items`).
 * Per the confirmed decision, the storage tables and their server services are
 * intentionally NOT renamed; only the code/UI-facing TYPES are renamed here so
 * new marketing code speaks in Collections.
 *
 * Reserved for the future: an optional "Track" grouping level MAY be introduced
 * between Collection and Program if a middle layer is ever needed. It is NOT
 * implemented today and has no storage. Do NOT introduce "season" or "episode"
 * terminology anywhere in the programs domain.
 *
 * The legacy `ProgramSeries*` names remain available from ./programSeriesTypes
 * as deprecated aliases for the storage-aligned layer during migration.
 */
import type {
  ProgramSeriesCategory,
  ProgramSeriesProgramStatus,
  ProgramSeriesCtaConfig,
  ProgramSeriesProgramDefinition,
  ProgramSeriesProgramResolution,
  ProgramSeriesDefinition,
} from './programSeriesTypes';

/** Marketing taxonomy bucket a Collection belongs to (the "Category" level). */
export type ProgramCollectionCategory = ProgramSeriesCategory;

/** Public availability of a Program as presented within a Collection. */
export type ProgramCollectionProgramStatus = ProgramSeriesProgramStatus;

/** Editable CTA config attached to a Collection or one of its Programs. */
export type ProgramCollectionCtaConfig = ProgramSeriesCtaConfig;

/** A single Program as presented within a Collection. */
export type ProgramCollectionProgramDefinition = ProgramSeriesProgramDefinition;

/**
 * A resolved Program within its Collection, including sequence position and
 * adjacent Programs.
 *
 * NOTE: the underlying `series` field name is retained for now because it is
 * produced by the storage-aligned server services. It represents the
 * Collection; renaming that field is deferred to the route/service migration.
 */
export type ProgramCollectionProgramResolution = ProgramSeriesProgramResolution;

/** A marketing Collection (storage: `program_series`). */
export type ProgramCollectionDefinition = ProgramSeriesDefinition;

/**
 * Centralized marketing CTA resolution types. These are Collection-agnostic and
 * re-exported here so marketing code can import every Collection-facing type
 * from a single canonical module.
 */
export type {
  ProgramMarketingCtaKind,
  ProgramMarketingCtaResolution,
} from './programSeriesTypes';
