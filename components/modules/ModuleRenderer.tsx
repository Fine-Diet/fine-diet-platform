/**
 * Module System v1 — Renderer Entrypoint
 *
 * Accepts a PageComposition and renders each module instance in order.
 * Unknown or unregistered module types are skipped gracefully.
 *
 * Layout modes:
 *   'flat'    — modules render as plain siblings (default; unchanged behavior
 *               for integrative-care, /p/[pageKey], program detail, etc.).
 *   'stacked' — programs marketing "card stack": the first module is the base
 *               layer (z-0, flush bottom edge) and every later module overlaps
 *               the previous one with a negative top margin on an ascending
 *               z-index. Top/bottom rounding is NOT applied by the fallback
 *               wrapper — it is opt-in via instance chrome (chrome.roundedTop /
 *               chrome.roundedBottom). z is capped BELOW the site nav (z-[60])
 *               so the top navigation always sits above every section.
 */

import { Fragment } from 'react';
import { MODULE_REGISTRY } from '@/lib/modules/registry';
import { layerZClass } from '@/components/layout/StackedPageSection';
import { resolveModuleChromeClasses, hasChromeEffect } from '@/lib/modules/sectionChrome';
import type { PageComposition } from '@/lib/modules/types';

/** Highest stacked layer index — keeps section z-index at or below z-50, under the nav's z-[60]. */
const MAX_STACK_LAYER = 5;

interface Props {
  composition: PageComposition;
  /** 'flat' (default) or 'stacked' (programs marketing layered card stack). */
  layout?: 'flat' | 'stacked';
}

export function ModuleRenderer({ composition, layout = 'flat' }: Props) {
  return (
    <>
      {composition.modules.map((mod, index) => {
        const entry = MODULE_REGISTRY[mod.type];
        if (!entry) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`[ModuleRenderer] Unknown module type: "${mod.type}" (id: ${mod.id})`);
          }
          return null;
        }

        const Component = entry.component as React.ComponentType<{ content: unknown }>;
        const node = <Component content={mod.content} />;

        // Instance-level section chrome (safe enum/token only). When present and
        // requesting a visible effect, it takes over this module's wrapper in BOTH
        // flat (editor preview) and stacked (public) layouts — independent of the
        // order-derived defaults. In stacked layout it still receives a safe
        // z-index token so the layering order is preserved.
        if (hasChromeEffect(mod.chrome)) {
          const zClass =
            layout === 'stacked'
              ? layerZClass(Math.min(index, MAX_STACK_LAYER))
              : undefined;
          return (
            <div key={mod.id} className={resolveModuleChromeClasses(mod.chrome, { zClass })}>
              {node}
            </div>
          );
        }

        if (layout !== 'stacked') {
          return <Fragment key={mod.id}>{node}</Fragment>;
        }

        // Base layer: the hero sits lowest (z-0) with a flush bottom edge so the
        // next section can overlap it cleanly.
        if (index === 0) {
          return (
            <div key={mod.id} className="relative z-0 [&>section]:rounded-b-none">
              {node}
            </div>
          );
        }

        // Later sections overlap the previous layer (negative top margin) and
        // stack above it. Top rounding is intentionally NOT applied here — module
        // top/bottom rounding is chrome-controlled (chrome.roundedTop). Layers
        // beyond MAX_STACK_LAYER share the top z-index but still paint above
        // earlier ones via document order.
        const zClass = layerZClass(Math.min(index, MAX_STACK_LAYER));
        return (
          <div key={mod.id} className={`relative -mt-8 ${zClass}`}>
            {node}
          </div>
        );
      })}
    </>
  );
}
