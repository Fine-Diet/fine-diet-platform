import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { AppContext } from 'next/app';

import { NavBar } from '@/components/nav/NavBar';
import { Footer } from '@/components/footer';
import { getNavigationContent, getFooterContent } from '@/lib/contentApi';
import { NavigationContent, FooterContent } from '@/lib/contentTypes';

interface MyAppProps extends AppProps {
  navigation: NavigationContent;
  footerContent: FooterContent;
}

function MyApp({ Component, pageProps, navigation, footerContent }: MyAppProps) {
  return (
    <>
      <NavBar navigation={navigation} />
      <main className="bg-brand-900 min-h-screen">
        <Component {...pageProps} />
      </main>
      <Footer footerContent={footerContent} />
    </>
  );
}

MyApp.getInitialProps = async (appContext: AppContext) => {
  // Fetch global content (navigation and footer) for all pages
  const [navigation, footerContent] = await Promise.all([
    getNavigationContent(),
    getFooterContent(),
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
  };
};

export default MyApp;
