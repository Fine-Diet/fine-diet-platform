/**
 * Module System — Composition validity inspector (non-destructive)
 *
 * The public/preview render path (`validateComposition` in programsMarketingApi)
 * intentionally DROPS modules whose content fails their schema, which is correct
 * for rendering but wrong for AUTHORING: in the admin editor a freshly added or
 * partially filled module would silently disappear on reload.
 *
 * This inspector is the authoring-side counterpart. It PRESERVES every stored
 * module (including unknown types and invalid content) and reports per-module
 * validity + human-readable reasons, so the editor can keep modules editable and
 * explain what is wrong instead of dropping them. It is pure (zod only) and
 * isomorphic, so the editor can also recompute validity live on the client.
 */

import { z } from 'zod';
import { MODULE_CONTENT_SCHEMAS } from './schema';
import type { ModuleTypeKey } from './types';
import { moduleChromeSchema, type ModuleChrome } from './sectionChrome';

export interface ModuleValidityIssue {
  /** Dot/bracket path into the module content, e.g. "tiles[0].title". */
  path: string;
  message: string;
}

export interface ModuleValidity {
  id: string;
  type: string;
  valid: boolean;
  /** True when `type` is not a registered module type. */
  unknownType: boolean;
  issues: ModuleValidityIssue[];
}

/** A stored module instance before strict per-type validation. */
export interface LooseModule {
  id: string;
  type: string;
  content: Record<string, unknown>;
  /** Optional, safe-token section chrome (preserved for authoring round-trips). */
  chrome?: ModuleChrome;
}

export interface InspectedComposition {
  key: string;
  version?: number;
  /** ALL stored modules, preserved in order (never dropped). */
  modules: LooseModule[];
  /** Per-module validity, parallel to `modules` (same index/length). */
  validity: ModuleValidity[];
  validCount: number;
  invalidCount: number;
  allValid: boolean;
}

/**
 * Relaxed top-level shape used ONLY for authoring inspection. Unlike
 * `pageCompositionSchema`, `type` is a plain string (so unknown/renamed types
 * are preserved and flagged rather than rejecting the whole composition), and
 * missing content defaults to `{}`.
 */
const looseModuleSchema = z.object({
  id: z.string(),
  type: z.string(),
  content: z.record(z.string(), z.unknown()).default({}),
  chrome: moduleChromeSchema.optional(),
});

const looseCompositionSchema = z.object({
  key: z.string(),
  version: z.number().optional(),
  modules: z.array(looseModuleSchema),
});

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  return path.reduce<string>((acc, rawSegment) => {
    if (typeof rawSegment === 'number') return `${acc}[${rawSegment}]`;
    const segment = String(rawSegment);
    return acc ? `${acc}.${segment}` : segment;
  }, '');
}

/** Validate a single loose module against its registered content schema. */
export function inspectModule(mod: LooseModule): ModuleValidity {
  const contentSchema = MODULE_CONTENT_SCHEMAS[mod.type as ModuleTypeKey];

  if (!contentSchema) {
    return {
      id: mod.id,
      type: mod.type,
      valid: false,
      unknownType: true,
      issues: [
        {
          path: 'type',
          message: `Unknown module type "${mod.type}". It will not render until the type is supported.`,
        },
      ],
    };
  }

  const result = contentSchema.safeParse(mod.content);
  if (result.success) {
    return { id: mod.id, type: mod.type, valid: true, unknownType: false, issues: [] };
  }

  const issues: ModuleValidityIssue[] = result.error.issues.map((issue) => ({
    path: formatPath(issue.path) || '(root)',
    message: issue.message,
  }));

  return { id: mod.id, type: mod.type, valid: false, unknownType: false, issues };
}

/** Inspect a list of loose modules (parallel validity array). */
export function inspectModules(modules: LooseModule[]): ModuleValidity[] {
  return modules.map(inspectModule);
}

/**
 * Non-destructive composition inspection. Returns all modules + per-module
 * validity, or null when the top-level shape is unusable (e.g. `modules` is not
 * an array). Never drops individual modules.
 */
export function inspectComposition(raw: unknown): InspectedComposition | null {
  const parsed = looseCompositionSchema.safeParse(raw);
  if (!parsed.success) return null;

  const { key, version, modules } = parsed.data;
  const looseModules: LooseModule[] = modules.map((m) => ({
    id: m.id,
    type: m.type,
    content: m.content,
    ...(m.chrome ? { chrome: m.chrome } : {}),
  }));
  const validity = inspectModules(looseModules);
  const invalidCount = validity.filter((v) => !v.valid).length;

  return {
    key,
    version,
    modules: looseModules,
    validity,
    validCount: validity.length - invalidCount,
    invalidCount,
    allValid: invalidCount === 0,
  };
}
