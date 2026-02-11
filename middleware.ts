import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserWithRoleFromMiddleware } from './lib/authServer';
import { isSafeRedirectTarget } from './lib/redirectHelpers';
import { hasJournalAccess } from './lib/access/accessService';

/** Build redirect URL with original path+query for post-login/post-waitlist return */
function redirectParam(pathname: string, search: string): string {
  const full = search ? `${pathname}${search}` : pathname;
  return isSafeRedirectTarget(full) ? full : pathname;
}

/**
 * Middleware for host-based routing, journal gating, and admin route protection
 *
 * 1. Routes journal.myfinediet.com/ with auth + entitlement gating
 * 2. Gates /journal and /journal/*: requires session + journal access (subscriptions.journal_access)
 * 3. Protects /admin/* routes with role-based access control
 */
export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const pathname = request.nextUrl.pathname;
  const search = request.nextUrl.search || '';
  const url = request.nextUrl.clone();

  // -------------------------------------------------------------------------
  // Journal subdomain routing: journal.myfinediet.com
  // -------------------------------------------------------------------------
  const isJournalSubdomain = host.startsWith('journal.myfinediet.com');
  if (isJournalSubdomain && pathname === '/') {
    // For subdomain root, apply full gating then rewrite to /journal if entitled
    const user = await getCurrentUserWithRoleFromMiddleware(request);

    if (!user) {
      // Not authenticated → redirect to login with redirect back to subdomain root
      url.pathname = '/login';
      url.searchParams.set('redirect', redirectParam('/', search));
      return NextResponse.redirect(url);
    }

    // Check journal access (compat shim: subscriptions then entitlements)
    try {
      const { supabaseAdmin } = await import('./lib/supabaseServerClient');
      const { data: person } = await supabaseAdmin
        .from('people')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (!person?.id) {
        // No person record → show waitlist
        url.pathname = '/journal-waitlist';
        url.searchParams.set('redirect', redirectParam('/', search));
        return NextResponse.redirect(url);
      }

      const allowed = await hasJournalAccess(person.id);
      if (!allowed) {
        // No entitlement → show waitlist
        url.pathname = '/journal-waitlist';
        url.searchParams.set('redirect', redirectParam('/', search));
        return NextResponse.redirect(url);
      }

      // Entitled → rewrite to /journal (Pages Router journal page)
      url.pathname = '/journal';
      return NextResponse.rewrite(url);
    } catch (err) {
      console.error('[Middleware] Journal subdomain access check failed:', err);
      url.pathname = '/journal-waitlist';
      url.searchParams.set('redirect', redirectParam('/', search));
      return NextResponse.redirect(url);
    }
  }

  // -------------------------------------------------------------------------
  // Journal gate: /journal and /journal/* (exclude /journal-waitlist)
  // Applies to both main domain and subdomain paths
  // -------------------------------------------------------------------------
  const isJournalRoute =
    pathname === '/journal' || (pathname.startsWith('/journal/') && !pathname.startsWith('/journal-waitlist'));
  if (isJournalRoute) {
    const user = await getCurrentUserWithRoleFromMiddleware(request);

    if (!user) {
      url.pathname = '/login';
      url.searchParams.set('redirect', redirectParam(pathname, search));
      return NextResponse.redirect(url);
    }

    // Check journal access (compat shim: subscriptions then entitlements)
    try {
      const { supabaseAdmin } = await import('./lib/supabaseServerClient');
      const { data: person } = await supabaseAdmin
        .from('people')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (!person?.id) {
        url.pathname = '/journal-waitlist';
        url.searchParams.set('redirect', redirectParam(pathname, search));
        return NextResponse.redirect(url);
      }

      const allowed = await hasJournalAccess(person.id);
      if (!allowed) {
        url.pathname = '/journal-waitlist';
        url.searchParams.set('redirect', redirectParam(pathname, search));
        return NextResponse.redirect(url);
      }
    } catch (err) {
      console.error('[Middleware] Journal access check failed:', err);
      url.pathname = '/journal-waitlist';
      url.searchParams.set('redirect', redirectParam(pathname, search));
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  }

  // Protect /admin/* routes
  if (pathname.startsWith('/admin')) {
    try {
      const user = await getCurrentUserWithRoleFromMiddleware(request);

      // Debug logging (remove in production)
      if (process.env.NODE_ENV === 'development') {
        console.log('[Middleware] /admin route check:', {
          pathname,
          hasUser: !!user,
          userRole: user?.role,
          userEmail: user?.email,
        });
      }

      // Not authenticated - redirect to login
      if (!user) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[Middleware] No user, redirecting to /login');
        }
        url.pathname = '/login';
        url.searchParams.set('redirect', pathname);
        return NextResponse.redirect(url);
      }

      // Special case: /admin/people requires admin role only
      if (pathname.startsWith('/admin/people')) {
        if (user.role !== 'admin') {
          if (process.env.NODE_ENV === 'development') {
            console.log('[Middleware] /admin/people requires admin role, user has:', user.role);
          }
          // Redirect to admin dashboard (editors can access other admin pages)
          url.pathname = '/admin';
          url.searchParams.delete('redirect');
          return NextResponse.redirect(url);
        }
        // Admin user accessing /admin/people - allow access
        if (process.env.NODE_ENV === 'development') {
          console.log('[Middleware] Admin authorized for /admin/people');
        }
        return NextResponse.next();
      }

      // For other /admin/* routes, check role - only 'editor' and 'admin' can access
      if (user.role !== 'editor' && user.role !== 'admin') {
        if (process.env.NODE_ENV === 'development') {
          console.log('[Middleware] User role not allowed:', user.role, 'redirecting to /');
        }
        // Redirect to home or unauthorized page
        url.pathname = '/';
        url.searchParams.delete('redirect');
        return NextResponse.redirect(url);
      }

      // User is authenticated and has required role - allow access
      if (process.env.NODE_ENV === 'development') {
        console.log('[Middleware] User authorized, allowing access to', pathname);
      }
      return NextResponse.next();
    } catch (error) {
      // On error, redirect to login for safety
      console.error('Middleware auth error:', error);
      url.pathname = '/login';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }
  }

  // For all other routes, continue normally
  return NextResponse.next();
}

/**
 * Middleware configuration
 * 
 * Matches all routes except:
 * - Static files (_next/static, favicon, etc.)
 * - API routes (/api)
 * - Image optimization (_next/image)
 * - Other Next.js internal routes
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, fonts, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|eot)).*)',
  ],
};

