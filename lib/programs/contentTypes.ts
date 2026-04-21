/**
 * Plans Phase 12 — Program content types
 *
 * Shared TypeScript shapes for the three program content tables:
 *   programs, program_modules, program_content_items.
 *
 * The user-facing library/detail adapters in `programLibraryServerService`
 * and `catalogue.ts` also map to these types.
 */

export type ProgramStatus = 'draft' | 'published' | 'archived';
export const PROGRAM_STATUSES: ProgramStatus[] = [
  'draft',
  'published',
  'archived',
];

export type ProgramContentItemType =
  | 'article'
  | 'guidance'
  | 'video'
  | 'milestone';
export const PROGRAM_CONTENT_ITEM_TYPES: ProgramContentItemType[] = [
  'article',
  'guidance',
  'video',
  'milestone',
];

export interface Program {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  description: string | null;
  storefront_href: string | null;
  status: ProgramStatus;
  metadata: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgramModule {
  id: string;
  program_id: string;
  title: string;
  description: string | null;
  ordinal: number;
  status: ProgramStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProgramContentItem {
  id: string;
  module_id: string;
  item_type: ProgramContentItemType;
  title: string;
  summary: string | null;
  body: string | null;
  video_url: string | null;
  video_provider: string | null;
  estimated_minutes: number | null;
  ordinal: number;
  status: ProgramStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Tree view of a program, used by the admin editor and the user-facing
 * detail page. Modules sorted by ordinal; items sorted by ordinal
 * within each module.
 */
export interface ProgramWithTree {
  program: Program;
  modules: Array<{
    module: ProgramModule;
    items: ProgramContentItem[];
  }>;
}
