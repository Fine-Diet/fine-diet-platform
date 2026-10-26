import {
  isValidLogDate,
  isValidLogTime,
  resolveLogCaptureRouteContext,
  validateLogCaptureDateTime,
} from '@/lib/journal/logCaptureDateTime';

describe('non-food Log capture date and time validation', () => {
  it.each(['2026-02-29', '2026-04-31', '2026-10-2', '2026/10/24'])('rejects invalid calendar date %s', (date) => {
    expect(isValidLogDate(date)).toBe(false);
    expect(validateLogCaptureDateTime(date, '08:00').value).toBeNull();
  });

  it('accepts a historical leap day without changing its local day', () => {
    expect(isValidLogDate('2024-02-29')).toBe(true);
    const result = validateLogCaptureDateTime('2024-02-29', '23:59');
    expect(result.error).toBeNull();
    expect(result.value?.date.getFullYear()).toBe(2024);
    expect(result.value?.date.getMonth()).toBe(1);
    expect(result.value?.date.getDate()).toBe(29);
    expect(result.value?.occurredAt.getFullYear()).toBe(2024);
    expect(result.value?.occurredAt.getMonth()).toBe(1);
    expect(result.value?.occurredAt.getDate()).toBe(29);
  });

  it.each(['24:00', '25:15', '99:99', '12:60', '9:15', '12:5'])('rejects invalid clock time %s', (time) => {
    expect(isValidLogTime(time)).toBe(false);
    expect(validateLogCaptureDateTime('2026-10-24', time).value).toBeNull();
  });

  it.each(['00:00', '23:59'])('accepts boundary clock time %s', (time) => {
    expect(isValidLogTime(time)).toBe(true);
    expect(validateLogCaptureDateTime('2026-10-24', time).value?.occurredAt.toDateString())
      .toBe(validateLogCaptureDateTime('2026-10-24', time).value?.date.toDateString());
  });

  it.each([
    ['morning', '08:00'],
    ['midday', '12:00'],
    ['evening', '18:00'],
  ])('uses the established %s default for historical block links', (block, time) => {
    const context = resolveLogCaptureRouteContext({ date: '2024-06-18', block }, new Date(2026, 9, 25, 21));
    expect(context).toMatchObject({ dateValue: '2024-06-18', timeValue: time, block, error: null });
  });

  it('honors an explicit time and defaults to the existing morning Log convention when no block is supplied', () => {
    expect(resolveLogCaptureRouteContext({ date: '2024-06-18', time: '19:20' }))
      .toMatchObject({ timeValue: '19:20', block: 'morning', error: null });
    expect(resolveLogCaptureRouteContext({ date: '2024-06-18' }))
      .toMatchObject({ timeValue: '08:00', block: 'morning', error: null });
  });

  it('fails visibly on repeated date or time query values instead of choosing one', () => {
    expect(resolveLogCaptureRouteContext({ date: ['2024-06-18', '2024-06-19'] }).error).toContain('date is invalid');
    expect(resolveLogCaptureRouteContext({ time: ['08:00', '09:00'] }).error).toContain('time is invalid');
  });
});
