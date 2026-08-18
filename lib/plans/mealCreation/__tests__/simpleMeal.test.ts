import { composerModeLogsConsumption } from '@/lib/meals/composer/types';
import { buildSimpleMealDocument, parseSimpleMealParts } from '../simpleMeal';

describe('parseSimpleMealParts', () => {
  it('splits plus-separated simple meals without requiring a recipe', () => {
    expect(parseSimpleMealParts('Chicken + rice + broccoli')).toEqual([
      'Chicken',
      'rice',
      'broccoli',
    ]);
  });
});

describe('buildSimpleMealDocument', () => {
  it('creates a kind=meal document with ungrounded components and no invented nutrition', () => {
    const result = buildSimpleMealDocument({
      title: 'Chicken + rice + broccoli',
      slotKey: 'dinner',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.kind).toBe('meal');
    expect(result.document.title).toBe('Chicken + rice + broccoli');
    expect(result.document.components.map((row) => row.name)).toEqual([
      'Chicken',
      'rice',
      'broccoli',
    ]);
    expect(result.document.components.every((row) => row.calories === null)).toBe(true);
    expect(result.document.nds).toBeNull();
    expect(result.document.yield).toBeNull();
    expect(result.document.id).toBeNull();
    expect(result.document.person_id).toBeNull();
  });

  it('rejects a blank title', () => {
    const result = buildSimpleMealDocument({ title: '   ', slotKey: 'lunch' });
    expect(result.ok).toBe(false);
  });
});

describe('simple meal create mode does not log consumption', () => {
  it('uses create composer mode, which never writes journal intake', () => {
    expect(composerModeLogsConsumption('create')).toBe(false);
    expect(composerModeLogsConsumption('plan')).toBe(false);
  });
});
