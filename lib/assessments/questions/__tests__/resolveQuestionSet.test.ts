/**
 * Tests for Question Set Resolver
 *
 * Tests resolveQuestionSet() with mocked Supabase dependencies.
 *
 * Mock strategy: `mockFrom` dispatches by table name (`question_sets`,
 * `question_set_pointers`, `question_set_revisions`) and returns a query chain
 * for each. A table's value may be a single chain (reused for every call to
 * that table) or an array of chains consumed in call order (used when the
 * resolver queries the same table multiple times with different results, e.g.
 * a pinned-revision lookup that misses then a published-revision lookup that
 * hits).
 *
 * The resolver imports `@/lib/supabaseServerClient` dynamically inside the
 * function body, so the jest.mock factory runs lazily. `mockFrom` is therefore
 * initialized eagerly at module load (the `mock`-prefixed name is permitted by
 * the babel-jest hoist checker to be referenced from the factory). beforeEach
 * uses `resetAllMocks` so each test starts from a clean mock (no
 * `mockReturnValueOnce` queue bleed across tests).
 */

import { resolveQuestionSet, type QuestionSetRef } from '../resolveQuestionSet';
import type { QuestionSet } from '../loadQuestionSet';

// Eagerly-initialized mock. The `mock` prefix lets the jest.mock factory
// reference it without tripping the babel-jest out-of-scope-variable check.
const mockFrom = jest.fn();

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

// Mock loadQuestionSet for file fallback tests.
jest.mock('../loadQuestionSet', () => ({
  loadQuestionSet: jest.fn(),
}));

import { loadQuestionSet } from '../loadQuestionSet';
const mockLoadQuestionSetFn = loadQuestionSet as jest.MockedFunction<typeof loadQuestionSet>;

/** A Supabase query chain with the methods the resolver uses. */
interface QueryChain {
  eq: jest.Mock;
  is: jest.Mock;
  maybeSingle: jest.Mock;
  single: jest.Mock;
}

/** Build a query chain whose terminal methods resolve to `resolved`. */
function chain(resolved: { data: unknown; error: unknown }): QueryChain {
  return {
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(resolved),
    single: jest.fn().mockResolvedValue(resolved),
  };
}

const NULL_CHAIN = chain({ data: null, error: null });

/**
 * Wire `mockFrom` to dispatch by table name. Each table maps to either a single
 * chain (reused per call) or an array of chains (consumed in order). Unknown
 * tables get a null chain so unexpected calls don't crash with a TypeError.
 */
function setupFrom(tables: Record<string, QueryChain | QueryChain[]>): void {
  const queues = new Map<string, QueryChain[]>();
  for (const [table, value] of Object.entries(tables)) {
    queues.set(table, Array.isArray(value) ? [...value] : [value]);
  }
  mockFrom.mockImplementation((table: string) => {
    const q = queues.get(table);
    let c: QueryChain;
    if (q && q.length > 0) {
      // Reuse the single chain for every call; drain only when an array was given.
      c = Array.isArray(tables[table]) ? q.shift()! : q[0];
    } else {
      c = NULL_CHAIN;
    }
    return { select: jest.fn().mockReturnValue(c) };
  });
}

