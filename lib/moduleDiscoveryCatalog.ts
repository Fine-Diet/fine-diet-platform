/**
 * Module Discovery Catalog
 *
 * Human-facing catalog used by style-guide/admin discovery surfaces.
 * Combines the original style-guide catalog with public pathway runtime modules
 * without merging runtime registries.
 */

import { MODULE_STYLE_CATALOG } from '@/lib/moduleRegistry';
import { PUBLIC_PATHWAY_MODULE_STYLE_CATALOG } from '@/lib/publicPathwayModuleCatalog';
import { START_PATHWAY_MODULE_STYLE_CATALOG } from '@/lib/startPathwayModuleCatalog';

export const MODULE_DISCOVERY_CATALOG = [
  ...MODULE_STYLE_CATALOG,
  ...PUBLIC_PATHWAY_MODULE_STYLE_CATALOG,
  ...START_PATHWAY_MODULE_STYLE_CATALOG,
];
