/**
 * Module System v1 — Renderer Entrypoint
 *
 * Accepts a PageComposition and renders each module instance in order.
 * Unknown or unregistered module types are skipped gracefully.
 */

import { MODULE_REGISTRY } from '@/lib/modules/registry';
import type { PageComposition } from '@/lib/modules/types';

interface Props {
  composition: PageComposition;
}

export function ModuleRenderer({ composition }: Props) {
  return (
    <>
      {composition.modules.map((mod) => {
        const entry = MODULE_REGISTRY[mod.type];
        if (!entry) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`[ModuleRenderer] Unknown module type: "${mod.type}" (id: ${mod.id})`);
          }
          return null;
        }

        const Component = entry.component as React.ComponentType<{ content: unknown }>;
        return <Component key={mod.id} content={mod.content} />;
      })}
    </>
  );
}
