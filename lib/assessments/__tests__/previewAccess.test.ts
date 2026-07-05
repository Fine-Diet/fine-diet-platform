/**
 * Tests for the shared preview-gating helper and the cover→start query builder.
 *
 * `canPreview` is the single source of truth for who can view unpublished
 * revisions; the four call sites (resolveQuestionSet, resolveResultsPack,
 * resolveAssessmentExperience, /api/question-sets/resolve) delegate to it, so
 * this file is the authoritative preview-propagation matrix.
 *
 * `buildAssessmentStartQuery` carries `v` and `preview=1` from the cover CTA to
 * the start route and intentionally drops `submission_id` so the cover CTA
 * always starts a clean runner flow.
 */

import { canPreview } from '../previewAccess';
import { buildAssessmentStartQuery } from '../resolveAssessmentExperience';

describe('canPreview', () => {
  it('returns true for editor and admin', () => {
    expect(canPreview('editor')).toBe(true);
    expect(canPreview('admin')).toBe(true);
  });

  it('returns false for user, staff, and coach', () => {
    expect(canPreview('user')).toBe(false);
    expect(canPreview('staff')).toBe(false);
    expect(canPreview('coach')).toBe(false);
  });

  it('returns false for null/undefined/empty/unknown roles', () => {
    expect(canPreview(null)).toBe(false);
    expect(canPreview(undefined)).toBe(false);
    expect(canPreview('')).toBe(false);
    expect(canPreview('superuser')).toBe(false);
  });
});

describe('buildAssessmentStartQuery', () => {
  it('carries the version param', () => {
    expect(buildAssessmentStartQuery({ v: '2' })).toBe('?v=2');
  });

  it('carries preview=1 when present', () => {
    expect(buildAssessmentStartQuery({ v: '3', preview: '1' })).toBe('?v=3&preview=1');
  });

  it('drops submission_id so the cover CTA starts a clean runner flow', () => {
    const qs = buildAssessmentStartQuery({ v: '2', submission_id: 'sub-123', preview: '1' });
    expect(qs).toBe('?v=2&preview=1');
    expect(qs).not.toContain('submission_id');
  });

  it('omits preview when it is not "1"', () => {
    expect(buildAssessmentStartQuery({ v: '2', preview: '0' })).toBe('?v=2');
    expect(buildAssessmentStartQuery({ v: '2', preview: undefined })).toBe('?v=2');
  });

  it('returns an empty string when no params should be carried', () => {
    expect(buildAssessmentStartQuery({})).toBe('');
    expect(buildAssessmentStartQuery({ submission_id: 'sub-1' })).toBe('');
  });

  it('uses the first element when query params are arrays', () => {
    expect(buildAssessmentStartQuery({ v: ['3', '4'], preview: ['1', '0'] })).toBe(
      '?v=3&preview=1'
    );
  });
});
