import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { AppContext } from 'next/app';
import { useRouter } from 'next/router';

import { NavBar } from '@/components/nav/NavBar';
import { Footer } from '@/components/footer';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { getNavigationContent, getFooterContent, getGlobalContent } from '@/lib/contentApi';
import { NavigationContent, FooterContent, GlobalContent } from '@/lib/contentTypes';
import Link from 'next/link';

interface MyAppProps extends AppProps {
  navigation: NavigationContent;
  footerContent: FooterContent;
  globalContent: GlobalContent;
}

function MyApp({ Component, pageProps, navigation, footerContent, globalContent }: MyAppProps) {
  const router = useRouter();
  
  // Check if current route is an admin route
  const isAdminRoute = router.pathname.startsWith('/admin') || router.asPath.startsWith('/admin');
  
  // Check if current route is an assessment/results flow route
  const isAssessmentFlow =
    router.asPath.startsWith('/gut-check') ||
    router.asPath.startsWith('/gut-pattern-breakdown') ||
    router.asPath.startsWith('/results/');

  // For admin routes, use AdminLayout (no public header/footer)
  if (isAdminRoute) {
    return (
      <AdminLayout>
        <Component {...pageProps} />
      </AdminLayout>
    );
  }

  // For assessment flow routes, render without Header/Footer
  if (isAssessmentFlow) {
    return (
      <main className="bg-brand-900 min-h-screen">
        <Component {...pageProps} />
      </main>
    );
  }

  // For all other routes, render with full layout (Header/Footer)
  return (
    <>
      {/* Announcement Bar */}
      {globalContent.announcementBar?.enabled && (
        <div className="bg-dark_accent-500 text-neutral-900 text-center py-2 px-4">
          {globalContent.announcementBar.href ? (
            <Link
              href={globalContent.announcementBar.href}
              className="hover:underline font-medium"
            >
              {globalContent.announcementBar.message}
            </Link>
          ) : (
            <p className="font-medium">{globalContent.announcementBar.message}</p>
          )}
        </div>
      )}
      <NavBar navigation={navigation} />
      <main className="bg-brand-900 min-h-screen">
        <Component {...pageProps} />
      </main>
      <Footer footerContent={footerContent} />
    </>
  );
}

MyApp.getInitialProps = async (appContext: AppContext) => {
  // Fetch global content (navigation, footer, and global settings) for all pages
  const [navigation, footerContent, globalContent] = await Promise.all([
    getNavigationContent(),
    getFooterContent(),
    getGlobalContent(),
  ]);

  // Call the page's getInitialProps if it exists
  let pageProps = {};
  if (appContext.Component.getInitialProps) {
    pageProps = await appContext.Component.getInitialProps(appContext.ctx);
  }

  // Merge global props with page-specific props
  return {
    pageProps,
    navigation,
    footerContent,
    globalContent,
  };
};

export default MyApp;
