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
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export type UserRole = 'user' | 'editor' | 'admin';

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  role: UserRole;
}

/**
 * Create a server-side Supabase client for API routes
 * Uses @supabase/ssr for proper cookie handling
 */
function createServerClientForApi(req: NextApiRequest, res: NextApiResponse) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return req.cookies[name] ?? undefined;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          // Next.js Pages Router API routes use res.setHeader for cookies
          const cookieString = `${name}=${value}; Path=/; ${options.httpOnly ? 'HttpOnly;' : ''} ${options.secure ? 'Secure;' : ''} ${options.sameSite ? `SameSite=${options.sameSite};` : ''} ${options.maxAge ? `Max-Age=${options.maxAge};` : ''}`;
          res.setHeader('Set-Cookie', cookieString);
        } catch (error) {
          // Ignore errors - cookie setting may fail in some contexts
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          // Next.js Pages Router API routes use res.setHeader for cookies
          const cookieString = `${name}=; Path=/; Max-Age=0; ${options.httpOnly ? 'HttpOnly;' : ''} ${options.secure ? 'Secure;' : ''}`;
          res.setHeader('Set-Cookie', cookieString);
        } catch (error) {
          // Ignore errors - cookie removal may fail in some contexts
        }
      },
    },
  });
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
 * Uses @supabase/ssr for proper cookie handling
 */
function createServerClientForMiddleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({
          name,
          value,
          ...options,
        });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.cookies.set({
          name,
          value,
          ...options,
        });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({
          name,
          value: '',
          ...options,
        });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.cookies.set({
          name,
          value: '',
          ...options,
        });
      },
    },
  });
}

/**
 * Get the current authenticated user with their role from middleware
 * 
 * @param request - Next.js middleware request
 * @returns Authenticated user with role, or null if not authenticated
 */
export async function getCurrentUserWithRoleFromMiddleware(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  try {
    const supabase = createServerClientForMiddleware(request);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    // Debug logging (remove in production)
    if (process.env.NODE_ENV === 'development') {
      console.log('[Middleware] getUser result:', {
        hasUser: !!user,
        authError: authError?.message,
        userId: user?.id,
        userEmail: user?.email,
      });
    }

    if (authError || !user) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Middleware] No user found, returning null');
      }
      return null;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = (profile?.role as UserRole) ?? 'user';
    const validRoles: UserRole[] = ['user', 'editor', 'admin'];
    const validatedRole = validRoles.includes(role) ? role : 'user';

    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log('[Middleware] Final user result:', {
        id: user.id,
        email: user.email,
        role: validatedRole,
        profileError: profileError?.message,
      });
    }

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
 * Uses @supabase/ssr for proper cookie handling
 */
function createServerClientForSSR(context: GetServerSidePropsContext) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return context.req.cookies[name] ?? undefined;
      },
      set(name: string, value: string, options: CookieOptions) {
        // For SSR, we need to set cookies via response headers
        const cookieString = `${name}=${value}; Path=/; ${options.httpOnly ? 'HttpOnly;' : ''} ${options.secure ? 'Secure;' : ''} ${options.sameSite ? `SameSite=${options.sameSite};` : ''} ${options.maxAge ? `Max-Age=${options.maxAge};` : ''}`;
        context.res.setHeader('Set-Cookie', cookieString);
      },
      remove(name: string, options: CookieOptions) {
        const cookieString = `${name}=; Path=/; Max-Age=0; ${options.httpOnly ? 'HttpOnly;' : ''} ${options.secure ? 'Secure;' : ''}`;
        context.res.setHeader('Set-Cookie', cookieString);
      },
    },
  });
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

    // Debug logging (remove in production)
    if (process.env.NODE_ENV === 'development') {
      console.log('[SSR] getUser result:', {
        hasUser: !!user,
        authError: authError?.message,
        userId: user?.id,
        userEmail: user?.email,
      });
    }

    if (authError || !user) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[SSR] No user found, returning null');
      }
      return null;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = (profile?.role as UserRole) ?? 'user';
    const validRoles: UserRole[] = ['user', 'editor', 'admin'];
    const validatedRole = validRoles.includes(role) ? role : 'user';

    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log('[SSR] Final user result:', {
        id: user.id,
        email: user.email,
        role: validatedRole,
        profileError: profileError?.message,
      });
    }

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

