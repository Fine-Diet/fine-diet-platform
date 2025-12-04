/**
 * Server-Side Supabase Admin Client
 * 
 * This client uses the SERVICE_ROLE_KEY and should ONLY be used in server contexts:
 * - API routes
 * - getServerSideProps
 * - getStaticProps (at build time)
 * - Server Components (if using App Router)
 * 
 * NEVER import this file in client components or browser code.
 */

import { createClient } from '@supabase/supabase-js';

// Runtime guard: ensure this is only used on the server
if (typeof window !== 'undefined') {
  throw new Error(
    'supabaseServerClient.ts can only be imported in server contexts. ' +
    'Use lib/supabaseClient.ts for browser/client code.'
  );
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!supabaseServiceRoleKey) {
  throw new Error(
    'Missing SUPABASE_SERVICE_ROLE_KEY environment variable. ' +
    'This is required for server-side admin operations.'
  );
}

/**
 * Server-side Supabase client with admin privileges.
 * Uses SERVICE_ROLE_KEY to bypass Row Level Security (RLS).
 * 
 * ⚠️ SECURITY WARNING:
 * - This client has full database access
 * - Never expose SERVICE_ROLE_KEY to the client
 * - Only use in server-side code (API routes, getServerSideProps, etc.)
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

