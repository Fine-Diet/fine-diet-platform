import Head from 'next/head';

import { HeroSection } from '@/components/home/HeroSection';
import { FeatureSection } from '@/components/home/FeatureSection';

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
        <HeroSection />
        <div className="px-4 pb-2 pt-4">
          <FeatureSection />
        </div>
      </main>
    </>
  );
}
