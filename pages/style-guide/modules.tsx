/**
 * Module Style Guide — /style-guide/modules
 *
 * Visual taxonomy of every reusable page-building module in the system.
 * Each module shows a live mini-preview, detailed property table,
 * variant list, and the source component path.
 *
 * Additive only — this page has no side effects on existing components.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  MODULE_STYLE_CATALOG,
  MODULE_CATEGORIES,
  MODULE_LIFECYCLES,
  getModuleLifecycle,
  isLifecycleRuledOut,
  type ModuleCategory,
  type ModuleDefinition,
  type ModuleLifecycle,
} from '@/lib/moduleRegistry';
import {
  getModuleDiscoveryMetadata,
  getModuleDisplayName,
  getModuleFinderDescription,
  getModuleSearchTokens,
  type ModuleDiscoveryMetadataMap,
} from '@/lib/moduleDiscoveryMetadata';

/* ------------------------------------------------------------------ */
/*  Lifecycle badge styling                                            */
/* ------------------------------------------------------------------ */

const LIFECYCLE_BADGE_STYLES: Record<ModuleLifecycle, string> = {
  approved: 'bg-emerald-500/20 text-emerald-300',
  experimental: 'bg-amber-500/20 text-amber-300',
  legacy: 'bg-zinc-500/20 text-zinc-300',
  deprecated: 'bg-red-500/20 text-red-300',
  reference_only: 'bg-indigo-500/20 text-indigo-300',
};

const LIFECYCLE_LABELS: Record<ModuleLifecycle, string> = Object.fromEntries(
  MODULE_LIFECYCLES.map((l) => [l.id, l.label]),
) as Record<ModuleLifecycle, string>;

