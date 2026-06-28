import { MODULE_STYLE_CATALOG } from '@/lib/moduleRegistry';
import { PUBLIC_PATHWAY_MODULE_STYLE_CATALOG } from '@/lib/publicPathwayModuleCatalog';

export const MODULE_DISCOVERY_CATALOG = [
  ...MODULE_STYLE_CATALOG,
  ...PUBLIC_PATHWAY_MODULE_STYLE_CATALOG,
];
