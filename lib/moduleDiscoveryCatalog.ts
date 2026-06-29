import type { ModuleDefinition } from '@/lib/moduleRegistry';
import { MODULE_STYLE_CATALOG } from '@/lib/moduleRegistry';
import { PUBLIC_PATHWAY_MODULE_STYLE_CATALOG } from '@/lib/publicPathwayModuleCatalog';
import { PUBLIC_PATHWAY_SHARED_SECTION_MODULE_STYLE_CATALOG } from '@/lib/publicPathwaySharedSectionModuleCatalog';
import { getCanonicalRuntimeModuleKey } from '@/lib/moduleDiscoveryMetadata';

function canonicalizeDiscoveryModule(mod: ModuleDefinition): ModuleDefinition {
  const runtimeKey = getCanonicalRuntimeModuleKey(mod);
  if (!runtimeKey || runtimeKey === mod.slug) return mod;
  return { ...mod, slug: runtimeKey };
}

export const MODULE_DISCOVERY_CATALOG = [
  ...MODULE_STYLE_CATALOG,
  ...PUBLIC_PATHWAY_MODULE_STYLE_CATALOG.map(canonicalizeDiscoveryModule),
  ...PUBLIC_PATHWAY_SHARED_SECTION_MODULE_STYLE_CATALOG.map(canonicalizeDiscoveryModule),
];
