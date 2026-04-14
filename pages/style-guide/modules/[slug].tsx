/**
 * Module Detail — /style-guide/modules/[slug]
 *
 * Full-scale, true-to-life rendering of each page module with:
 * - Iframe-based responsive preview (real viewport media queries)
 * - Variant selector
 * - Collapsible property inspector
 *
 * The actual component renders in an iframe at
 * /style-guide/modules/embed/[slug]?variant=... so that Tailwind
 * breakpoints (sm:, md:, lg:) fire correctly at the iframe width.
 *
 * Additive only — imports existing components but never modifies them.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { GetStaticPaths, GetStaticProps } from 'next';
import Link from 'next/link';
import Head from 'next/head';

import {
  MODULE_STYLE_CATALOG,
  type ModuleDefinition,
  type ModuleCategory,
} from '@/lib/moduleRegistry';

/* ------------------------------------------------------------------ */
/*  Viewport widths                                                    */
/* ------------------------------------------------------------------ */

type ViewportSize = 'mobile' | 'tablet' | 'desktop';

const VIEWPORT_PX: Record<ViewportSize, number | null> = {
  mobile: 375,
  tablet: 768,
  desktop: null,
};

/* ------------------------------------------------------------------ */
/*  Variant definitions per slug                                       */
/* ------------------------------------------------------------------ */

const VARIANT_OPTIONS: Record<string, string[]> = {
  hero: ['dual-cta', 'single-cta'],
  'hero-medium': ['dual-cta', 'single-cta'],
  'feature-card': ['multi-slide-carousel', 'single-slide'],
  'grid-2col': ['with-image', 'solid-background'],
  'grid-2col-medium': ['with-image', 'solid-background'],
  'cta-banner': ['with-image', 'solid-background', 'no-description'],
  button: ['primary', 'secondary', 'tertiary', 'quaternary'],
  'buy-offer-button': ['primary', 'secondary', 'ghost'],
  'meal-section': ['empty', 'with-food-items', 'translucent'],
  'journal-hero': ['default'],
  'aurora-background': ['default'],
  'access-card': ['active', 'inactive', 'expiring-soon'],
  'quick-action': ['default', 'accent'],
  'recommendation-card': ['default'],
  'form-panel': ['default'],
  'section-label': ['default'],
};

/* ------------------------------------------------------------------ */
/*  Auto-resizing iframe                                               */
/* ------------------------------------------------------------------ */

