import Head from 'next/head';

import { Hero } from '@/components/home/Hero';
import { TrackSection } from '@/components/home/TrackSection';

export default function Home() {
  return (
    <>
      <Head>
        <title>Fine Diet • Read your body. Reset your health.</title>
        <meta
          name="description"
          content="Bridging everyday wellness with real nutrition strategy and lifestyle therapy so you don't have to figure it out alone."
        />
      </Head>
      <main className="min-h-screen bg-brand-900">
        <Hero />
        <TrackSection />
      </main>
    </>
  );
}
