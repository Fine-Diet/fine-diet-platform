/**
 * Package 3 — Archived library discovery helpers.
 */

import {
  applyLifecycleChangeToLibraryResults,
  paramsForLibraryFilter,
  selectResultsForLibraryFilter,
  type LibraryListItem,
} from '../libraryView';

function item(
  id: string,
  archived: boolean,
  kind: 'meal' | 'recipe' = 'meal',
): LibraryListItem {
  return { id, document_kind: kind, archived };
}

describe('paramsForLibraryFilter', () => {
  it('requests archived_only for the Archived view', () => {
    expect(paramsForLibraryFilter('archived')).toEqual({
      mode: 'all',
      archived_only: true,
    });
    expect(paramsForLibraryFilter('all').archived_only).toBeUndefined();
    expect(paramsForLibraryFilter('meals')).toEqual({ mode: 'meals' });
    expect(paramsForLibraryFilter('recipes')).toEqual({ mode: 'recipes' });
    expect(paramsForLibraryFilter('needs_review')).toEqual({
      mode: 'all',
      review_state: 'needs_review',
    });
  });
});

describe('selectResultsForLibraryFilter', () => {
  const rows = [
    item('a', false),
    item('b', true),
    item('c', false, 'recipe'),
    item('d', true, 'recipe'),
  ];

  it('shows only archived rows in the Archived view', () => {
    expect(selectResultsForLibraryFilter(rows, 'archived').map((r) => r.id)).toEqual([
      'b',
      'd',
    ]);
  });

  it('excludes archived rows from active views', () => {
    expect(selectResultsForLibraryFilter(rows, 'all').map((r) => r.id)).toEqual([
      'a',
      'c',
    ]);
    expect(selectResultsForLibraryFilter(rows, 'meals').map((r) => r.id)).toEqual([
      'a',
      'c',
    ]);
    expect(
      selectResultsForLibraryFilter(rows, 'needs_review').map((r) => r.id),
    ).toEqual(['a', 'c']);
  });
});

describe('applyLifecycleChangeToLibraryResults', () => {
  it('removes a restored item from the Archived view immediately', () => {
    const results = [item('a', true), item('b', true)];
    const next = applyLifecycleChangeToLibraryResults(results, 'archived', {
      id: 'a',
      lifecycle_state: 'active',
      archived_at: null,
    });
    expect(next.map((r) => r.id)).toEqual(['b']);
  });

  it('removes an archived item from active views', () => {
    const results = [item('a', false), item('b', false)];
    const next = applyLifecycleChangeToLibraryResults(results, 'all', {
      id: 'a',
      lifecycle_state: 'archived',
      archived_at: '2026-07-31T00:00:00.000Z',
    });
    expect(next.map((r) => r.id)).toEqual(['b']);
  });

  it('keeps a restored item visible on an active view', () => {
    const results = [item('a', false)];
    const next = applyLifecycleChangeToLibraryResults(results, 'all', {
      id: 'a',
      lifecycle_state: 'active',
      archived_at: null,
      title: 'Restored',
    } as LibraryListItem & {
      id: string;
      lifecycle_state: 'active';
      archived_at: null;
      title: string;
    });
    expect(next).toHaveLength(1);
    expect(next[0].archived).toBe(false);
  });
});
