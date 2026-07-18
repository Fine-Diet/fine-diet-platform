/**
 * Plans Authoring Convergence — Phase 2: thin useReducer wrapper around the
 * pure composer engine (lib/meals/composer/state.ts). Convenience for the
 * simple, uncontrolled case; callers that need to interleave composer edits
 * with their own derived state (see PlannedMealAdjustComposer) can call
 * `useReducer(composerReducer, createComposerState(...))` directly instead.
 */

import { useReducer } from 'react';

import { composerReducer, createComposerState } from '@/lib/meals/composer/state';
import type { MealComposerState } from '@/lib/meals/composer/types';
import type { MealDocument } from '@/lib/meals/types';
import type { MealComposerMode } from '@/lib/meals/composer/types';

export function useMealComposer(
  mode: MealComposerMode,
  seedDocument?: MealDocument,
  overrides?: Partial<Pick<MealComposerState, 'consumedServingsInput' | 'instanceNote'>>,
) {
  return useReducer(composerReducer, createComposerState(mode, seedDocument, overrides));
}
