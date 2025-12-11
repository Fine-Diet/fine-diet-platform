/**
 * Server-Side Auth Helpers
 * 
 * Provides authentication and role-based access control for server contexts:
 * - API routes (Pages Router)
 * - getServerSideProps
 * - Middleware
 * 
 * Uses Supabase Auth with the profiles table for role management.
 * 
 * Pattern: This module creates server-side Supabase clients that can read
 * auth cookies/sessions. For API routes, we use cookies from the request.
 * For middleware, we use Next.js cookies() helper.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import type { GetServerSidePropsContext } from 'next';
import { createClient } from '@supabase/supabase-js';

export type UserRole = 'user' | 'editor' | 'admin';

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  role: UserRole;
}

/**
 * Create a server-side Supabase client for API routes
 * Reads auth tokens from Authorization header or cookies
 */
function createServerClientForApi(req: NextApiRequest, res: NextApiResponse) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  // Create client
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  // Try to get access token from Authorization header first
  const authHeader = req.headers.authorization;
  const accessToken = authHeader?.replace('Bearer ', '') || null;

  // If no Authorization header, try to read from cookies
  // Supabase stores session in cookies with format: sb-<project-ref>-auth-token
  // We'll look for any cookie that might contain the token
  let tokenFromCookie: string | null = null;
  if (!accessToken && req.cookies) {
    // Check common Supabase cookie patterns
    for (const [key, value] of Object.entries(req.cookies)) {
      if ((key.includes('auth-token') || key.includes('access-token')) && value) {
        tokenFromCookie = value;
        break;
      }
    }
  }

  const token = accessToken || tokenFromCookie;

  if (token) {
    // Set the session with the token
    // Note: This is a simplified approach - in production, you may want to
    // use @supabase/ssr for proper cookie handling
    client.auth.setSession({
      access_token: token,
      refresh_token: '',
    } as any).catch(() => {
      // Ignore errors - token might be invalid
    });
  }

  return client;
}

/**
 * Get the current authenticated user with their role from an API route
 * 
 * @param req - Next.js API request
 * @param res - Next.js API response
 * @returns Authenticated user with role, or null if not authenticated
 */
export async function getCurrentUserWithRoleFromApi(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<AuthenticatedUser | null> {
  try {
    const supabase = createServerClientForApi(req, res);

    // Get the current user from auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return null;
    }

    // Fetch role from profiles table
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    // Default to 'user' if profile doesn't exist or role is invalid
    const role = (profile?.role as UserRole) ?? 'user';
    
    // Validate role is one of the allowed values
    const validRoles: UserRole[] = ['user', 'editor', 'admin'];
    const validatedRole = validRoles.includes(role) ? role : 'user';

    return {
      id: user.id,
      email: user.email ?? null,
      role: validatedRole,
    };
  } catch (error) {
    console.error('Error getting user with role:', error);
    return null;
  }
}

/**
 * Check if a user has one of the allowed roles
 */
export function hasRole(user: AuthenticatedUser | null, allowed: UserRole[]): boolean {
  if (!user) return false;
  return allowed.includes(user.role);
}

/**
 * Require a specific role for an API route
 * 
 * If the user is not authenticated or doesn't have the required role,
 * sends a 403 Forbidden response and returns null.
 * 
 * @param req - Next.js API request
 * @param res - Next.js API response
 * @param allowed - Array of allowed roles (default: ['editor', 'admin'])
 * @returns Authenticated user if authorized, null otherwise
 */
export async function requireRoleFromApi(
  req: NextApiRequest,
  res: NextApiResponse,
  allowed: UserRole[] = ['editor', 'admin']
): Promise<AuthenticatedUser | null> {
  const user = await getCurrentUserWithRoleFromApi(req, res);
  
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  if (!allowed.includes(user.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  return user;
}

/**
 * Create a server-side Supabase client for middleware
 * Reads cookies from NextRequest headers
 */
export function createServerClientForMiddleware(request: { headers: Headers }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  // Read cookies from request headers
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split('; ').map(c => {
      const [key, ...rest] = c.split('=');
      return [key, rest.join('=')];
    })
  );

  // Supabase stores tokens in cookies with specific names
  // The exact cookie names depend on your Supabase setup
  // Common patterns: sb-<project-ref>-auth-token, or sb-access-token
  const accessToken = cookies['sb-access-token'] || 
                     Object.keys(cookies).find(k => k.includes('auth-token')) 
                       ? cookies[Object.keys(cookies).find(k => k.includes('auth-token'))!]
                       : null;
  const refreshToken = cookies['sb-refresh-token'] ||
                      Object.keys(cookies).find(k => k.includes('refresh-token'))
                        ? cookies[Object.keys(cookies).find(k => k.includes('refresh-token'))!]
                        : null;

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  if (accessToken) {
    client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken || '',
    } as any);
  }

  return client;
}

/**
 * Get the current authenticated user with their role from middleware
 * 
 * @param request - Next.js middleware request
 * @returns Authenticated user with role, or null if not authenticated
 */
export async function getCurrentUserWithRoleFromMiddleware(
  request: { headers: Headers }
): Promise<AuthenticatedUser | null> {
  try {
    const supabase = createServerClientForMiddleware(request);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return null;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = (profile?.role as UserRole) ?? 'user';
    const validRoles: UserRole[] = ['user', 'editor', 'admin'];
    const validatedRole = validRoles.includes(role) ? role : 'user';

    return {
      id: user.id,
      email: user.email ?? null,
      role: validatedRole,
    };
  } catch (error) {
    console.error('Error getting user with role from middleware:', error);
    return null;
  }
}

/**
 * Create a server-side Supabase client for getServerSideProps
 * Reads auth cookies from the request
 */
function createServerClientForSSR(context: GetServerSidePropsContext) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  // Read cookies from the request
  const cookies = context.req.cookies;
  let token: string | null = null;

  // Check for Authorization header first
  const authHeader = context.req.headers.authorization;
  if (authHeader) {
    token = authHeader.replace('Bearer ', '');
  } else if (cookies) {
    // Look for Supabase auth cookies
    for (const [key, value] of Object.entries(cookies)) {
      if ((key.includes('auth-token') || key.includes('access-token')) && value) {
        token = value;
        break;
      }
    }
  }

  if (token) {
    client.auth.setSession({
      access_token: token,
      refresh_token: '',
    } as any).catch(() => {
      // Ignore errors - token might be invalid
    });
  }

  return client;
}

/**
 * Get the current authenticated user with their role from getServerSideProps
 * 
 * @param context - Next.js getServerSideProps context
 * @returns Authenticated user with role, or null if not authenticated
 */
export async function getCurrentUserWithRoleFromSSR(
  context: GetServerSidePropsContext
): Promise<AuthenticatedUser | null> {
  try {
    const supabase = createServerClientForSSR(context);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return null;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = (profile?.role as UserRole) ?? 'user';
    const validRoles: UserRole[] = ['user', 'editor', 'admin'];
    const validatedRole = validRoles.includes(role) ? role : 'user';

    return {
      id: user.id,
      email: user.email ?? null,
      role: validatedRole,
    };
  } catch (error) {
    console.error('Error getting user with role from SSR:', error);
    return null;
  }
}

