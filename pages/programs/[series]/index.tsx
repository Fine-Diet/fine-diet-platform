import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import ProgramCategoryView from '@/components/programs/ProgramCategoryView';
import { ModuleRenderer } from '@/components/modules/ModuleRenderer';
import { resolveProgramCategoryContent } from '@/lib/programs/programCategoryContent';
import type { ProgramCategoryContent } from '@/lib/programs/programCategoryContent';
import type { ProgramCollectionDefinition } from '@/lib/programs/programCollectionTypes';
import type { PageComposition } from '@/lib/modules/types';

interface Props {
  // `series` is retained as the route/storage-boundary key (the `[series]`
  // route folder + program_series storage). It represents the Collection.
  series: ProgramCollectionDefinition;
  category: ProgramCategoryContent;
  /**
   * Published marketing composition for this collection, when one exists. When
   * null (today's default state), the page falls back to the code-catalogue
   * driven ProgramCategoryView so existing behavior is fully preserved.
   */
  composition: PageComposition | null;
  /** SEO override from the marketing product record, when one exists. */
  seo: { title: string; description: string } | null;
}

export default function ProgramSeriesPage({
  series: collection,
  category,
  composition,
  seo,
}: Props) {
  return (
    <>
      <Head>
        <title>{seo?.title ?? `${collection.title} \u2022 Fine Diet Programs`}</title>
        <meta
          name="description"
          content={seo?.description ?? collection.description}
        />
      </Head>
      {composition ? (
        <main className="min-h-screen bg-neutral-0">
          <ModuleRenderer composition={composition} />
        </main>
      ) : (
        <ProgramCategoryView collection={collection} content={category} />
      )}
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const { getProgramSeriesStaticPathsForPublic } = await import(
    '@/lib/programs/programSeriesDeliveryServerService'
  );
  return {
    paths: (await getProgramSeriesStaticPathsForPublic()).map((series) => ({
      params: { series },
    })),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const rawSeries = params?.series;
  const seriesSlug = Array.isArray(rawSeries) ? rawSeries[0] : rawSeries;
  const { getProgramSeriesBySlugForPublic } = await import(
    '@/lib/programs/programSeriesDeliveryServerService'
  );
  const series = seriesSlug
    ? await getProgramSeriesBySlugForPublic(seriesSlug)
    : null;

  if (!series) {
    return { notFound: true };
  }

  // Composition-driven marketing layer (additive). Public routes read the
  // PUBLISHED composition only — drafts are admin-preview only and never leak
  // here. When absent, `composition` stays null and the code catalogue renders.
  const { buildProgramMarketingSlug, getProgramsMarketingComposition, getProgramsMarketingProductRecord } =
    await import('@/lib/programs/programsMarketingApi');
  const marketingSlug = buildProgramMarketingSlug(series.slug);
  const [composition, marketingProduct] = await Promise.all([
    getProgramsMarketingComposition(marketingSlug, 'published'),
    getProgramsMarketingProductRecord(marketingSlug, 'published'),
  ]);

  // Publish gate (mirrors integrative-care, which requires BOTH a product record
  // and a composition): a composition only takes over the public render when its
  // marketing product record is ALSO published. The product record is therefore
  // the explicit publish switch — seeding a composition JSON alone does not flip
  // the live page, so the code catalogue keeps rendering until a collection is
  // intentionally published to the template.
  const useComposition = Boolean(marketingProduct && composition);

  return {
    props: {
      series,
      category: resolveProgramCategoryContent(series),
      composition: useComposition ? composition : null,
      seo: marketingProduct
        ? { title: marketingProduct.seoTitle, description: marketingProduct.seoDescription }
        : null,
    },
    revalidate: 300,
  };
};
