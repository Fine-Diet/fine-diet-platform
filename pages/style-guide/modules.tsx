/**
 * Module Style Guide — /style-guide/modules
 *
 * Visual taxonomy of every reusable page-building module in the system.
 * Each module shows a live mini-preview, detailed property table,
 * variant list, and the source component path.
 *
 * Additive only — this page has no side effects on existing components.
 */

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  MODULE_STYLE_CATALOG,
  MODULE_CATEGORIES,
  type ModuleCategory,
  type ModuleDefinition,
} from '@/lib/moduleRegistry';

/* ------------------------------------------------------------------ */
/*  Preview thumbnails — static visual representation per category     */
/* ------------------------------------------------------------------ */

function ModulePreview({ mod }: { mod: ModuleDefinition }) {
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
            <div className="h-4 w-14 rounded-full bg-dark_accent-500/80" />
            {(mod.properties.buttonVariants?.length ?? 0) > 1 && (
              <div className="h-4 w-12 rounded-full border border-white/40" />
            )}
          </div>
        )}
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

function PropertiesTable({ mod }: { mod: ModuleDefinition }) {
  const p = mod.properties;
  return (
    <table className="w-full">
      <tbody>
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

function ModuleCard({ mod }: { mod: ModuleDefinition }) {
  const [expanded, setExpanded] = useState(false);

  const categoryColors: Record<ModuleCategory, string> = {
    hero: 'bg-amber-500/20 text-amber-300',
    content: 'bg-blue-500/20 text-blue-300',
    grid: 'bg-purple-500/20 text-purple-300',
    cta: 'bg-emerald-500/20 text-emerald-300',
    card: 'bg-cyan-500/20 text-cyan-300',
    form: 'bg-pink-500/20 text-pink-300',
    ambient: 'bg-orange-500/20 text-orange-300',
  };

  return (
    <div className="rounded-2xl bg-neutral-800/50 border border-neutral-700/40 overflow-hidden">
      {/* Preview */}
      <ModulePreview mod={mod} />

      {/* Info */}
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-base font-semibold text-white antialiased">{mod.name}</h3>
          <span
            className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
              categoryColors[mod.category]
            }`}
          >
            {mod.category}
          </span>
        </div>

        <p className="text-xs text-white/60 leading-relaxed mb-3 antialiased">
          {mod.description}
        </p>

        {/* Used on */}
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

        {/* Component path */}
        <p className="text-[10px] text-white/30 font-mono truncate mb-3" title={mod.componentPath}>
          {mod.componentPath}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <Link
            href={`/style-guide/modules/${mod.slug}`}
            className="text-xs font-medium text-dark_accent-400 hover:text-dark_accent-300 transition-colors antialiased"
          >
            Full Preview &rarr;
          </Link>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-white/40 hover:text-white/60 transition-colors antialiased"
          >
            {expanded ? 'Hide Properties' : 'Show Properties'}
          </button>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-neutral-700/40">
            <PropertiesTable mod={mod} />
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

export default function ModuleStyleGuide() {
  const [activeCategory, setActiveCategory] = useState<ModuleCategory | 'all'>('all');

  const filtered = useMemo(() => {
    if (activeCategory === 'all') return MODULE_STYLE_CATALOG;
    return MODULE_STYLE_CATALOG.filter((m) => m.category === activeCategory);
  }, [activeCategory]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: MODULE_STYLE_CATALOG.length };
    for (const cat of MODULE_CATEGORIES) {
      map[cat.id] = MODULE_STYLE_CATALOG.filter((m) => m.category === cat.id).length;
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
          <div className="mt-4 flex items-center gap-4 text-xs text-white/40 antialiased">
            <span>{MODULE_STYLE_CATALOG.length} modules</span>
            <span>{MODULE_CATEGORIES.length} categories</span>
          </div>
        </div>
      </header>

      {/* Category filter */}
      <nav className="border-b border-neutral-700/40 sticky top-0 z-20 bg-brand-900/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-5 py-3 flex gap-2 overflow-x-auto">
          <button
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
      </nav>

      {/* Module grid */}
      <main className="max-w-7xl mx-auto px-5 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((mod) => (
            <ModuleCard key={mod.slug} mod={mod} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-sm text-white/40 antialiased">No modules in this category.</p>
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
