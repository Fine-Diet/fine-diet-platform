import {
  buildGreeting,
  chooseActionableSlot,
  resolveNextMeal,
} from '../nextMealResolver';
import {
  APP_HOME_FIXTURES,
  getAppHomeFixture,
  parseAppHomeFixtureId,
} from '../fixtures';

describe('App Home next-meal resolver', () => {
  const slots = [
    { key: 'breakfast', enabled: true, target_time: '08:00', label: 'Breakfast', slot_block: 'morning' as const, source: 'profile' as const },
    { key: 'lunch', enabled: true, target_time: '11:00', label: 'Lunch', slot_block: 'midday' as const, source: 'profile' as const },
    { key: 'afternoon_snack', enabled: true, target_time: '14:00', label: 'Afternoon Mini-Meal', slot_block: 'afternoon' as const, source: 'profile' as const },
    { key: 'dinner', enabled: true, target_time: '17:00', label: 'Dinner', slot_block: 'evening' as const, source: 'profile' as const },
  ];

  test('chooseActionableSlot prefers current window unlogged meal', () => {
    const now = new Date('2026-07-30T13:30:00');
    const chosen = chooseActionableSlot(slots as never, [], now);
    expect(chosen?.key).toBe('afternoon_snack');
  });

  test('welcome and rhythm share the same actionable slot key', () => {
    const outcome = resolveNextMeal({
      slots: slots as never,
      todayEntries: [],
      now: new Date('2026-07-30T13:30:00'),
      dateKey: '2026-07-30',
    });
    expect(outcome.kind).toBe('next_meal');
    if (outcome.kind !== 'next_meal') return;
    expect(outcome.actionable.slotKey).toBe('afternoon_snack');
    expect(outcome.slots.find((s) => s.actionable)?.slotKey).toBe(
      outcome.actionable.slotKey,
    );
  });

  test('buildGreeting never uses email as a name', () => {
    expect(buildGreeting('jordan@example.com')).toBe('Welcome back.');
    expect(buildGreeting('Jordan')).toBe('Hi Jordan, welcome back.');
    expect(buildGreeting(null)).toBe('Welcome back.');
  });
});

describe('App Home fixtures', () => {
  test('parseAppHomeFixtureId accepts known ids only', () => {
    expect(parseAppHomeFixtureId('default')).toBe('default');
    expect(parseAppHomeFixtureId('program_recommendation')).toBe(
      'program_recommendation',
    );
    expect(parseAppHomeFixtureId('nope')).toBeNull();
  });

  test('catalog entries self-identify', () => {
    for (const [id, model] of Object.entries(APP_HOME_FIXTURES)) {
      expect(model.fixtureId).toBe(id);
    }
  });

  test('default fixture keeps welcome and rhythm actionable keys aligned', () => {
    const model = getAppHomeFixture('default');
    expect(model.welcome.actionableSlotKey).toBe(model.rhythm.actionableSlotKey);
    expect(model.welcome.actionableSlotKey).toBe('afternoon_snack');
  });

  test('food eyebrow remains singular Food', () => {
    expect(getAppHomeFixture('food_ready').food.eyebrow).toBe('Food');
  });
});
