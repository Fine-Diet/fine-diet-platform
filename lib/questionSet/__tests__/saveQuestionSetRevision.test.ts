/**
 * Tests for saveQuestionSetRevision (Packet C post-merge hotfix).
 *
 * Covers the two review fixes:
 *   1. Mismatched request assessmentType vs JSON assessmentType is rejected.
 *   2. A duplicate save with setPreview=true still updates the preview
 *      pointer to the existing revision and reports previewSet accurately.
 */

jest.mock('@/lib/supabaseServerClient', () => {
  const handlers: Record<string, Array<() => { data: any; error: any }>> = {};
  const calls: Array<{ table: string; method: string; payload?: any }> = [];

  function enqueue(table: string, result: { data: any; error: any }) {
    if (!handlers[table]) handlers[table] = [];
    handlers[table].push(() => result);
  }

  function makeQuery(result: { data: any; error: any }, table: string, payload?: any) {
    const query: any = Promise.resolve(result);
    query.select = () => {
      calls.push({ table, method: 'select' });
      return query;
    };
    query.eq = () => query;
    query.neq = () => query;
    query.is = () => query;
    query.order = () => query;
    query.limit = () => query;
    query.insert = (p: any) => {
      calls.push({ table, method: 'insert', payload: p });
      return query;
    };
    query.upsert = (p: any) => {
      calls.push({ table, method: 'upsert', payload: p });
      return query;
    };
    query.maybeSingle = () => query;
    query.single = () => query;
    return query;
  }

  const supabaseAdmin = {
    from(table: string) {
      const handler = handlers[table]?.shift();
      const result = handler ? handler() : { data: null, error: null };
      return makeQuery(result, table);
    },
  };

  return {
    supabaseAdmin,
    __enqueue: enqueue,
    __calls: calls,
    __reset() {
      for (const k of Object.keys(handlers)) delete handlers[k];
      calls.length = 0;
    },
  };
});

import { saveQuestionSetRevision } from '../saveQuestionSetRevision';

// Pull mock helpers out of the mocked module.
const mockedModule: any = require('@/lib/supabaseServerClient');
const enqueue = mockedModule.__enqueue as (
  table: string,
  result: { data: any; error: any }
) => void;
const getCalls = () => mockedModule.__calls as Array<{ table: string; method: string; payload?: any }>;
const reset = mockedModule.__reset as () => void;

const VALID_QUESTION_SET = {
  version: '2',
  assessmentType: 'gut-check',
  sections: [{ id: 's1', title: 'Section 1', questionIds: ['q1'] }],
  questions: [
    {
      id: 'q1',
      text: 'How often do you experience bloating?',
      options: [
        { id: 'o1', label: 'Rarely', value: 0 },
        { id: 'o2', label: 'Sometimes', value: 1 },
        { id: 'o3', label: 'Often', value: 2 },
        { id: 'o4', label: 'Almost daily', value: 3 },
      ],
    },
  ],
};

beforeEach(() => reset());

