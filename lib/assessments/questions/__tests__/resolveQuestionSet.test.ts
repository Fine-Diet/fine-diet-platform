/**
 * Tests for Question Set Resolver
 * 
 * Tests resolveQuestionSet() with mocked Supabase dependencies
 */

import { resolveQuestionSet, type QuestionSetRef } from '../resolveQuestionSet';
import type { QuestionSet } from '../loadQuestionSet';

// Mock Supabase client (handles dynamic import)
// Create mock function that will be shared between factory and tests
let mockFrom!: jest.Mock;

jest.mock('@/lib/supabaseServerClient', () => {
  mockFrom = jest.fn();
  return {
    supabaseAdmin: {
      from: mockFrom,
    },
  };
});

// Mock loadQuestionSet for file fallback tests
jest.mock('../loadQuestionSet', () => ({
  loadQuestionSet: jest.fn(),
}));

// Import loadQuestionSet to get the mocked version
import { loadQuestionSet } from '../loadQuestionSet';
const mockLoadQuestionSetFn = loadQuestionSet as jest.MockedFunction<typeof loadQuestionSet>;

describe('resolveQuestionSet', () => {
  const mockQuestionSet: QuestionSet = {
    version: '2',
    assessmentType: 'gut-check',
    sections: [
      {
        id: 'section1',
        title: 'Section 1',
        questionIds: ['q1'],
      },
    ],
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

  beforeEach(() => {
    jest.clearAllMocks();
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

      // Mock Supabase query chain for pinned revision
      const mockQueryChain = {
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            content_json: mockQuestionSet,
            content_hash: 'pinned-hash',
            schema_version: 'v2_question_schema_1',
            created_at: '2024-01-01T00:00:00Z',
          },
          error: null,
        }),
      };

      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue(mockQueryChain),
        }),
      } as any);

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
        pinnedQuestionsRef: pinnedRef,
      });

      expect(result.source).toBe('cms');
      expect(result.questionSetRef).toBe(pinnedRef); // Should return existing ref
      expect(result.contentHash).toBe('pinned-hash');
      expect(result.isPreview).toBeUndefined();
      expect(mockFrom).toHaveBeenCalledWith('question_set_revisions');
    });

    it('should fall back to published pointer when pinned revision not found', async () => {
      const pinnedRevisionId = 'pinned-rev-not-found';
      const pinnedRef: QuestionSetRef = {
        source: 'cms',
        questionSetId: 'qs-1',
        publishedRevisionId: pinnedRevisionId,
        contentHash: 'pinned-hash',
        resolvedAt: '2024-01-01T00:00:00Z',
      };

      // Mock pinned revision query to return error (not found)
      const mockPinnedQueryChain = {
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' },
        }),
      };

      // Mock question_set query (for published fallback)
      const mockQuestionSetQuery = {
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'qs-1' },
          error: null,
        }),
      };

      // Mock pointer query
      const mockPointerQuery = {
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            preview_revision_id: 'preview-rev-1',
            published_revision_id: 'published-rev-1',
          },
          error: null,
        }),
      };

      // Mock revision query for published
      const mockPublishedRevQuery = {
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            content_json: mockQuestionSet,
            content_hash: 'published-hash',
            schema_version: 'v2_question_schema_1',
            created_at: '2024-01-02T00:00:00Z',
          },
          error: null,
        }),
      };

      mockFrom
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue(mockPinnedQueryChain),
          }),
        } as any)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue(mockQuestionSetQuery),
        } as any)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue(mockPointerQuery),
          }),
        } as any)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue(mockPublishedRevQuery),
          }),
        } as any);

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
    it('should return published (not preview) when preview=1 but user is logged-out', async () => {
      // Mock question_set query
      const mockQuestionSetQuery = {
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'qs-1' },
          error: null,
        }),
      };

      // Mock pointer query
      const mockPointerQuery = {
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            preview_revision_id: 'preview-rev-1',
            published_revision_id: 'published-rev-1',
          },
          error: null,
        }),
      };

      // Mock revision query for published (should use this, not preview)
      const mockPublishedRevQuery = {
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            content_json: mockQuestionSet,
            content_hash: 'published-hash',
            schema_version: 'v2_question_schema_1',
            created_at: '2024-01-02T00:00:00Z',
          },
          error: null,
        }),
      };

      mockFrom
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue(mockQuestionSetQuery),
        } as any)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue(mockPointerQuery),
          }),
        } as any)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue(mockPublishedRevQuery),
          }),
        } as any);

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
        preview: true,
        userRole: undefined, // Logged-out
      });

      expect(result.source).toBe('cms');
      expect(result.contentHash).toBe('published-hash');
      expect(result.isPreview).toBeUndefined(); // Should not be preview
      expect(result.questionSetRef?.publishedRevisionId).toBe('published-rev-1');
    });

    it('should return published (not preview) when preview=1 but role=user', async () => {
      // Mock question_set query
      const mockQuestionSetQuery = {
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'qs-1' },
          error: null,
        }),
      };

      // Mock pointer query
      const mockPointerQuery = {
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            preview_revision_id: 'preview-rev-1',
            published_revision_id: 'published-rev-1',
          },
          error: null,
        }),
      };

      // Mock revision query for published
      const mockPublishedRevQuery = {
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            content_json: mockQuestionSet,
            content_hash: 'published-hash',
            schema_version: 'v2_question_schema_1',
            created_at: '2024-01-02T00:00:00Z',
          },
          error: null,
        }),
      };

      mockFrom
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue(mockQuestionSetQuery),
        } as any)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue(mockPointerQuery),
          }),
        } as any)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue(mockPublishedRevQuery),
          }),
        } as any);

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
        preview: true,
        userRole: 'user',
      });

      expect(result.source).toBe('cms');
      expect(result.contentHash).toBe('published-hash');
      expect(result.isPreview).toBeUndefined(); // Should not be preview
      expect(result.questionSetRef?.publishedRevisionId).toBe('published-rev-1');
    });

    it('should return preview revision when preview=1 and role=editor', async () => {
      // Mock question_set query
      const mockQuestionSetQuery = {
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'qs-1' },
          error: null,
        }),
      };

      // Mock pointer query
      const mockPointerQuery = {
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            preview_revision_id: 'preview-rev-1',
            published_revision_id: 'published-rev-1',
          },
          error: null,
        }),
      };

      // Mock revision query for preview
      const mockPreviewRevQuery = {
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            content_json: mockQuestionSet,
            content_hash: 'preview-hash',
            schema_version: 'v2_question_schema_1',
            created_at: '2024-01-03T00:00:00Z',
          },
          error: null,
        }),
      };

      mockFrom
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue(mockQuestionSetQuery),
        } as any)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue(mockPointerQuery),
          }),
        } as any)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue(mockPreviewRevQuery),
          }),
        } as any);

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
        preview: true,
        userRole: 'editor',
      });

      expect(result.source).toBe('cms');
      expect(result.contentHash).toBe('preview-hash');
      expect(result.isPreview).toBe(true); // Should be marked as preview
      expect(result.questionSetRef?.previewRevisionId).toBe('preview-rev-1');
    });

    it('should return preview revision when preview=1 and role=admin', async () => {
      // Mock question_set query
      const mockQuestionSetQuery = {
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'qs-1' },
          error: null,
        }),
      };

      // Mock pointer query
      const mockPointerQuery = {
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            preview_revision_id: 'preview-rev-1',
            published_revision_id: 'published-rev-1',
          },
          error: null,
        }),
      };

      // Mock revision query for preview
      const mockPreviewRevQuery = {
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            content_json: mockQuestionSet,
            content_hash: 'preview-hash',
            schema_version: 'v2_question_schema_1',
            created_at: '2024-01-03T00:00:00Z',
          },
          error: null,
        }),
      };

      mockFrom
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue(mockQuestionSetQuery),
        } as any)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue(mockPointerQuery),
          }),
        } as any)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue(mockPreviewRevQuery),
          }),
        } as any);

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
        preview: true,
        userRole: 'admin',
      });

      expect(result.source).toBe('cms');
      expect(result.contentHash).toBe('preview-hash');
      expect(result.isPreview).toBe(true); // Should be marked as preview
      expect(result.questionSetRef?.previewRevisionId).toBe('preview-rev-1');
    });
  });

  describe('pinning regression', () => {
    it('should return pinned revision even when pointers have changed', async () => {
      const pinnedRevisionId = 'rev-1'; // Original pinned revision
      const pinnedRef: QuestionSetRef = {
        source: 'cms',
        questionSetId: 'qs-1',
        publishedRevisionId: pinnedRevisionId,
        contentHash: 'rev1-hash',
        resolvedAt: '2024-01-01T00:00:00Z',
      };

      // Mock pinned revision query - should return rev1
      const mockPinnedRevQuery = {
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            content_json: mockQuestionSet,
            content_hash: 'rev1-hash',
            schema_version: 'v2_question_schema_1',
            created_at: '2024-01-01T00:00:00Z',
          },
          error: null,
        }),
      };

      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue(mockPinnedRevQuery),
        }),
      } as any);

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
        pinnedQuestionsRef: pinnedRef,
      });

      // Should return pinned revision, not the current pointer
      expect(result.source).toBe('cms');
      expect(result.questionSetRef).toBe(pinnedRef);
      expect(result.contentHash).toBe('rev1-hash');
      expect(mockPinnedRevQuery.eq).toHaveBeenCalledWith('id', pinnedRevisionId);
      // Should NOT query pointers or published revision
      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(mockFrom).toHaveBeenCalledWith('question_set_revisions');
    });
  });

  describe('file fallback', () => {
    it('should fall back to file loader when no CMS identity exists', async () => {
      // Mock question_set query to return null (not found)
      const mockQuestionSetQuery = {
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue(mockQuestionSetQuery),
      } as any);

      // Mock file loader to return question set
      mockLoadQuestionSetFn.mockReturnValue(mockQuestionSet);

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
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
      // Mock question_set query (exists)
      const mockQuestionSetQuery = {
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'qs-1', assessment_type: 'gut-check', assessment_version: '2', locale: null },
          error: null,
        }),
      };

      // Mock pointer query to return null (no pointers row exists)
      const mockPointerQuery = {
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      // Need to mock the query chain properly for the existence check and pointer check
      mockFrom
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue(mockQuestionSetQuery),
        } as any) // First call: existence check
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue(mockPointerQuery),
          }),
        } as any); // Second call: pointer check

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
      });

      expect(result.source).toBe('cms_empty');
      expect(result.questionSetId).toBe('qs-1');
      expect(result.questionSet).toBeUndefined();
      expect(mockLoadQuestionSetFn).not.toHaveBeenCalled(); // Should NOT fallback to file
    });

    it('should return cms_empty when question set exists but both pointer IDs are null', async () => {
      // Mock question_set query (exists)
      const mockQuestionSetQuery = {
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'qs-1', assessment_type: 'gut-check', assessment_version: '2', locale: null },
          error: null,
        }),
      };

      // Mock pointer query to return pointers row with both IDs null
      const mockPointerQuery = {
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            preview_revision_id: null,
            published_revision_id: null,
          },
          error: null,
        }),
      };

      mockFrom
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue(mockQuestionSetQuery),
        } as any) // First call: existence check
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue(mockPointerQuery),
          }),
        } as any); // Second call: pointer check

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
      });

      expect(result.source).toBe('cms_empty');
      expect(result.questionSetId).toBe('qs-1');
      expect(result.questionSet).toBeUndefined();
      expect(mockLoadQuestionSetFn).not.toHaveBeenCalled(); // Should NOT fallback to file
    });

    it('should fall back to file loader when published revision not found', async () => {
      // Mock question_set query
      const mockQuestionSetQuery = {
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'qs-1' },
          error: null,
        }),
      };

      // Mock pointer query
      const mockPointerQuery = {
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            preview_revision_id: null,
            published_revision_id: 'rev-not-found',
          },
          error: null,
        }),
      };

      // Mock revision query to return error (not found)
      const mockRevQuery = {
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' },
        }),
      };

      mockFrom
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue(mockQuestionSetQuery),
        } as any)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue(mockPointerQuery),
          }),
        } as any)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue(mockRevQuery),
          }),
        } as any);

      // Mock file loader
      mockLoadQuestionSet.mockReturnValue(mockQuestionSet);

      const result = await resolveQuestionSet({
        assessmentType: 'gut-check',
        assessmentVersion: '2',
      });

      expect(result.source).toBe('file');
      expect(result.questionSet).toEqual(mockQuestionSet);
      expect(mockLoadQuestionSetFn).toHaveBeenCalled();
    });
  });
});