function LifecycleBadge({ lifecycle }: { lifecycle: ModuleLifecycle }) {
  return (
    <span
      className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${LIFECYCLE_BADGE_STYLES[lifecycle]}`}
    >
      {LIFECYCLE_LABELS[lifecycle]}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Preview thumbnails                                                  */
/* ------------------------------------------------------------------ */

function ModuleMiniPreview({
  mod,
  metadataOverrides,
}: {
  mod: ModuleDefinition;
  metadataOverrides?: ModuleDiscoveryMetadataMap;
}) {
  const metadata = getModuleDiscoveryMetadata(mod, metadataOverrides);

  if (metadata.previewMode === 'live') {
    return <LiveMiniPreview mod={mod} />;
  }

  if (metadata.previewMode === 'fixture') {
    return <FixtureMiniPreview mod={mod} metadataOverrides={metadataOverrides} />;
  }

  return <AbstractModulePreview mod={mod} />;
}

function LiveMiniPreview({ mod }: { mod: ModuleDefinition }) {
  return (
    <div className="relative h-52 w-full overflow-hidden rounded-2xl bg-neutral-950">
      <iframe
        title={`${mod.name} mini preview`}
        src={`/style-guide/modules/embed/${mod.slug}`}
        className="absolute left-0 top-0 h-[340%] w-[340%] origin-top-left scale-[0.294] border-0 bg-neutral-950"
        loading="lazy"
        tabIndex={-1}
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />
      <div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/60">
        Live
      </div>
    </div>
  );
}

function FixtureMiniPreview({
  mod,
  metadataOverrides,
}: {
  mod: ModuleDefinition;
  metadataOverrides?: ModuleDiscoveryMetadataMap;
}) {
  const metadata = getModuleDiscoveryMetadata(mod, metadataOverrides);
  const tags = metadata.tags ?? [];
  const isButton = mod.slug.includes('button') || mod.category === 'cta';
  const isAmbient = mod.category === 'ambient';

  return (
    <div className="relative h-52 w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-950 via-neutral-900 to-brand-900 p-5">
      {isAmbient ? (
        <div className="absolute inset-0 opacity-80">
          <div className="absolute -left-8 top-8 h-32 w-32 rounded-full bg-denim-500/30 blur-3xl" />
          <div className="absolute bottom-4 right-0 h-36 w-36 rounded-full bg-emerald-500/20 blur-3xl" />
        </div>
      ) : null}
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
            {mod.category}
          </p>
          <h4 className="mt-3 max-w-[78%] text-lg font-semibold leading-tight tracking-[-0.03em] text-white antialiased">
            {metadata.humanNickname ?? mod.name}
          </h4>
          <p className="mt-2 max-w-[82%] text-xs leading-5 text-white/55 antialiased">
            {metadata.previewFixtures?.[0]?.label ?? tags[0] ?? mod.theme}
          </p>
        </div>
        {isButton ? (
          <div className="flex gap-2">
            <div className="h-9 w-28 rounded-full bg-denim-500" />
            <div className="h-9 w-20 rounded-full border border-white/30" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <div className="h-10 rounded-xl bg-white/10" />
            <div className="h-10 rounded-xl bg-white/15" />
            <div className="h-10 rounded-xl bg-white/10" />
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/60">
        Fixture
      </div>
    </div>
  );
}

function AbstractModulePreview({ mod }: { mod: ModuleDefinition }) {
  const bgMap: Record<string, string> = {
    image: 'bg-gradient-to-br from-neutral-700 via-neutral-800 to-neutral-900',
    solid: 'bg-neutral-800',
    gradient: 'bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900',
    blur: 'bg-neutral-800/70 backdrop-blur',
    glassmorphism: 'bg-neutral-800/40 backdrop-blur-sm border border-white/10',
    aurora: 'bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700',
  };

  const primaryBg = mod.properties.backgroundType[0];
  const bgClass = bgMap[primaryBg] || bgMap.solid;

  const positionMap: Record<string, string> = {
    center: 'items-center justify-center text-center',
    'bottom-left': 'items-end justify-start text-left',
    'bottom-center': 'items-end justify-center text-center',
    'top-left': 'items-start justify-start text-left',
  };
  const posClass = positionMap[mod.properties.contentPosition] || positionMap.center;

  const heightMap: Record<ModuleCategory, string> = {
    hero: 'h-52',
    content: 'h-44',
    grid: 'h-40',
    cta: 'h-36',
    card: 'h-32',
    form: 'h-40',
    ambient: 'h-36',
    layout: 'h-44',
    navigation: 'h-32',
  };
  const hClass = heightMap[mod.category] || 'h-40';

  return (
    <div
      className={`relative w-full ${hClass} rounded-2xl overflow-hidden flex flex-col p-5 ${bgClass} ${posClass}`}
    >
      {mod.properties.hasOverlay && (
        <div className="absolute inset-0 bg-black/30 pointer-events-none" />
      )}
      <div className="relative z-10 max-w-[85%]">
        {mod.properties.headlineSize !== 'n/a' && (
          <div
            className={`bg-white/90 rounded h-2.5 mb-2 ${
              mod.properties.textAlignment === 'center' ? 'mx-auto w-3/5' : 'w-3/4'
            }`}
          />
        )}
        {mod.properties.bodySize !== 'n/a' && (
          <div
            className={`bg-white/50 rounded h-1.5 mb-1.5 ${
              mod.properties.textAlignment === 'center' ? 'mx-auto w-2/5' : 'w-1/2'
            }`}
          />
        )}
        {mod.properties.hasButtons && (
          <div className="flex gap-1.5 mt-3">
            <div className="h-4 w-14 rounded-full bg-denim-500/80" />
            {(mod.properties.buttonVariants?.length ?? 0) > 1 && (
              <div className="h-4 w-12 rounded-full border border-white/40" />
            )}
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/50">
        Abstract
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Property Table                                                     */
/* ------------------------------------------------------------------ */

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-neutral-800/50">
      <td className="py-2.5 pr-4 text-xs font-medium text-white/40 whitespace-nowrap align-top">
        {label}
      </td>
      <td className="py-2.5 text-xs text-white/80 font-mono leading-relaxed">{value}</td>
    </tr>
  );
}

function PropertiesTable({
  mod,
  metadataOverrides,
}: {
  mod: ModuleDefinition;
  metadataOverrides?: ModuleDiscoveryMetadataMap;
}) {
  const p = mod.properties;
  const metadata = getModuleDiscoveryMetadata(mod, metadataOverrides);
  return (
    <table className="w-full">
      <tbody>
        <PropertyRow label="Canonical" value={`${mod.name} · ${mod.slug}`} />
        <PropertyRow label="Preview" value={metadata.previewMode ?? 'abstract'} />
        {metadata.runtimeKey && <PropertyRow label="Runtime Key" value={metadata.runtimeKey} />}
        <PropertyRow label="Background" value={p.backgroundType.join(', ')} />
        <PropertyRow label="Headline" value={`${p.headlineSize} · ${p.headlineWeight}`} />
        <PropertyRow label="Body" value={`${p.bodySize} · ${p.bodyWeight}`} />
        <PropertyRow label="Alignment" value={p.textAlignment} />
        <PropertyRow label="Content Position" value={p.contentPosition} />
        <PropertyRow label="Corner Radius" value={p.cornerRadius} />
        <PropertyRow label="Max Width" value={p.maxWidth} />
        <PropertyRow label="Height" value={p.height} />
        <PropertyRow label="Overlay" value={p.hasOverlay ? (p.overlayStyle || 'yes') : 'none'} />
        <PropertyRow label="Responsive" value={p.responsiveNotes} />
        {p.hasButtons && (
          <PropertyRow
            label="Buttons"
            value={p.buttonVariants?.join(', ') || 'yes'}
          />
        )}
        <PropertyRow label="Content-Driven" value={p.isContentDriven ? 'JSON / CMS' : 'Hardcoded'} />
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ */
/*  Module Card                                                        */
/* ------------------------------------------------------------------ */

const CATEGORY_COLORS: Record<ModuleCategory, string> = {
  hero: 'bg-amber-500/20 text-amber-300',
  content: 'bg-blue-500/20 text-blue-300',
  grid: 'bg-purple-500/20 text-purple-300',
  cta: 'bg-emerald-500/20 text-emerald-300',
  card: 'bg-cyan-500/20 text-cyan-300',
  form: 'bg-pink-500/20 text-pink-300',
  ambient: 'bg-orange-500/20 text-orange-300',
  layout: 'bg-indigo-500/20 text-indigo-300',
  navigation: 'bg-teal-500/20 text-teal-300',
};

function ModuleCard({
  mod,
  metadataOverrides,
}: {
  mod: ModuleDefinition;
  metadataOverrides?: ModuleDiscoveryMetadataMap;
}) {
  const [expanded, setExpanded] = useState(false);
  const metadata = getModuleDiscoveryMetadata(mod, metadataOverrides);
  const displayName = getModuleDisplayName(mod, metadataOverrides);
  const finderDescription = getModuleFinderDescription(mod, metadataOverrides);
  const tags = metadata.tags ?? [];
  const aliases = metadata.searchAliases ?? [];

  return (
    <div className="rounded-2xl bg-neutral-800/50 border border-neutral-700/40 overflow-hidden">
      {/* Preview */}
      <ModuleMiniPreview mod={mod} metadataOverrides={metadataOverrides} />

      {/* Info */}
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white antialiased">{displayName}</h3>
            <p className="mt-1 truncate text-[10px] font-mono text-white/35" title={`${mod.name} · ${mod.slug}`}>
              {mod.name} · {mod.slug}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <LifecycleBadge lifecycle={getModuleLifecycle(mod)} />
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                CATEGORY_COLORS[mod.category]
              }`}
            >
              {mod.category}
            </span>
          </div>
        </div>

        {/* Ruled-out caution */}
        {isLifecycleRuledOut(getModuleLifecycle(mod)) && (
          <p className="text-[10px] text-amber-300/80 leading-relaxed mb-2 antialiased">
            Not recommended for new builds.
          </p>
        )}

        <p className="text-xs text-white/65 leading-relaxed mb-3 antialiased">
          {finderDescription}
        </p>

        {tags.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {tags.slice(0, 6).map((tag) => (
              <span
                key={tag}
                className="text-[10px] text-denim-200/80 bg-denim-500/10 rounded-full px-2 py-0.5"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Used on */}
        {mod.usedOn.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {mod.usedOn.map((page) => (
              <span
                key={page}
                className="text-[10px] text-white/40 bg-white/5 rounded px-2 py-0.5 font-mono"
              >
                {page}
              </span>
            ))}
          </div>
        )}

        {/* Variants */}
        {mod.variants.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1.5">
              Variants
            </p>
            <div className="flex flex-wrap gap-1.5">
              {mod.variants.map((v) => (
                <span
                  key={v}
                  className="text-[10px] text-white/60 border border-white/10 rounded-full px-2 py-0.5"
                >
                  {v}
                </span>
              ))}
            </div>
          </div>
        )}

        {aliases.length > 0 && (
          <p className="mb-3 line-clamp-1 text-[10px] text-white/35" title={aliases.join(', ')}>
            Also searched as: {aliases.slice(0, 4).join(', ')}
          </p>
        )}

        {/* Component path */}
        <p className="text-[10px] text-white/30 font-mono truncate mb-3" title={mod.componentPath}>
          {mod.componentPath}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <Link
            href={`/style-guide/modules/${mod.slug}`}
            className="text-xs font-medium text-denim-400 hover:text-denim-300 transition-colors antialiased"
          >
            Full Preview &rarr;
          </Link>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-white/40 hover:text-white/60 transition-colors antialiased"
          >
            {expanded ? 'Hide Properties' : 'Show Properties'}
          </button>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-neutral-700/40">
            <PropertiesTable mod={mod} metadataOverrides={metadataOverrides} />
            {mod.notes && (
              <p className="mt-3 text-xs text-white/40 leading-relaxed italic">
                {mod.notes}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

type LifecycleFilter = ModuleLifecycle | 'all';

export default function ModuleStyleGuide() {
  const [activeCategory, setActiveCategory] = useState<ModuleCategory | 'all'>('all');
  // Default view = approved foundations only.
  const [activeLifecycle, setActiveLifecycle] = useState<LifecycleFilter>('approved');
  const [query, setQuery] = useState('');
  const [metadataOverrides, setMetadataOverrides] = useState<ModuleDiscoveryMetadataMap>({});
  const [metadataLoaded, setMetadataLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadOverrides() {
      try {
        const res = await fetch('/api/module-metadata', { headers: { 'Cache-Control': 'no-store' } });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json?.metadata && typeof json.metadata === 'object') {
          setMetadataOverrides(json.metadata);
        }
      } catch {
        // Code defaults remain the safe fallback.
      } finally {
        if (!cancelled) setMetadataLoaded(true);
      }
    }

    loadOverrides();
    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return MODULE_STYLE_CATALOG.filter((m) => {
      const categoryMatch = activeCategory === 'all' || m.category === activeCategory;
      const lifecycleMatch =
        activeLifecycle === 'all' || getModuleLifecycle(m) === activeLifecycle;
      const searchMatch =
        !normalizedQuery ||
        getModuleSearchTokens(m, metadataOverrides).join(' ').toLowerCase().includes(normalizedQuery);
      return categoryMatch && lifecycleMatch && searchMatch;
    });
  }, [activeCategory, activeLifecycle, normalizedQuery, metadataOverrides]);

  // Category counts respect the active lifecycle + search filters so the numbers match the grid.
  const counts = useMemo(() => {
    const inLifecycle = MODULE_STYLE_CATALOG.filter((m) => {
      const lifecycleMatch =
        activeLifecycle === 'all' || getModuleLifecycle(m) === activeLifecycle;
      const searchMatch =
        !normalizedQuery ||
        getModuleSearchTokens(m, metadataOverrides).join(' ').toLowerCase().includes(normalizedQuery);
      return lifecycleMatch && searchMatch;
    });
    const map: Record<string, number> = { all: inLifecycle.length };
    for (const cat of MODULE_CATEGORIES) {
      map[cat.id] = inLifecycle.filter((m) => m.category === cat.id).length;
    }
    return map;
  }, [activeLifecycle, normalizedQuery, metadataOverrides]);

  // Lifecycle bucket totals (across all categories) for the filter row + summary.
  const lifecycleCounts = useMemo(() => {
    const map: Record<string, number> = { all: MODULE_STYLE_CATALOG.length };
    for (const l of MODULE_LIFECYCLES) {
      map[l.id] = MODULE_STYLE_CATALOG.filter((m) => getModuleLifecycle(m) === l.id).length;
    }
    return map;
  }, []);

  return (
    <div className="min-h-screen bg-brand-900 text-white">
      {/* Header */}
      <header className="border-b border-neutral-700/40">
        <div className="max-w-7xl mx-auto px-5 py-10">
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/style-guide"
              className="text-xs text-white/40 hover:text-white/60 transition-colors antialiased"
            >
              Style Guide
            </Link>
            <span className="text-white/20">/</span>
            <span className="text-xs text-white/60 antialiased">Modules</span>
          </div>
          <h1 className="text-4xl font-semibold antialiased mb-2">Module Taxonomy</h1>
          <p className="text-base text-white/60 font-light antialiased max-w-2xl">
            Every composable page section, documented with visual properties, variants, and
            responsive behavior. Use this as a reference when assembling new pages.
          </p>
          <p className="mt-3 text-sm text-white/70 font-light antialiased max-w-2xl">
            {activeLifecycle === 'approved' ? (
              <>
                Showing <span className="text-emerald-300 font-medium">approved foundations</span>{' '}
                only — safe foundations from the public site and the{' '}
                <span className="text-white/80">accepted main app surfaces</span> (Home, Plans,
                Programs, Log, Profile). Modules from deeper app/detail surfaces are kept out of
                this set, but may still inform spacing and visual taste — view them under Reference
                Only or All.
              </>
            ) : activeLifecycle === 'all' ? (
              <>Showing all {MODULE_STYLE_CATALOG.length} modules across every lifecycle bucket.</>
            ) : (
              <>
                Showing <span className="font-medium">{LIFECYCLE_LABELS[activeLifecycle]}</span>{' '}
                modules.{' '}
                {activeLifecycle === 'reference_only'
                  ? 'Not approved as new-page foundations — but useful for spacing and visual taste. Includes deeper app/detail surfaces awaiting design acceptance.'
                  : isLifecycleRuledOut(activeLifecycle)
                    ? 'These are not recommended for new builds.'
                    : ''}
              </>
            )}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/40 antialiased">
            <span>{MODULE_STYLE_CATALOG.length} modules total</span>
            <span>{MODULE_CATEGORIES.length} categories</span>
            <span className="text-white/30">·</span>
            {MODULE_LIFECYCLES.map((l) => (
              <span key={l.id}>
                {l.label}: {lifecycleCounts[l.id] ?? 0}
              </span>
            ))}
            <span className="text-white/30">·</span>
            <span>{metadataLoaded ? 'Editable metadata loaded' : 'Loading editable metadata...'}</span>
          </div>
          <div className="mt-4">
            <Link
              href="/admin/module-metadata"
              className="inline-flex rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-white/60 transition hover:border-white/30 hover:text-white"
            >
              Edit module nicknames & finder copy
            </Link>
          </div>
        </div>
      </header>

      {/* Lifecycle filter */}
      <nav className="border-b border-neutral-700/40">
        <div className="max-w-7xl mx-auto px-5 py-3 flex items-center gap-2 overflow-x-auto">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-white/30 mr-1">
            Lifecycle
          </span>
          <button
            type="button"
            onClick={() => setActiveLifecycle('all')}
            className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors antialiased ${
              activeLifecycle === 'all'
                ? 'bg-white/10 text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            All ({lifecycleCounts.all})
          </button>
          {MODULE_LIFECYCLES.map((l) => (
            <button
              type="button"
              key={l.id}
              onClick={() => setActiveLifecycle(l.id)}
              className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors antialiased ${
                activeLifecycle === l.id
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              {l.label} ({lifecycleCounts[l.id] ?? 0})
            </button>
          ))}
        </div>
      </nav>

      {/* Category + search filter */}
      <nav className="border-b border-neutral-700/40 sticky top-0 z-20 bg-brand-900/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-5 py-3">
          <div className="mb-3">
            <label htmlFor="module-search" className="sr-only">
              Search modules by nickname, use case, category, aliases, or tags
            </label>
            <input
              id="module-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search modules by nickname, use case, page type, alias, tag, or category..."
              className="w-full rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-denim-400/60 focus:bg-white/[0.08]"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors antialiased ${
                activeCategory === 'all'
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              All ({counts.all})
            </button>
            {MODULE_CATEGORIES.map((cat) => (
              <button
                type="button"
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors antialiased ${
                  activeCategory === cat.id
                    ? 'bg-white/10 text-white'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                {cat.label} ({counts[cat.id] ?? 0})
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Module grid */}
      <main className="max-w-7xl mx-auto px-5 py-8">
        <div className="mb-5 flex items-center justify-between gap-4 text-xs text-white/40 antialiased">
          <p>
            Showing {filtered.length} module{filtered.length === 1 ? '' : 's'}
            {query.trim() ? ` for “${query.trim()}”` : ''}
          </p>
          {query.trim() && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-denim-300 hover:text-denim-200"
            >
              Clear search
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((mod) => (
            <ModuleCard key={mod.slug} mod={mod} metadataOverrides={metadataOverrides} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-sm text-white/40 antialiased">
              No modules match this lifecycle, category, and search combination.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-700/40 py-8 px-5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/30 antialiased">
          <p>Fine Diet Module Taxonomy &bull; {new Date().getFullYear()}</p>
          <div className="flex gap-4">
            <Link
              href="/style-guide"
              className="text-white/40 hover:text-white/60 transition-colors"
            >
              Design Tokens
            </Link>
            <Link
              href="/button-demo"
              className="text-white/40 hover:text-white/60 transition-colors"
            >
              Button Demo
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
