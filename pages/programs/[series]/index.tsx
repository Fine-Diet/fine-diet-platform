import type { GetStaticPaths, GetStaticProps } from 'next';
import ProgramCategoryView from '@/components/programs/ProgramCategoryView';
import { ModuleRenderer } from '@/components/modules/ModuleRenderer';
import { resolveProgramCategoryContent } from '@/lib/programs/programCategoryContent';
import type { ProgramCategoryContent } from '@/lib/programs/programCategoryContent';
import type { ProgramCollectionDefinition } from '@/lib/programs/programCollectionTypes';
import type { PageComposition } from '@/lib/modules/types';
import { getSeoForRoute } from '@/lib/seo/getSeo';
import type { SeoMeta } from '@/lib/seo/getSeo';
import { SeoHead } from '@/components/seo/SeoHead';
import { composePageSeoOverride } from '@/lib/seo/seoSocialFields';

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
  /**
   * Resolved SEO metadata. Required for the public route; admin preview frames
   * may omit it (no SeoHead rendered).
   */
  seo?: SeoMeta | null;
}

export default function ProgramSeriesPage({
  series: collection,
  category,
  composition,
  seo,
}: Props) {
  return (
    <>
      {seo ? <SeoHead seo={seo} /> : null}
      {composition ? (
        <main className="min-h-screen bg-brand-50 text-brand-900">
          <ModuleRenderer composition={composition} layout="stacked" />
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

  // Standardize /programs/[series] onto the shared SeoHead pipeline. The
  // marketing product record's `seo` block wins over the route-level
  // seo:route:/programs/{series} record, then the collection's catalogue
  // title/description, then the global fallback.
  const pageOverride = marketingProduct
    ? composePageSeoOverride({
        seo: marketingProduct.seo ?? null,
        legacyTitle: marketingProduct.seoTitle,
        legacyDescription: marketingProduct.seoDescription,
      })
    : null;

  const seoResult = await getSeoForRoute({
    routePath: `/programs/${series.slug}`,
    pageTitle: marketingProduct?.title ?? series.title,
    pageDescription: marketingProduct?.seoDescription ?? series.description,
    pageOverride,
  });

  return {
    props: {
      series,
      category: resolveProgramCategoryContent(series),
      composition: useComposition ? composition : null,
      seo: seoResult.seo,
    },
    revalidate: 300,
  };
};
