import {
  FOOD_HOME_FIXTURES,
  getFoodHomeFixture,
  parseFoodHomeFixtureId,
} from '../fixtures';

describe('Food Home fixtures', () => {
  test('populated fixture exposes four readiness rows with one already-added', () => {
    const model = getFoodHomeFixture('populated');
    expect(model.readiness.status).toBe('populated');
    expect(model.readiness.rows).toHaveLength(4);
    expect(model.readiness.rows.filter((row) => row.status === 'already_added')).toHaveLength(1);
    expect(model.readyAnytime.hasActivePlan).toBe(true);
  });

  test('parseFoodHomeFixtureId accepts known ids only', () => {
    expect(parseFoodHomeFixtureId('populated')).toBe('populated');
    expect(parseFoodHomeFixtureId('ready_anytime_invalid')).toBe('ready_anytime_invalid');
    expect(parseFoodHomeFixtureId('nope')).toBeNull();
    expect(parseFoodHomeFixtureId(undefined)).toBeNull();
  });

  test('all fixture catalog entries are keyed and self-identified', () => {
    for (const [id, model] of Object.entries(FOOD_HOME_FIXTURES)) {
      expect(model.fixtureId).toBe(id);
      expect(model.readiness.groceryListLabel).toBe('My Grocery List');
    }
  });
});
