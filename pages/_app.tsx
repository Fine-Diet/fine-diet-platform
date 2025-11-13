import '../styles/globals.css';
import type { AppProps } from 'next/app';

import { NavBar } from '@/components/nav/NavBar';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <NavBar />
      <main className="bg-brand-900 min-h-screen">
        <Component {...pageProps} />
      </main>
    </>
  );
}

export default MyApp;