function PreviewFrame({
  slug,
  variant,
  widthPx,
}: {
  slug: string;
  variant: string;
  widthPx: number | null;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(600);

  const syncHeight = useCallback(() => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      const h = doc.documentElement.scrollHeight;
      if (h > 0) setHeight(h);
    } catch {
      // cross-origin guard (won't happen for same-origin)
    }
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const onLoad = () => {
      syncHeight();
      const interval = setInterval(syncHeight, 500);
      setTimeout(() => clearInterval(interval), 8000);
    };

    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [syncHeight]);

  useEffect(() => {
    syncHeight();
  }, [widthPx, variant, syncHeight]);

  const src = `/style-guide/modules/embed/${slug}?variant=${encodeURIComponent(variant)}`;

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={`${slug} preview`}
      className="border-0 block bg-brand-900"
      style={{
        width: widthPx ? `${widthPx}px` : '100%',
        height: `${height}px`,
        transition: 'width 0.3s ease',
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Property Inspector                                                 */
/* ------------------------------------------------------------------ */

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-neutral-700/30">
      <td className="py-2 pr-3 text-[11px] font-medium text-white/40 whitespace-nowrap align-top">
        {label}
      </td>
      <td className="py-2 text-[11px] text-white/70 font-mono leading-relaxed">{value}</td>
    </tr>
  );
}

function PropertyInspector({ mod }: { mod: ModuleDefinition }) {
  const p = mod.properties;
  return (
    <div className="bg-neutral-900/80 border border-neutral-700/40 rounded-xl p-4 text-white">
      <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
        Properties
      </h3>
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
          <PropertyRow
            label="Overlay"
            value={p.hasOverlay ? p.overlayStyle || 'yes' : 'none'}
          />
          <PropertyRow label="Responsive" value={p.responsiveNotes} />
          {p.hasButtons && (
            <PropertyRow label="Buttons" value={p.buttonVariants?.join(', ') || 'yes'} />
          )}
          <PropertyRow
            label="Content-Driven"
            value={p.isContentDriven ? 'JSON / CMS' : 'Hardcoded'}
          />
        </tbody>
      </table>
      {mod.notes && (
        <p className="mt-3 text-[11px] text-white/30 leading-relaxed italic">{mod.notes}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

interface ModuleDetailProps {
  mod: ModuleDefinition;
}

export default function ModuleDetailPage({ mod }: ModuleDetailProps) {
  const variants = VARIANT_OPTIONS[mod.slug] || ['default'];
  const [activeVariant, setActiveVariant] = useState(variants[0]);
  const [viewport, setViewport] = useState<ViewportSize>('desktop');
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const categoryColors: Record<ModuleCategory, string> = {
    hero: 'bg-amber-500/20 text-amber-300',
    content: 'bg-blue-500/20 text-blue-300',
    grid: 'bg-purple-500/20 text-purple-300',
    cta: 'bg-emerald-500/20 text-emerald-300',
    card: 'bg-cyan-500/20 text-cyan-300',
    form: 'bg-pink-500/20 text-pink-300',
    ambient: 'bg-orange-500/20 text-orange-300',
  };

  const currentWidth = VIEWPORT_PX[viewport];

  return (
    <>
      <Head>
        <title>{mod.name} &bull; Module Guide &bull; Fine Diet</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white">
        {/* ── Top bar ──────────────────────────────────────────── */}
        <header className="border-b border-neutral-700/40 bg-neutral-900 sticky top-0 z-30">
          <div className="max-w-[1600px] mx-auto px-5 py-4 flex items-center justify-between gap-4">
            {/* Left: breadcrumb + title */}
            <div className="flex items-center gap-3 min-w-0">
              <Link
                href="/style-guide/modules"
                className="text-xs text-white/40 hover:text-white/60 transition-colors antialiased shrink-0"
              >
                &larr; All Modules
              </Link>
              <span className="text-white/20 shrink-0">/</span>
              <h1 className="text-sm font-semibold antialiased truncate">{mod.name}</h1>
              <span
                className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${categoryColors[mod.category]}`}
              >
                {mod.category}
              </span>
            </div>

            {/* Right: controls */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Viewport toggle */}
              <div className="flex bg-neutral-800/60 rounded-full p-0.5">
                {(['mobile', 'tablet', 'desktop'] as ViewportSize[]).map((size) => (
                  <button
                    key={size}
                    onClick={() => setViewport(size)}
                    className={`text-[10px] font-medium px-3 py-1 rounded-full transition-colors antialiased ${
                      viewport === size
                        ? 'bg-white/10 text-white'
                        : 'text-white/40 hover:text-white/60'
                    }`}
                  >
                    {size === 'mobile' ? '375px' : size === 'tablet' ? '768px' : 'Full'}
                  </button>
                ))}
              </div>

              {/* Inspector toggle */}
              <button
                onClick={() => setInspectorOpen(!inspectorOpen)}
                className={`text-[10px] font-medium px-3 py-1.5 rounded-full transition-colors antialiased ${
                  inspectorOpen
                    ? 'bg-denim-500/20 text-denim-300'
                    : 'bg-neutral-800/60 text-white/40 hover:text-white/60'
                }`}
              >
                {inspectorOpen ? 'Hide Specs' : 'Show Specs'}
              </button>
            </div>
          </div>

          {/* Variant selector */}
          {variants.length > 1 && (
            <div className="max-w-[1600px] mx-auto px-5 pb-3 flex gap-2 overflow-x-auto">
              {variants.map((v) => (
                <button
                  key={v}
                  onClick={() => setActiveVariant(v)}
                  className={`shrink-0 text-[11px] font-medium px-3 py-1 rounded-full border transition-colors antialiased ${
                    activeVariant === v
                      ? 'border-white/30 text-white bg-white/10'
                      : 'border-white/10 text-white/40 hover:text-white/60'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </header>

        {/* ── Body ─────────────────────────────────────────────── */}
        <div className="flex">
          {/* Main preview area */}
          <main className="flex-1 min-w-0">
            {/* Description bar */}
            <div className="max-w-[1600px] mx-auto px-5 py-4 border-b border-neutral-800/60">
              <p className="text-xs text-white/50 leading-relaxed antialiased max-w-3xl">
                {mod.description}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {mod.usedOn.map((page) => (
                  <span
                    key={page}
                    className="text-[10px] text-white/30 bg-white/5 rounded px-2 py-0.5 font-mono"
                  >
                    {page}
                  </span>
                ))}
              </div>
            </div>

            {/* Iframe render container */}
            <div className="flex justify-center py-8 px-5">
              <div
                className="overflow-hidden rounded-xl border border-neutral-700/30 shadow-lg transition-all duration-300"
                style={{ width: currentWidth ? `${currentWidth}px` : '100%' }}
              >
                <PreviewFrame
                  slug={mod.slug}
                  variant={activeVariant}
                  widthPx={currentWidth}
                />
              </div>
            </div>

            {/* Component path */}
            <div className="max-w-[1600px] mx-auto px-5 pb-8">
              <p className="text-[10px] text-white/20 font-mono">
                Source: {mod.componentPath}
              </p>
            </div>
          </main>

          {/* Inspector sidebar */}
          {inspectorOpen && (
            <aside className="w-80 shrink-0 border-l border-neutral-700/40 p-5 overflow-y-auto max-h-[calc(100vh-60px)] sticky top-[60px]">
              <PropertyInspector mod={mod} />

              {mod.variants.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
                    Variants
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {mod.variants.map((v) => (
                      <span
                        key={v}
                        className="text-[10px] text-white/50 border border-white/10 rounded-full px-2 py-0.5"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Static generation                                                  */
/* ------------------------------------------------------------------ */

export const getStaticPaths: GetStaticPaths = async () => {
  const paths = MODULE_STYLE_CATALOG.map((mod) => ({
    params: { slug: mod.slug },
  }));
  return { paths, fallback: false };
};

export const getStaticProps: GetStaticProps<ModuleDetailProps> = async ({ params }) => {
  const slug = params?.slug as string;
  const mod = MODULE_STYLE_CATALOG.find((m) => m.slug === slug);

  if (!mod) {
    return { notFound: true };
  }

  return {
    props: { mod },
  };
};
