import { isSafeAppReturnPath, proposePlanToday } from '../policy';
import type { PlansMealGuidanceRow } from '@/lib/plans/home/types';

function row(
  slotKey: string,
  state: PlansMealGuidanceRow['state'],
  label = slotKey,
): PlansMealGuidanceRow {
  return {
    slotKey,
    targetTimeLabel: '11:00',
    targetTimeValue: '11:00',
    label,
    mealName: state === 'empty' ? null : 'Oats',
    mealId: state === 'empty' ? null : `${slotKey}-meal`,
    state,
  };
}

describe('proposePlanToday', () => {
  it('sends missing rhythm to Meal Rhythm instead of inventing occasions', () => {
    const proposal = proposePlanToday({
      date: '2026-08-16',
      hasUsableRhythm: false,
      guidanceStatus: 'no_schedule',
      rows: [],
      planId: 'plan-1',
    });
    expect(proposal.view).toBe('missing_rhythm');
    expect(proposal.occasions).toEqual([]);
    expect(proposal.reasonCodes).toContain('missing_usable_meal_rhythm');
    expect(proposal.canAttach).toBe(false);
  });

  it('walks remaining open enabled occasions and names the next slot', () => {
    const proposal = proposePlanToday({
      date: '2026-08-16',
      hasUsableRhythm: true,
      guidanceStatus: 'ready',
      rows: [row('breakfast', 'pending'), row('lunch', 'empty'), row('dinner', 'empty')],
      planId: 'plan-1',
    });
    expect(proposal.view).toBe('board');
    expect(proposal.coverage).toBe('partial');
    expect(proposal.nextOpenSlotKey).toBe('lunch');
    expect(proposal.openCount).toBe(2);
    expect(proposal.plannedCount).toBe(1);
    expect(proposal.canAttach).toBe(true);
    expect(proposal.occasions.map((item) => item.status)).toEqual([
      'planned',
      'open',
      'open',
    ]);
  });

  it('marks today complete when every enabled occasion is planned', () => {
    const proposal = proposePlanToday({
      date: '2026-08-16',
      hasUsableRhythm: true,
      guidanceStatus: 'ready',
      rows: [row('breakfast', 'pending'), row('lunch', 'eaten')],
      planId: 'plan-1',
    });
    expect(proposal.view).toBe('complete');
    expect(proposal.nextOpenSlotKey).toBeNull();
    expect(proposal.reasonCodes).toContain('today_enabled_occasions_planned');
  });

  it('does not claim attach when there is no active plan for today', () => {
    const proposal = proposePlanToday({
      date: '2026-08-16',
      hasUsableRhythm: true,
      guidanceStatus: 'no_active_plan',
      rows: [row('breakfast', 'empty')],
      planId: null,
    });
    expect(proposal.canAttach).toBe(false);
    expect(proposal.reasonCodes).toContain('no_active_plan_attach_deferred');
    expect(proposal.nextOpenSlotKey).toBe('breakfast');
    expect(proposal.view).toBe('board');
    expect(proposal.occasions.map((item) => item.status)).toEqual(['open']);
  });

  it('keeps an empty occasion open even if a plan id is present without an active plan', () => {
    const proposal = proposePlanToday({
      date: '2026-08-16',
      hasUsableRhythm: true,
      guidanceStatus: 'no_active_plan',
      rows: [row('lunch', 'empty')],
      planId: 'stale-plan',
    });
    expect(proposal.canAttach).toBe(false);
    expect(proposal.occasions[0]?.status).toBe('open');
  });
});

describe('isSafeAppReturnPath', () => {
  it('allows only exact Plan Today and Plan Week paths', () => {
    expect(isSafeAppReturnPath('/app/plans/today')).toBe(true);
    expect(isSafeAppReturnPath('/app/plans/week')).toBe(true);
    expect(isSafeAppReturnPath('/app/plans')).toBe(false);
    expect(isSafeAppReturnPath('/app/settings')).toBe(false);
    expect(isSafeAppReturnPath('/app/plans/today?next=https://evil.example')).toBe(false);
    expect(isSafeAppReturnPath('/app/plans/week?action=generate')).toBe(false);
    expect(isSafeAppReturnPath('https://example.com')).toBe(false);
    expect(isSafeAppReturnPath('//evil.example')).toBe(false);
    expect(isSafeAppReturnPath('/app/plans/today/')).toBe(false);
    expect(isSafeAppReturnPath('/app/plans/week/')).toBe(false);
  });
});
