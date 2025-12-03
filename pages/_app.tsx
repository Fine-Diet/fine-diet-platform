import '../styles/globals.css';
import type { AppProps } from 'next/app';

import { NavBar } from '@/components/nav/NavBar';
import { Footer } from '@/components/footer';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <NavBar />
      <main className="bg-brand-900 min-h-screen">
        <Component {...pageProps} />
      </main>
      <Footer />
    </>
  );
}

export default MyApp;
