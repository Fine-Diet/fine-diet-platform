/**
 * Stripe Server Client
 *
 * Initialises a single Stripe instance for all server-side usage.
 * NEVER import this file in client/browser code.
 */

import Stripe from 'stripe';
import { getAbsoluteSiteUrl } from '@/lib/siteOrigin';

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
 * Build an absolute URL from a relative path. The exact QA Preview resolves
 * its generated branch origin from Vercel system variables and fails closed
 * rather than falling back to Production or localhost.
 */
export function absoluteUrl(path: string): string {
  return getAbsoluteSiteUrl(path, { includeServerSiteUrl: true });
}
