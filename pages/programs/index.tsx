import type { GetStaticProps } from 'next';
import Head from 'next/head';

import ProgramsIndexView from '@/components/programs/ProgramsIndexView';
import type { ProgramCollectionDefinition } from '@/lib/programs/programCollectionTypes';
import {
  buildProgramsIndexCollectionCards,
  getProgramsIndexContent,
  type ProgramsIndexCollectionCard,
  type ProgramsIndexContent,
} from '@/lib/programs/programsIndexContent';

interface Props {
  content: ProgramsIndexContent;
  collections: ProgramsIndexCollectionCard[];
}

export default function ProgramsIndexPage({ content, collections }: Props) {
  return (
    <>
      <Head>
        <title>Programs · Fine Diet</title>
        <meta name="description" content={content.description} />
      </Head>
      <ProgramsIndexView content={content} collections={collections} />
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  const { getPublishedProgramSeriesForPublic } = await import(
    '@/lib/programs/programSeriesDeliveryServerService'
  );
  const collections = (await getPublishedProgramSeriesForPublic()) as ProgramCollectionDefinition[];
  const content = getProgramsIndexContent();

  return {
    props: {
      content,
      collections: buildProgramsIndexCollectionCards(collections),
    },
    revalidate: 300,
  };
};
