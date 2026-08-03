import {
  getPlansHomeFixture,
  parsePlansHomeFixtureId,
  PLANS_HOME_FIXTURES,
} from '../fixtures';
import { contextualActionForRow } from '../types';

describe('Plans Home fixtures', () => {
  test('populated fixture has seven days and four guidance rows', () => {
    const model = getPlansHomeFixture('populated');
    expect(model.guidance.status).toBe('ready');
    expect(model.guidance.days).toHaveLength(7);
    expect(model.guidance.rows).toHaveLength(4);
    expect(model.pantry.status).toBe('populated');
    expect(model.pantry.columns).toHaveLength(3);
  });

  test('parsePlansHomeFixtureId accepts known ids only', () => {
    expect(parsePlansHomeFixtureId('logged')).toBe('logged');
    expect(parsePlansHomeFixtureId('pantry_error')).toBe('pantry_error');
    expect(parsePlansHomeFixtureId('nope')).toBeNull();
  });

  test('fixture catalog is self-identified', () => {
    for (const [id, model] of Object.entries(PLANS_HOME_FIXTURES)) {
      expect(model.fixtureId).toBe(id);
    }
  });

  test('contextualActionForRow maps execution state to action labels', () => {
    expect(contextualActionForRow('eaten').label).toBe('Logged');
    expect(contextualActionForRow('empty').label).toBe('Plan');
    expect(contextualActionForRow('pending').label).toBe('Update');
    expect(contextualActionForRow('skipped').label).toBe('Skipped');
  });
});
