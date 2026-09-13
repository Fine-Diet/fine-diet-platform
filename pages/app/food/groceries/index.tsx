import type { GetServerSideProps } from 'next';

export default function LegacyGroceriesRedirect() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') params.set(key, value);
  }
  const suffix = params.toString();
  return {
    redirect: {
      destination: `/app/food/lists${suffix ? `?${suffix}` : ''}`,
      permanent: false,
    },
  };
};
