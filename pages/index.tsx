import Head from 'next/head';

import { HeroSection } from '@/components/home/HeroSection';
import { FeatureSection } from '@/components/home/FeatureSection';
import { GridSection } from '@/components/home/GridSection';
import homeContent from '@/data/homeContent.json';

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
      <div className="pb-1">
        <HeroSection />
        </div>
        {homeContent.featureSections.map((section, index) => (
          <div key={index} className="px-2 py-1">
            <FeatureSection content={section} />
          </div>
        ))}
        {homeContent.gridSections?.map((section, index) => (
          <div key={index} className="px-2 py-1">
            <GridSection section={section} />
          </div>
        ))}
      </main>
    </>
  );
}
