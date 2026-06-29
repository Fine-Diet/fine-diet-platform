import type { GetStaticPaths, GetStaticProps } from 'next';

interface Props { slug: string }

export default function RuntimePreview({ slug }: Props) {
  return <div>{slug}</div>;
}

export const getStaticPaths: GetStaticPaths = async () => ({ paths: [], fallback: false });

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => ({
  props: { slug: String(params?.slug ?? '') },
});
