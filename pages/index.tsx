import Head from 'next/head';
import { GetStaticProps } from 'next';

import { HeroSection } from '@/components/home/HeroSection';
import { FeatureSection } from '@/components/home/FeatureSection';
import { GridSection } from '@/components/home/GridSection';
import { CTASection } from '@/components/home/CTASection';
import { getHomeContent } from '@/lib/contentApi';
import { HomeContent } from '@/lib/contentTypes';

interface HomeProps {
  homeContent: HomeContent;
}

export default function Home({ homeContent }: HomeProps) {
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
        <div className="pb-1.5">
          <HeroSection homeContent={homeContent} />
        </div>
        {homeContent.featureSections.map((section, index) => (
          <div key={`feature-${index}`} className="px-3 pb-1.5 pt-1.5">
            <FeatureSection content={section} />
          </div>
        ))}
        {homeContent.gridSections?.map((section, index) => (
          <div key={`grid-${index}`} className="px-3 pb-3 pt-1.5">
            <GridSection section={section} />
          </div>
        ))}
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<HomeProps> = async () => {
  const homeContent = await getHomeContent();

  return {
    props: {
      homeContent,
    },
  };
};
