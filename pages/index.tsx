import { GetStaticProps } from 'next';

import { HeroSection } from '@/components/home/HeroSection';
import { FeatureSection } from '@/components/home/FeatureSection';
import { GridSection } from '@/components/home/GridSection';
import { CTASection } from '@/components/home/CTASection';
import { getHomeContent } from '@/lib/contentApi';
import { HomeContent } from '@/lib/contentTypes';
import { getSeoForRoute } from '@/lib/seo/getSeo';
import { SeoHead } from '@/components/seo/SeoHead';

interface HomeProps {
  homeContent: HomeContent;
  seoResult: Awaited<ReturnType<typeof getSeoForRoute>>;
}

export default function Home({ homeContent, seoResult }: HomeProps) {
  return (
    <>
      <SeoHead seo={seoResult.seo} assets={seoResult.assets} />
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
  const [homeContent, seoResult] = await Promise.all([
    getHomeContent(),
    getSeoForRoute({
      routePath: '/',
      pageTitle: 'Fine Diet • Read your body. Reset your health.',
      pageDescription: 'Bridging everyday wellness with real nutrition strategy and lifestyle therapy so you don\'t have to figure it out alone.',
    }),
  ]);

  return {
    props: {
      homeContent,
      seoResult,
    },
    // Enable ISR with 300 second revalidation (5 minutes)
    // This allows SEO updates to propagate without full redeploy
    // Pages are statically generated at build time and revalidated in background
    revalidate: 300,
  };
};