describe('saveQuestionSetRevision — identity consistency (hotfix #1)', () => {
  test('rejects when request assessmentType differs from JSON assessmentType', async () => {
    const result = await saveQuestionSetRevision({
      questionSetJson: VALID_QUESTION_SET,
      assessmentType: 'gut-check-x', // mismatches JSON 'gut-check'
      assessmentVersion: '3',
      actorId: 'user-1',
      auditAction: 'questions.save_json',
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.kind === 'validation') {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/assessmentType/);
      expect(result.errors[0]).toMatch(/gut-check-x/);
      expect(result.errors[0]).toMatch(/gut-check/);
    }
    // No DB writes should have occurred for a validation rejection.
    expect(getCalls().filter((c) => c.method === 'insert' || c.method === 'upsert')).toHaveLength(0);
  });

  test('accepts when request assessmentType matches JSON assessmentType', async () => {
    enqueue('question_sets', { data: { id: 'qs-1' }, error: null }); // find existing identity
    enqueue('question_set_revisions', { data: null, error: null }); // duplicate check → none
    enqueue('question_set_revisions', { data: { revision_number: 4 }, error: null }); // nextRevisionNumber
    enqueue('question_set_revisions', {
      data: { id: 'rev-new', created_at: '2026-07-04T00:00:00Z' },
      error: null,
    }); // insert revision
    enqueue('content_audit_log', { data: null, error: null }); // audit

    const result = await saveQuestionSetRevision({
      questionSetJson: VALID_QUESTION_SET,
      assessmentType: 'gut-check', // matches JSON
      assessmentVersion: '3',
      actorId: 'user-1',
      auditAction: 'questions.save_json',
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.kind === 'created') {
      expect(result.revision.questionSetId).toBe('qs-1');
      expect(result.revision.revisionId).toBe('rev-new');
      expect(result.previewSet).toBe(false);
    }
  });
});

describe('saveQuestionSetRevision — duplicate + setPreview (hotfix #2)', () => {
  test('duplicate with setPreview=true updates preview pointer to existing revision and reports previewSet:true', async () => {
    enqueue('question_sets', { data: { id: 'qs-1' }, error: null }); // find identity
    enqueue('question_set_revisions', {
      data: { id: 'rev-existing', revision_number: 2, status: 'draft', created_at: '2026-07-03T00:00:00Z' },
      error: null,
    }); // duplicate check → existing
    enqueue('question_set_pointers', { data: null, error: null }); // setPreviewPointer upsert
    enqueue('content_audit_log', { data: null, error: null }); // audit for duplicate+preview

    const result = await saveQuestionSetRevision({
      questionSetJson: VALID_QUESTION_SET,
      assessmentType: 'gut-check',
      assessmentVersion: '3',
      setPreview: true,
      actorId: 'user-1',
      auditAction: 'questions.save_json',
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.kind === 'duplicate') {
      expect(result.revision.revisionId).toBe('rev-existing');
      expect(result.revision.revisionNumber).toBe(2);
      expect(result.previewSet).toBe(true);
    }

    const upserts = getCalls().filter((c) => c.table === 'question_set_pointers' && c.method === 'upsert');
    expect(upserts).toHaveLength(1);
    expect(upserts[0].payload.preview_revision_id).toBe('rev-existing');
    expect(upserts[0].payload.question_set_id).toBe('qs-1');
  });

  test('duplicate without setPreview does not touch the preview pointer and reports previewSet:false', async () => {
    enqueue('question_sets', { data: { id: 'qs-1' }, error: null });
    enqueue('question_set_revisions', {
      data: { id: 'rev-existing', revision_number: 2, status: 'draft', created_at: '2026-07-03T00:00:00Z' },
      error: null,
    });

    const result = await saveQuestionSetRevision({
      questionSetJson: VALID_QUESTION_SET,
      assessmentType: 'gut-check',
      assessmentVersion: '3',
      setPreview: false,
      actorId: 'user-1',
      auditAction: 'questions.save_json',
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.kind === 'duplicate') {
      expect(result.previewSet).toBe(false);
    }
    expect(getCalls().filter((c) => c.table === 'question_set_pointers')).toHaveLength(0);
  });

  test('created save with setPreview=true sets preview pointer to the new revision', async () => {
    enqueue('question_sets', { data: { id: 'qs-1' }, error: null });
    enqueue('question_set_revisions', { data: null, error: null }); // duplicate check → none
    enqueue('question_set_revisions', { data: { revision_number: 5 }, error: null }); // nextRevisionNumber
    enqueue('question_set_revisions', {
      data: { id: 'rev-new', created_at: '2026-07-04T00:00:00Z' },
      error: null,
    }); // insert
    enqueue('question_set_pointers', { data: null, error: null }); // setPreviewPointer
    enqueue('content_audit_log', { data: null, error: null }); // audit

    const result = await saveQuestionSetRevision({
      questionSetJson: VALID_QUESTION_SET,
      assessmentType: 'gut-check',
      assessmentVersion: '3',
      setPreview: true,
      actorId: 'user-1',
      auditAction: 'questions.save_json',
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.kind === 'created') {
      expect(result.previewSet).toBe(true);
      expect(result.revision.revisionId).toBe('rev-new');
    }
    const upserts = getCalls().filter((c) => c.table === 'question_set_pointers' && c.method === 'upsert');
    expect(upserts).toHaveLength(1);
    expect(upserts[0].payload.preview_revision_id).toBe('rev-new');
  });
});
