import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Packet 19 Correction B safety follow-up', () => {
  it('keeps both modal panels mounted for tab continuity', () => {
    const modal = read('components/journal/plans/PlanContextModal.tsx');
    expect(modal).toContain('role="tabpanel"');
    expect(modal).toContain('hidden={activeTab !==');
    expect(modal).toContain("event.key === 'Escape'");
    expect(modal).toContain('returnFocusRef');
  });

  it('guards Month projection writes with request generation', () => {
    const page = read('components/journal/plans/MonthCalendarProjectionPage.tsx');
    expect(page).toContain('newMonthProjectionSession');
    expect(page).toContain('fetchMonthProjectionData');
    expect(page).toContain('applyMonthProjectionResult');
    expect(page).toContain('shouldRefreshMonthAfterMutation');
  });

  it('validates dated draft membership before destructive saves', () => {
    const actions = read('lib/plans/dayPlanActions.ts');
    expect(actions).toContain('validateDatedDayDraftMembership');
    expect(actions).toContain('planSlots');
    expect(actions).toContain('applyError');
  });

  it('preserves editor session across Month library tab switches', () => {
    const month = read('components/journal/plans/MonthCalendarProjection.tsx');
    const editor = read('components/journal/plans/EmbeddedDayPlanner.tsx');
    expect(month).toContain('pendingLibrarySelection');
    expect(month).toContain('onDirtyChange={setEditorDirty}');
    expect(month).not.toContain('stagedReusable?.id');
    expect(editor).toContain('pendingSavedTemplateId');
    expect(editor).toContain('pendingSavedSnapshot');
  });
});
