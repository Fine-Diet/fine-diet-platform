import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import ProgramCategoryView from '@/components/programs/ProgramCategoryView';
import { resolveProgramCategoryContent } from '@/lib/programs/programCategoryContent';
import type { ProgramCategoryContent } from '@/lib/programs/programCategoryContent';
import type { ProgramSeriesDefinition } from '@/lib/programs/programSeriesTypes';

interface Props {
  series: ProgramSeriesDefinition;
  category: ProgramCategoryContent;
}

export default function ProgramSeriesPage({ series, category }: Props) {
  return (
    <>
      <Head>
        <title>{series.title} &bull; Fine Diet Programs</title>
        <meta name="description" content={series.description} />
      </Head>
      <ProgramCategoryView series={series} content={category} />
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

  return {
    props: {
      series,
      category: resolveProgramCategoryContent(series),
    },
    revalidate: 300,
  };
};