describe('resolveQuestionSet', () => {
  const mockQuestionSet: QuestionSet = {
    version: '2',
    assessmentType: 'gut-check',
    sections: [{ id: 'section1', title: 'Section 1', questionIds: ['q1'] }],
    questions: [
      {
        id: 'q1',
        text: 'Question 1',
        options: [
          { id: 'o1-0', label: 'Option 0', value: 0 },
          { id: 'o1-1', label: 'Option 1', value: 1 },
          { id: 'o1-2', label: 'Option 2', value: 2 },
          { id: 'o1-3', label: 'Option 3', value: 3 },
        ],
      },
    ],
  };

  const revisionRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    content_json: mockQuestionSet,
    content_hash: 'rev-hash',
    schema_version: 'v2_question_schema_1',
    created_at: '2024-01-02T00:00:00Z',
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('resolver precedence: pinned beats preview/published', () => {
    it('should return pinned revision when pinnedQuestionsRef exists', async () => {
      const pinnedRevisionId = 'pinned-rev-1';
      const pinnedRef: QuestionSetRef = {
        source: 'cms',
        questionSetId: 'qs-1',
        publishedRevisionId: pinnedRevisionId,
        contentHash: 'pinned-hash',
        resolvedAt: '2024-01-01T00:00:00Z',
      };

      const revChain = chain({
        data: revisionRow({ content_hash: 'pinned-hash' }),
        error: null,
      });

      setupFrom({ question_set_revisions: revChain });

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
        pinnedQuestionsRef: pinnedRef,
      });

      expect(result.source).toBe('cms');
      expect(result.questionSetRef).toBe(pinnedRef);
      expect(result.contentHash).toBe('pinned-hash');
      expect(result.isPreview).toBeUndefined();
      expect(mockFrom).toHaveBeenCalledWith('question_set_revisions');
      expect(revChain.eq).toHaveBeenCalledWith('id', pinnedRevisionId);
    });

    it('should fall back to published pointer when pinned revision not found', async () => {
      const pinnedRef: QuestionSetRef = {
        source: 'cms',
        questionSetId: 'qs-1',
        publishedRevisionId: 'pinned-rev-not-found',
        contentHash: 'pinned-hash',
        resolvedAt: '2024-01-01T00:00:00Z',
      };

      setupFrom({
        // Pinned revision lookup misses (error), then published revision hits.
        question_set_revisions: [
          chain({ data: null, error: { code: 'PGRST116', message: 'Not found' } }),
          chain({ data: revisionRow({ content_hash: 'published-hash' }), error: null }),
        ],
        question_sets: chain({ data: { id: 'qs-1' }, error: null }),
        question_set_pointers: chain({
          data: { preview_revision_id: 'preview-rev-1', published_revision_id: 'published-rev-1' },
          error: null,
        }),
      });

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
        pinnedQuestionsRef: pinnedRef,
      });

      expect(result.source).toBe('cms');
      expect(result.contentHash).toBe('published-hash');
      expect(result.questionSetRef?.publishedRevisionId).toBe('published-rev-1');
    });
  });

  describe('preview gating', () => {
    const identityRow = { id: 'qs-1' };
    const pointerRow = {
      data: { preview_revision_id: 'preview-rev-1', published_revision_id: 'published-rev-1' },
      error: null,
    };

    it('should return published (not preview) when preview=1 but user is logged-out', async () => {
      setupFrom({
        question_sets: chain({ data: identityRow, error: null }),
        question_set_pointers: chain(pointerRow),
        question_set_revisions: chain({
          data: revisionRow({ content_hash: 'published-hash' }),
          error: null,
        }),
      });

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
        preview: true,
        userRole: undefined, // Logged-out
      });

      expect(result.source).toBe('cms');
      expect(result.contentHash).toBe('published-hash');
      expect(result.isPreview).toBeUndefined();
      expect(result.questionSetRef?.publishedRevisionId).toBe('published-rev-1');
    });

    it('should return published (not preview) when preview=1 but role=user', async () => {
      setupFrom({
        question_sets: chain({ data: identityRow, error: null }),
        question_set_pointers: chain(pointerRow),
        question_set_revisions: chain({
          data: revisionRow({ content_hash: 'published-hash' }),
          error: null,
        }),
      });

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
        preview: true,
        userRole: 'user',
      });

      expect(result.source).toBe('cms');
      expect(result.contentHash).toBe('published-hash');
      expect(result.isPreview).toBeUndefined();
      expect(result.questionSetRef?.publishedRevisionId).toBe('published-rev-1');
    });

    it('should return preview revision when preview=1 and role=editor', async () => {
      setupFrom({
        question_sets: chain({ data: identityRow, error: null }),
        question_set_pointers: chain(pointerRow),
        question_set_revisions: chain({
          data: revisionRow({ content_hash: 'preview-hash' }),
          error: null,
        }),
      });

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
        preview: true,
        userRole: 'editor',
      });

      expect(result.source).toBe('cms');
      expect(result.contentHash).toBe('preview-hash');
      expect(result.isPreview).toBe(true);
      expect(result.questionSetRef?.previewRevisionId).toBe('preview-rev-1');
    });

    it('should return preview revision when preview=1 and role=admin', async () => {
      setupFrom({
        question_sets: chain({ data: identityRow, error: null }),
        question_set_pointers: chain(pointerRow),
        question_set_revisions: chain({
          data: revisionRow({ content_hash: 'preview-hash' }),
          error: null,
        }),
      });

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
        preview: true,
        userRole: 'admin',
      });

      expect(result.source).toBe('cms');
      expect(result.contentHash).toBe('preview-hash');
      expect(result.isPreview).toBe(true);
      expect(result.questionSetRef?.previewRevisionId).toBe('preview-rev-1');
    });
  });

  describe('pinning regression', () => {
    it('should return pinned revision even when pointers have changed', async () => {
      const pinnedRevisionId = 'rev-1';
      const pinnedRef: QuestionSetRef = {
        source: 'cms',
        questionSetId: 'qs-1',
        publishedRevisionId: pinnedRevisionId,
        contentHash: 'rev1-hash',
        resolvedAt: '2024-01-01T00:00:00Z',
      };

      const revChain = chain({
        data: revisionRow({ content_hash: 'rev1-hash' }),
        error: null,
      });

      setupFrom({ question_set_revisions: revChain });

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
        pinnedQuestionsRef: pinnedRef,
      });

      expect(result.source).toBe('cms');
      expect(result.questionSetRef).toBe(pinnedRef);
      expect(result.contentHash).toBe('rev1-hash');
      expect(revChain.eq).toHaveBeenCalledWith('id', pinnedRevisionId);
      // Should NOT query pointers or published revision.
      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(mockFrom).toHaveBeenCalledWith('question_set_revisions');
    });
  });

  describe('file fallback', () => {
    it('should fall back to file loader when no CMS identity exists', async () => {
      // Both the existence check and the fetchQuestionSetFromCMS identity
      // lookup return null (no CMS row), so the resolver falls to the file
      // loader. Real callers (resolveAssessmentExperience, the API route)
      // pass locale: null; the test mirrors that.
      setupFrom({
        question_sets: chain({ data: null, error: null }),
      });
      mockLoadQuestionSetFn.mockReturnValue(mockQuestionSet);

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
        locale: null,
      });

      expect(result.source).toBe('file');
      expect(result.questionSet).toEqual(mockQuestionSet);
      expect(result.questionSetRef?.source).toBe('file');
      expect(mockLoadQuestionSetFn).toHaveBeenCalledWith({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
        locale: null,
      });
    });

    it('should return cms_empty when question set exists but no pointers are set', async () => {
      // Existence + identity lookups find the row; the pointer lookup (called
      // from both fetchQuestionSetFromCMS and the Step-5 cms_empty check)
      // returns no row, so the resolver returns cms_empty without touching the
      // file loader.
      setupFrom({
        question_sets: chain({
          data: { id: 'qs-1', assessment_type: 'gut-check', assessment_version: '2', locale: null },
          error: null,
        }),
        question_set_pointers: chain({ data: null, error: null }),
      });

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
        locale: null,
      });

      expect(result.source).toBe('cms_empty');
      expect(result.questionSetId).toBe('qs-1');
      expect(result.questionSet).toBeUndefined();
      expect(mockLoadQuestionSetFn).not.toHaveBeenCalled();
    });

    it('should return cms_empty when question set exists but both pointer IDs are null', async () => {
      setupFrom({
        question_sets: chain({
          data: { id: 'qs-1', assessment_type: 'gut-check', assessment_version: '2', locale: null },
          error: null,
        }),
        question_set_pointers: chain({
          data: { preview_revision_id: null, published_revision_id: null },
          error: null,
        }),
      });

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
        locale: null,
      });

      expect(result.source).toBe('cms_empty');
      expect(result.questionSetId).toBe('qs-1');
      expect(result.questionSet).toBeUndefined();
      expect(mockLoadQuestionSetFn).not.toHaveBeenCalled();
    });

    it('should fall back to file loader when published revision not found', async () => {
      // Identity + pointer resolve, but the published revision lookup misses,
      // so fetchQuestionSetFromCMS returns null and the resolver falls to the
      // file loader.
      setupFrom({
        question_sets: chain({ data: { id: 'qs-1' }, error: null }),
        question_set_pointers: chain({
          data: { preview_revision_id: null, published_revision_id: 'rev-not-found' },
          error: null,
        }),
        question_set_revisions: chain({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' },
        }),
      });
      mockLoadQuestionSetFn.mockReturnValue(mockQuestionSet);

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
        locale: null,
      });

      expect(result.source).toBe('file');
      expect(result.questionSet).toEqual(mockQuestionSet);
      expect(mockLoadQuestionSetFn).toHaveBeenCalled();
    });
  });
});
