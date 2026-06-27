/**
 * Resolver-slug warnings (authoring-side, non-blocking)
 *
 * Some modules are RESOLVER-DRIVEN: their visible output (program cards, the
 * program-aware CTA, pathway nav) is resolved from the code catalogue using an
 * authored slug — never from the module content itself. When that slug is a
 * leftover TEMPLATE PLACEHOLDER (e.g. `collection-slug`) or empty, the resolver
 * finds nothing and the section renders empty (no program cards, a disabled/empty
 * sales CTA). This is a DATA prerequisite, not a schema error, so the strict Zod
 * content schema still reports the module as "valid".
 *
 * This helper surfaces that gap to authors so the editor can say, explicitly:
 * "replace the placeholder slug with a real Collection/Program slug." It is pure,
 * isomorphic, and imports nothing from the catalogue, so it is safe in the
 * client editor bundle and cannot change offer/entitlement truth.
 */

/** Slugs the code-backed templates ship as replace-me placeholders. */
export const PLACEHOLDER_SLUG_TOKENS = ['collection-slug', 'program-slug'] as const;

/** Which content fields on each module type are resolver-driven slug fields. */
const RESOLVER_SLUG_FIELDS: Record<string, ReadonlyArray<{ key: string; label: string }>> = {
  'grid.program-cards.v1': [{ key: 'collectionSlug', label: 'Collection slug' }],
  'cta.program-offer.v1': [
    { key: 'collectionSlug', label: 'Collection slug' },
    { key: 'programSlug', label: 'Program slug' },
  ],
  'nav.program-pathway.v1': [
    { key: 'collectionSlug', label: 'Collection slug' },
    { key: 'programSlug', label: 'Program slug' },
  ],
};

export interface ResolverSlugWarning {
  /** Content field key, e.g. "collectionSlug". */
  field: string;
  /** Human-readable field label. */
  label: string;
  /** The offending value (placeholder token or empty). */
  value: string;
  /** Why this is a problem + what to do. */
  message: string;
}

function isPlaceholder(value: string): boolean {
  return (PLACEHOLDER_SLUG_TOKENS as readonly string[]).includes(value);
}

/**
 * Inspect one module's content for placeholder/empty resolver slugs. Returns an
 * empty array for non-resolver modules or when all required slugs are set to a
 * concrete (non-placeholder) value. `programSlug` is only flagged when present
 * (it is optional on cta.program-offer.v1 collection-level CTAs).
 */
export function getModuleResolverSlugWarnings(
  type: string,
  content: Record<string, unknown> | undefined | null,
): ResolverSlugWarning[] {
  const fields = RESOLVER_SLUG_FIELDS[type];
  if (!fields || !content) return [];

  const warnings: ResolverSlugWarning[] = [];
  for (const { key, label } of fields) {
    const raw = content[key];
    const optional = key === 'programSlug' && type === 'cta.program-offer.v1';

    // Optional program slug: only validate when the author actually set it.
    if (raw === undefined || raw === null) {
      if (!optional && key === 'collectionSlug') {
        warnings.push({
          field: key,
          label,
          value: '',
          message: `${label} is empty — this section will render nothing until a real slug is set.`,
        });
      }
      continue;
    }

    const value = String(raw);
    if (value.trim() === '') {
      warnings.push({
        field: key,
        label,
        value,
        message: `${label} is empty — this section will render nothing until a real slug is set.`,
      });
    } else if (isPlaceholder(value)) {
      warnings.push({
        field: key,
        label,
        value,
        message: `${label} still uses the template placeholder "${value}". Replace it with a real catalogue slug or no program cards / sales CTA will appear.`,
      });
    }
  }
  return warnings;
}
