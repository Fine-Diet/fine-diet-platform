/**
 * Canonical Home routes must not allow fixture leakage in production.
 */

describe('Home fixture isolation', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: ORIGINAL_NODE_ENV,
      configurable: true,
    });
    jest.resetModules();
  });

  test('production gates block Food/Plans/Programs/App fixtures', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
    });

    const food = await import('@/lib/food/home/fixtures');
    const plans = await import('@/lib/plans/home/fixtures');
    const programs = await import('@/lib/programs/home/fixtures');
    const app = await import('@/lib/app/home/fixtures');

    expect(food.foodHomeFixturesAllowed()).toBe(false);
    expect(plans.plansHomeFixturesAllowed()).toBe(false);
    expect(programs.programsHomeFixturesAllowed()).toBe(false);
    expect(app.appHomeFixturesAllowed()).toBe(false);
  });
});
