import {
  editorStateToQuestionSet,
  questionSetToEditorState,
  createBlankQuestion,
  createBlankSection,
  duplicateQuestion,
  genId,
} from '../editorTransforms';
import { projectErrors, buildValidationView } from '../validationView';
import { validateQuestionSet } from '@/lib/questionSet/validateQuestionSetShared';
import type { EditorState } from '../editorTypes';

describe('editorTransforms', () => {
  it('round-trips a valid question set through editor state and back', () => {
    const qs = {
      version: '2',
      assessmentType: 'gut-check',
      sections: [
        { id: 's1', title: 'Section 1', questionIds: ['q1', 'q2'] },
        { id: 's2', title: 'Section 2', questionIds: ['q3'] },
      ],
      questions: [
        {
          id: 'q1',
          text: 'Q1',
          options: [
            { id: 'o1', label: 'a', value: 0 },
            { id: 'o2', label: 'b', value: 1 },
            { id: 'o3', label: 'c', value: 2 },
            { id: 'o4', label: 'd', value: 3 },
          ],
        },
        {
          id: 'q2',
          text: 'Q2',
          options: [
            { id: 'o5', label: 'a', value: 0 },
            { id: 'o6', label: 'b', value: 1 },
            { id: 'o7', label: 'c', value: 2 },
            { id: 'o8', label: 'd', value: 3 },
          ],
        },
        {
          id: 'q3',
          text: 'Q3',
          options: [
            { id: 'o9', label: 'a', value: 0 },
            { id: 'o10', label: 'b', value: 1 },
            { id: 'o11', label: 'c', value: 2 },
            { id: 'o12', label: 'd', value: 3 },
          ],
        },
      ],
    };

    const editorState = questionSetToEditorState(qs as any);
    const back = editorStateToQuestionSet(editorState);

    expect(back.sections).toEqual(qs.sections);
    expect(back.questions).toEqual(qs.questions);
    expect(back.version).toBe('2');
    expect(back.assessmentType).toBe('gut-check');
  });

  it('drops dangling section references when converting to editor state', () => {
    const qs = {
      version: '2',
      assessmentType: 'gut-check',
      sections: [{ id: 's1', title: 'S1', questionIds: ['q1', 'missing'] }],
      questions: [
        {
          id: 'q1',
          text: 'Q1',
          options: [
            { id: 'o1', label: 'a', value: 0 },
            { id: 'o2', label: 'b', value: 1 },
            { id: 'o3', label: 'c', value: 2 },
            { id: 'o4', label: 'd', value: 3 },
          ],
        },
      ],
    };

    const editorState = questionSetToEditorState(qs as any);
    expect(editorState.sections[0].questions).toHaveLength(1);
    expect(editorState.sections[0].questions[0].id).toBe('q1');
  });

  it('createBlankQuestion seeds four options with values 0..3', () => {
    const q = createBlankQuestion();
    expect(q.options).toHaveLength(4);
    expect(q.options.map((o) => o.value).sort()).toEqual([0, 1, 2, 3]);
  });

  it('duplicateQuestion produces a new question id and fresh option ids', () => {
    const q = createBlankQuestion();
    const dup = duplicateQuestion(q);
    expect(dup.id).not.toBe(q.id);
    expect(dup.options.map((o) => o.id)).not.toEqual(q.options.map((o) => o.id));
    expect(dup.text).toBe(q.text);
  });

  it('genId is unique-ish and prefixed', () => {
    const a = genId('q');
    const b = genId('q');
    expect(a.startsWith('q-')).toBe(true);
    expect(a).not.toBe(b);
  });

  it('createBlankSection seeds one question', () => {
    const s = createBlankSection();
    expect(s.questions).toHaveLength(1);
    expect(s.questions[0].options).toHaveLength(4);
  });
});

describe('validationView projection', () => {
  const validState: EditorState = {
    version: '2',
    assessmentType: 'gut-check',
    sections: [
      {
        id: 's1',
        title: 'Section 1',
        questions: [
          {
            id: 'q1',
            text: 'Q1',
            options: [
              { id: 'o1', label: 'a', value: 0 },
              { id: 'o2', label: 'b', value: 1 },
              { id: 'o3', label: 'c', value: 2 },
              { id: 'o4', label: 'd', value: 3 },
            ],
          },
        ],
      },
    ],
  };

  it('produces no field errors for a valid state', () => {
    const validation = validateQuestionSet(editorStateToQuestionSet(validState));
    expect(validation.ok).toBe(true);
    const view = projectErrors(validState, validation.errors);
    expect(view.top.version).toHaveLength(0);
    expect(view.sections[0].questions[0].optionsList[0].value).toHaveLength(0);
  });

  it('projects a missing-text error onto the question text field', () => {
    const state: EditorState = {
      ...validState,
      sections: [
        {
          ...validState.sections[0],
          questions: [{ ...validState.sections[0].questions[0], text: '' }],
        },
      ],
    };
    const validation = validateQuestionSet(editorStateToQuestionSet(state));
    const view = projectErrors(state, validation.errors);
    expect(view.sections[0].questions[0].text.length).toBeGreaterThan(0);
  });

  it('projects a duplicate-value error onto the offending option value field', () => {
    const state: EditorState = {
      ...validState,
      sections: [
        {
          ...validState.sections[0],
          questions: [
            {
              ...validState.sections[0].questions[0],
              options: [
                { id: 'o1', label: 'a', value: 0 },
                { id: 'o2', label: 'b', value: 0 },
                { id: 'o3', label: 'c', value: 2 },
                { id: 'o4', label: 'd', value: 3 },
              ],
            },
          ],
        },
      ],
    };
    const validation = validateQuestionSet(editorStateToQuestionSet(state));
    const view = projectErrors(state, validation.errors);
    expect(view.sections[0].questions[0].optionsList[1].value.length).toBeGreaterThan(0);
    // value 1 is missing -> surfaced as missingValues + general
    expect(view.sections[0].questions[0].missingValues).toContain(1);
  });

  it('projects a wrong option count error onto the question options field', () => {
    const state: EditorState = {
      ...validState,
      sections: [
        {
          ...validState.sections[0],
          questions: [
            {
              ...validState.sections[0].questions[0],
              options: validState.sections[0].questions[0].options.slice(0, 3),
            },
          ],
        },
      ],
    };
    const validation = validateQuestionSet(editorStateToQuestionSet(state));
    const view = projectErrors(state, validation.errors);
    expect(view.sections[0].questions[0].options.length).toBeGreaterThan(0);
  });

  it('projects an empty section (no questions) onto the section questionIds field', () => {
    const state: EditorState = {
      ...validState,
      sections: [{ ...validState.sections[0], questions: [] }],
    };
    const validation = validateQuestionSet(editorStateToQuestionSet(state));
    const view = projectErrors(state, validation.errors);
    expect(view.sections[0].questionIds.length).toBeGreaterThan(0);
  });

  it('buildValidationView sizes the view to the editor state', () => {
    const view = buildValidationView(validState);
    expect(view.sections).toHaveLength(1);
    expect(view.sections[0].questions).toHaveLength(1);
    expect(view.sections[0].questions[0].optionsList).toHaveLength(4);
  });
});
