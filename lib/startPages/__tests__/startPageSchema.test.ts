/**
 * StartTemplateConfig schema — backward compatibility + structured fixed-section
 * editing. Guards:
 *   - legacy `heroRail.items: string[]` still parses.
 *   - structured hero rail items parse.
 *   - mixed string + structured items parse.
 *   - system card `imageAlt` is accepted.
 *   - unknown non-presentation keys are stripped (config_json stays
 *     presentation-only; no billing/checkout/Stripe/entitlement/grant/trial
 *     fields can sneak in).
 */
import { startTemplateConfigSchema } from '@/lib/startPages/startPageSchema';

describe('StartTemplateConfig — hero rail backward compatibility', () => {
  it('accepts legacy heroRail.items as string[]', () => {
    const parsed = startTemplateConfigSchema.parse({
      heroRail: { items: ['Food clarity', 'Body signals'] },
    });
    expect(parsed.heroRail?.items).toEqual(['Food clarity', 'Body signals']);
  });

  it('accepts structured hero rail items', () => {
    const parsed = startTemplateConfigSchema.parse({
      heroRail: {
        items: [
          {
            id: 'rail-1',
            label: 'Food clarity',
            eyebrow: 'Why it matters',
            description: 'See patterns in what you eat.',
            image: 'https://example.com/x.jpg',
            imageAlt: 'Plate with colorful food',
            href: '/programs/nutrition',
          },
        ],
      },
    });
    expect(parsed.heroRail?.items?.[0]).toMatchObject({
      id: 'rail-1',
      label: 'Food clarity',
      href: '/programs/nutrition',
    });
  });

  it('accepts a mix of legacy string and structured items', () => {
    const parsed = startTemplateConfigSchema.parse({
      heroRail: {
        items: ['Food clarity', { id: 'rail-2', label: 'Body signals' }],
      },
    });
    expect(parsed.heroRail?.items).toEqual([
      'Food clarity',
      { id: 'rail-2', label: 'Body signals' },
    ]);
  });
});

describe('StartTemplateConfig — system card imageAlt', () => {
  it('accepts system cards with imageAlt', () => {
    const parsed = startTemplateConfigSchema.parse({
      systemCards: {
        cards: [
          {
            id: 'daily-log',
            headline: 'Track meals with context.',
            description: 'Log what you ate.',
            image: 'https://example.com/x.jpg',
            imageAlt: 'Daily log screen',
            eyebrow: 'Daily log',
          },
        ],
      },
    });
    expect(parsed.systemCards?.cards?.[0].imageAlt).toBe('Daily log screen');
  });

  it('still accepts system cards without imageAlt (optional)', () => {
    const parsed = startTemplateConfigSchema.parse({
      systemCards: {
        cards: [
          {
            id: 'daily-log',
            headline: 'Track meals with context.',
            description: 'Log what you ate.',
            image: 'https://example.com/x.jpg',
          },
        ],
      },
    });
    expect(parsed.systemCards?.cards?.[0].imageAlt).toBeUndefined();
  });
});

describe('StartTemplateConfig — presentation-only boundary', () => {
  it('strips unknown top-level keys (no billing/entitlement leakage)', () => {
    const parsed = startTemplateConfigSchema.parse({
      hero: { headline: 'Hi' },
      stripePriceId: 'price_123',
      entitlements: ['pro'],
      trialDays: 21,
    });
    expect(parsed).not.toHaveProperty('stripePriceId');
    expect(parsed).not.toHaveProperty('entitlements');
    expect(parsed).not.toHaveProperty('trialDays');
    expect(parsed.hero?.headline).toBe('Hi');
  });

  it('strips unknown keys inside hero rail items', () => {
    const parsed = startTemplateConfigSchema.parse({
      heroRail: {
        items: [
          { label: 'Food clarity', checkoutUrl: '/buy/offer' },
        ],
      },
    });
    const item = parsed.heroRail?.items?.[0];
    expect(item).toMatchObject({ label: 'Food clarity' });
    expect(item).not.toHaveProperty('checkoutUrl');
  });
});
