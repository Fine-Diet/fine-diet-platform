import Head from 'next/head';

import { HeroSection } from '@/components/home/HeroSection';
import { FeatureSection } from '@/components/home/FeatureSection';
import { GridSection } from '@/components/home/GridSection';
import { CTASection } from '@/components/home/CTASection';
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
        <div className="pb-2">
          <HeroSection />
        </div>
        {homeContent.featureSections.map((section, index) => (
          <div key={`feature-${index}`} className="px-4 pb-2 pt-4">
            <FeatureSection content={section} />
          </div>
        ))}
        {homeContent.gridSections?.map((section, index) => (
          <div key={`grid-${index}`} className="px-4 pb-2 pt-4">
            <GridSection section={section} />
          </div>
        ))}
        {homeContent.ctaSection && (
          <div className="pt-2">
            <CTASection content={homeContent.ctaSection} />
          </div>
        )}
      </main>
    </>
  );
}
