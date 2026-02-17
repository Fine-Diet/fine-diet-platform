/**
 * Stripe Server Client
 *
 * Initialises a single Stripe instance for all server-side usage.
 * NEVER import this file in client/browser code.
 */

import Stripe from 'stripe';

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/stripe/stripeServer.ts must only be imported in server contexts.'
  );
}

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable');
}

export const stripe = new Stripe(secretKey, {
  typescript: true,
});

/**
 * Build an absolute URL from a relative path using NEXT_PUBLIC_SITE_URL.
 * Falls back to localhost in development.
 */
export function absoluteUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    'http://localhost:3000';
  return `${base.replace(/\/$/, '')}${path}`;
}
