/** Server-only pre-charge boundary. Never trust client price/model metadata. */
import { stripe } from './stripeServer';
import { getStripeAccountContext } from './stripeAccountContext';
import type { PriceOptionBilling } from '@/lib/access/priceOptionBillingService';

export class CheckoutSafetyError extends Error {
  constructor(public readonly code: string, public readonly status: number = 503) {
    super(code);
    this.name = 'CheckoutSafetyError';
    Object.setPrototypeOf(this, CheckoutSafetyError.prototype);
  }
}

export async function assertCheckoutSafety(billing: PriceOptionBilling): Promise<void> {
  if (billing.billingModel !== 'subscription' && billing.billingModel !== 'one_time') {
    throw new CheckoutSafetyError('billing_model_not_enabled', 409);
  }
  // Legacy installment/intro/phase fields remain in the catalog. Reject them
  // before even the read-only Stripe Price lookup so they cannot reach customer
  // creation, checkout receipts, or Checkout Session creation.
  const hasValue = (value: unknown): boolean => value !== null && value !== undefined;
  if (hasValue(billing.stripePhasePriceIds) || hasValue(billing.stripePhaseIterations) ||
      hasValue(billing.introPriceId) || hasValue(billing.introIterations) || hasValue(billing.renewalPriceId)) {
    throw new CheckoutSafetyError('billing_schedule_not_enabled', 409);
  }
  const context = getStripeAccountContext();
  if (context.livemode && process.env.STRIPE_ATOMIC_FULFILLMENT !== '1') {
    throw new CheckoutSafetyError('checkout_not_ready');
  }
  if (!billing.stripePriceId || !/^price_[A-Za-z0-9]+$/.test(billing.stripePriceId)) {
    throw new CheckoutSafetyError('checkout_price_unavailable');
  }
  if (billing.trialPeriodDays != null && billing.trialPeriodDays !== 0 &&
      (billing.billingModel !== 'subscription' || !Number.isSafeInteger(billing.trialPeriodDays) || billing.trialPeriodDays < 1)) {
    throw new CheckoutSafetyError('checkout_trial_unavailable');
  }
  // Read-only verification before creating a customer/session. Price retrieval
  // is in this key's Stripe account; account/key provenance is an operational gate.
  const price = await stripe.prices.retrieve(billing.stripePriceId, { expand: ['product'] });
  const product = price.product;
  if (price.id !== billing.stripePriceId || price.livemode !== context.livemode || !price.active ||
      !product || typeof product === 'string' || ('deleted' in product && product.deleted) ||
      !('active' in product) || !product.active || !('livemode' in product) || product.livemode !== context.livemode ||
      price.billing_scheme !== 'per_unit' || !Number.isSafeInteger(price.unit_amount) || price.unit_amount! < 0 ||
      price.custom_unit_amount || price.transform_quantity) {
    throw new CheckoutSafetyError('checkout_price_unavailable');
  }
  if (billing.billingModel === 'subscription') {
    if (price.type !== 'recurring' || !price.recurring || price.recurring.usage_type !== 'licensed' ||
        !['month', 'year'].includes(price.recurring.interval) || price.recurring.interval_count !== 1) {
      throw new CheckoutSafetyError('checkout_price_unavailable');
    }
  } else if (price.type !== 'one_time' || price.recurring) {
    throw new CheckoutSafetyError('checkout_price_unavailable');
  }
}
