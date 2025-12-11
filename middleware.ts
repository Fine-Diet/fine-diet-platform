import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserWithRoleFromMiddleware } from './lib/authServer';

/**
 * Middleware for host-based routing and admin route protection
 * 
 * 1. Rewrites journal.myfinediet.com/ to /journal-waitlist
 * 2. Protects /admin/* routes with role-based access control
 */
export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const pathname = request.nextUrl.pathname;
  const url = request.nextUrl.clone();

  // Existing journal subdomain rewrite logic
  const isJournalSubdomain = host.startsWith('journal.myfinediet.com');
  if (isJournalSubdomain && pathname === '/') {
    url.pathname = '/journal-waitlist';
    return NextResponse.rewrite(url);
  }

  // Protect /admin/* routes
  if (pathname.startsWith('/admin')) {
    try {
      const user = await getCurrentUserWithRoleFromMiddleware(request);

      // Not authenticated - redirect to login
      if (!user) {
        url.pathname = '/login';
        url.searchParams.set('redirect', pathname);
        return NextResponse.redirect(url);
      }

      // Check role - only 'editor' and 'admin' can access
      if (user.role !== 'editor' && user.role !== 'admin') {
        // Redirect to home or unauthorized page
        url.pathname = '/';
        url.searchParams.delete('redirect');
        return NextResponse.redirect(url);
      }

      // User is authenticated and has required role - allow access
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

