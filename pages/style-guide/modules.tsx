/**
 * Module Style Guide — /style-guide/modules
 *
 * Human discovery surface for reusable modules. This page reads the combined
 * discovery catalog, applies editable metadata overrides, and lets teams filter
 * by lifecycle, category, and page-family bank.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { MODULE_DISCOVERY_CATALOG } from '@/lib/moduleDiscoveryCatalog';
import {
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

const MODULE_BANKS = [
  { id: 'all', label: 'All banks' },
  { id: 'pathway', label: 'Public Pathway', tag: 'bank:pathway' },
  { id: 'programs', label: 'Programs', tag: 'bank:programs' },
  { id: 'integrative-care', label: 'Integrative Care', tag: 'bank:integrative-care' },
  { id: 'start', label: 'Start / Launch', tag: 'bank:start' },
  { id: 'offer', label: 'Offer / Purchase', tag: 'bank:offer' },
  { id: 'app-reference', label: 'App Reference', tag: 'bank:app-reference' },
] as const;

type LifecycleFilter = ModuleLifecycle | 'all';
type ModuleBankId = (typeof MODULE_BANKS)[number]['id'];

function LifecycleBadge({ lifecycle }: { lifecycle: ModuleLifecycle }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${LIFECYCLE_BADGE_STYLES[lifecycle]}`}
    >
      {LIFECYCLE_LABELS[lifecycle]}
    </span>
  );
}

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
        className="pointer-events-none absolute left-0 top-0 h-[340%] w-[340%] origin-top-left scale-[0.294] border-0 bg-neutral-950"
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
  const bankLabel = tags.find((tag) => tag.startsWith('bank:'))?.replace('bank:', '') ?? mod.category;
  const isCta = mod.category === 'cta' || mod.properties.hasButtons;
  const isGrid = mod.category === 'grid' || mod.category === 'card';
  const isAmbient = mod.category === 'ambient';

  return (
    <div className="relative h-52 w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-950 via-neutral-900 to-brand-900 p-5">
      {isAmbient ? (
        <div className="absolute inset-0 opacity-80">
          <div className="absolute -left-10 top-6 h-36 w-36 rounded-full bg-denim-500/30 blur-3xl" />
          <div className="absolute bottom-2 right-0 h-40 w-40 rounded-full bg-emerald-500/20 blur-3xl" />
        </div>
      ) : null}
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
            {bankLabel}
          </p>
          <h4 className="mt-3 max-w-[88%] text-lg font-semibold leading-tight tracking-[-0.03em] text-white antialiased">
            {metadata.humanNickname ?? mod.name}
          </h4>
          <p className="mt-2 max-w-[90%] text-xs leading-5 text-white/55 antialiased">
            {metadata.runtimeKey ?? tags.find((tag) => tag.startsWith('role:')) ?? mod.theme}
          </p>
        </div>
        {isCta ? (
          <div className="flex gap-2">
            <div className="h-9 w-28 rounded-full bg-denim-500" />
            <div className="h-9 w-20 rounded-full border border-white/30" />
          </div>
        ) : isGrid ? (
          <div className="grid grid-cols-3 gap-2">
            <div className="h-12 rounded-xl bg-white/10" />
            <div className="h-12 rounded-xl bg-white/15" />
            <div className="h-12 rounded-xl bg-white/10" />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="h-2 w-4/5 rounded bg-white/20" />
            <div className="h-2 w-3/5 rounded bg-white/10" />
            <div className="h-2 w-2/5 rounded bg-white/10" />
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

  return (
    <div className={`relative flex h-52 w-full flex-col justify-end overflow-hidden rounded-2xl p-5 ${bgClass}`}>
      {mod.properties.hasOverlay && <div className="absolute inset-0 bg-black/30" />}
      <div className="relative z-10 max-w-[85%] space-y-2">
        <div className="h-3 w-3/4 rounded bg-white/80" />
        <div className="h-2 w-1/2 rounded bg-white/40" />
        {mod.properties.hasButtons && <div className="mt-4 h-5 w-20 rounded-full bg-denim-500/80" />}
      </div>
      <div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/50">
        Abstract
      </div>
    </div>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-neutral-800/50">
      <td className="whitespace-nowrap py-2.5 pr-4 align-top text-xs font-medium text-white/40">
        {label}
      </td>
      <td className="py-2.5 font-mono text-xs leading-relaxed text-white/80">{value}</td>
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
        <PropertyRow label="Height" value={p.height} />
        <PropertyRow label="Responsive" value={p.responsiveNotes} />
        <PropertyRow label="Content-Driven" value={p.isContentDriven ? 'JSON / CMS' : 'Hardcoded'} />
      </tbody>
    </table>
  );
}

function getModuleTags(mod: ModuleDefinition, overrides?: ModuleDiscoveryMetadataMap): string[] {
  return getModuleDiscoveryMetadata(mod, overrides).tags ?? [];
}

function matchesBank(
  mod: ModuleDefinition,
  activeBank: ModuleBankId,
  overrides?: ModuleDiscoveryMetadataMap,
): boolean {
  if (activeBank === 'all') return true;
  const bank = MODULE_BANKS.find((item) => item.id === activeBank);
  if (!bank?.tag) return true;
  return getModuleTags(mod, overrides).includes(bank.tag);
}

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
  const lifecycle = getModuleLifecycle(mod);

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-700/40 bg-neutral-800/50">
      <ModuleMiniPreview mod={mod} metadataOverrides={metadataOverrides} />

      <div className="p-5">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white antialiased">{displayName}</h3>
            <p className="mt-1 truncate font-mono text-[10px] text-white/35" title={`${mod.name} · ${mod.slug}`}>
              {mod.name} · {mod.slug}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <LifecycleBadge lifecycle={lifecycle} />
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${CATEGORY_COLORS[mod.category]}`}>
              {mod.category}
            </span>
          </div>
        </div>

        {isLifecycleRuledOut(lifecycle) && (
          <p className="mb-2 text-[10px] leading-relaxed text-amber-300/80 antialiased">
            Not recommended for new builds.
          </p>
        )}

        <p className="mb-3 text-xs leading-relaxed text-white/65 antialiased">{finderDescription}</p>

        {tags.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {tags.slice(0, 8).map((tag) => (
              <span key={tag} className="rounded-full bg-denim-500/10 px-2 py-0.5 text-[10px] text-denim-200/80">
                {tag}
              </span>
            ))}
          </div>
        )}

        {mod.usedOn.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {mod.usedOn.map((page) => (
              <span key={page} className="rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] text-white/40">
                {page}
              </span>
            ))}
          </div>
        )}

        {aliases.length > 0 && (
          <p className="mb-3 truncate text-[10px] text-white/35" title={aliases.join(', ')}>
            Also searched as: {aliases.slice(0, 4).join(', ')}
          </p>
        )}

        <p className="mb-3 truncate font-mono text-[10px] text-white/30" title={mod.componentPath}>
          {mod.componentPath}
        </p>

        <div className="flex items-center gap-4">
          <Link
            href={`/style-guide/modules/${mod.slug}`}
            className="text-xs font-medium text-denim-400 transition-colors hover:text-denim-300 antialiased"
          >
            Full Preview &rarr;
          </Link>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-white/40 transition-colors hover:text-white/60 antialiased"
          >
            {expanded ? 'Hide Properties' : 'Show Properties'}
          </button>
        </div>

        {expanded && (
          <div className="mt-4 border-t border-neutral-700/40 pt-4">
            <PropertiesTable mod={mod} metadataOverrides={metadataOverrides} />
            {mod.notes && <p className="mt-3 text-xs italic leading-relaxed text-white/40">{mod.notes}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ModuleStyleGuide() {
  const [activeCategory, setActiveCategory] = useState<ModuleCategory | 'all'>('all');
  const [activeLifecycle, setActiveLifecycle] = useState<LifecycleFilter>('approved');
  const [activeBank, setActiveBank] = useState<ModuleBankId>('all');
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
    return MODULE_DISCOVERY_CATALOG.filter((mod) => {
      const categoryMatch = activeCategory === 'all' || mod.category === activeCategory;
      const lifecycleMatch = activeLifecycle === 'all' || getModuleLifecycle(mod) === activeLifecycle;
      const bankMatch = matchesBank(mod, activeBank, metadataOverrides);
      const searchMatch =
        !normalizedQuery ||
        getModuleSearchTokens(mod, metadataOverrides).join(' ').toLowerCase().includes(normalizedQuery);
      return categoryMatch && lifecycleMatch && bankMatch && searchMatch;
    });
  }, [activeCategory, activeLifecycle, activeBank, normalizedQuery, metadataOverrides]);

  const categoryCounts = useMemo(() => {
    const inScope = MODULE_DISCOVERY_CATALOG.filter((mod) => {
      const lifecycleMatch = activeLifecycle === 'all' || getModuleLifecycle(mod) === activeLifecycle;
      const bankMatch = matchesBank(mod, activeBank, metadataOverrides);
      const searchMatch =
        !normalizedQuery ||
        getModuleSearchTokens(mod, metadataOverrides).join(' ').toLowerCase().includes(normalizedQuery);
      return lifecycleMatch && bankMatch && searchMatch;
    });
    const map: Record<string, number> = { all: inScope.length };
    for (const cat of MODULE_CATEGORIES) {
      map[cat.id] = inScope.filter((mod) => mod.category === cat.id).length;
    }
    return map;
  }, [activeLifecycle, activeBank, normalizedQuery, metadataOverrides]);

  const bankCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const bank of MODULE_BANKS) {
      map[bank.id] = MODULE_DISCOVERY_CATALOG.filter((mod) => {
        const lifecycleMatch = activeLifecycle === 'all' || getModuleLifecycle(mod) === activeLifecycle;
        const searchMatch =
          !normalizedQuery ||
          getModuleSearchTokens(mod, metadataOverrides).join(' ').toLowerCase().includes(normalizedQuery);
        return lifecycleMatch && searchMatch && matchesBank(mod, bank.id, metadataOverrides);
      }).length;
    }
    return map;
  }, [activeLifecycle, normalizedQuery, metadataOverrides]);

  const lifecycleCounts = useMemo(() => {
    const map: Record<string, number> = { all: MODULE_DISCOVERY_CATALOG.length };
    for (const lifecycle of MODULE_LIFECYCLES) {
      map[lifecycle.id] = MODULE_DISCOVERY_CATALOG.filter((mod) => getModuleLifecycle(mod) === lifecycle.id).length;
    }
    return map;
  }, []);

  return (
    <div className="min-h-screen bg-brand-900 text-white">
      <header className="border-b border-neutral-700/40">
        <div className="mx-auto max-w-7xl px-5 py-10">
          <div className="mb-2 flex items-center gap-3">
            <Link href="/style-guide" className="text-xs text-white/40 transition-colors hover:text-white/60 antialiased">
              Style Guide
            </Link>
            <span className="text-white/20">/</span>
            <span className="text-xs text-white/60 antialiased">Modules</span>
          </div>
          <h1 className="mb-2 text-4xl font-semibold antialiased">Module Taxonomy</h1>
          <p className="max-w-3xl text-base font-light text-white/60 antialiased">
            Every composable section documented for discovery. Filter by category, lifecycle, or page-family bank to find approved modules for Programs, Integrative Care, Start, offers, and app references.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/40 antialiased">
            <span>{MODULE_DISCOVERY_CATALOG.length} modules total</span>
            <span>{MODULE_CATEGORIES.length} categories</span>
            <span>{metadataLoaded ? 'Editable metadata loaded' : 'Loading editable metadata...'}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/admin/module-metadata"
              className="inline-flex rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-white/60 transition hover:border-white/30 hover:text-white"
            >
              Edit module nicknames & finder copy
            </Link>
          </div>
        </div>
      </header>

      <nav className="border-b border-neutral-700/40">
        <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-5 py-3">
          <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-white/30">Lifecycle</span>
          <button
            type="button"
            onClick={() => setActiveLifecycle('all')}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors antialiased ${activeLifecycle === 'all' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}
          >
            All ({lifecycleCounts.all})
          </button>
          {MODULE_LIFECYCLES.map((lifecycle) => (
            <button
              type="button"
              key={lifecycle.id}
              onClick={() => setActiveLifecycle(lifecycle.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors antialiased ${activeLifecycle === lifecycle.id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}
            >
              {lifecycle.label} ({lifecycleCounts[lifecycle.id] ?? 0})
            </button>
          ))}
        </div>
      </nav>

      <nav className="sticky top-0 z-20 border-b border-neutral-700/40 bg-brand-900/95 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-5 py-3">
          <div className="mb-3">
            <label htmlFor="module-search" className="sr-only">
              Search modules
            </label>
            <input
              id="module-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search modules by nickname, use case, bank, page type, alias, tag, or category..."
              className="w-full rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-denim-400/60 focus:bg-white/[0.08]"
            />
          </div>

          <div className="mb-3 flex gap-2 overflow-x-auto">
            {MODULE_BANKS.map((bank) => (
              <button
                type="button"
                key={bank.id}
                onClick={() => setActiveBank(bank.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors antialiased ${activeBank === bank.id ? 'bg-denim-500/20 text-denim-200' : 'text-white/40 hover:text-white/60'}`}
              >
                {bank.label} ({bankCounts[bank.id] ?? 0})
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors antialiased ${activeCategory === 'all' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}
            >
              All categories ({categoryCounts.all})
            </button>
            {MODULE_CATEGORIES.map((cat) => (
              <button
                type="button"
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors antialiased ${activeCategory === cat.id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}
              >
                {cat.label} ({categoryCounts[cat.id] ?? 0})
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-5 flex items-center justify-between gap-4 text-xs text-white/40 antialiased">
          <p>
            Showing {filtered.length} module{filtered.length === 1 ? '' : 's'}
            {query.trim() ? ` for “${query.trim()}”` : ''}
          </p>
          {(query.trim() || activeBank !== 'all' || activeCategory !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setActiveBank('all');
                setActiveCategory('all');
              }}
              className="text-denim-300 hover:text-denim-200"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((mod) => (
            <ModuleCard key={mod.slug} mod={mod} metadataOverrides={metadataOverrides} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-sm text-white/40 antialiased">
              No modules match this lifecycle, bank, category, and search combination.
            </p>
          </div>
        )}
      </main>

      <footer className="border-t border-neutral-700/40 px-5 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-xs text-white/30 antialiased sm:flex-row">
          <p>Fine Diet Module Taxonomy &bull; {new Date().getFullYear()}</p>
          <div className="flex gap-4">
            <Link href="/style-guide" className="text-white/40 transition-colors hover:text-white/60">
              Design Tokens
            </Link>
            <Link href="/admin/module-metadata" className="text-white/40 transition-colors hover:text-white/60">
              Metadata Editor
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
