import type { GetServerSideProps } from 'next';

export default function LegacyGroceryListRedirect() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ params, query }) => {
  const listId = typeof params?.listId === 'string' ? params.listId : '';
  const search = new URLSearchParams({ listId });
  for (const [key, value] of Object.entries(query)) {
    if (key !== 'listId' && typeof value === 'string') search.set(key, value);
  }
  return {
    redirect: {
      destination: `/app/food/lists?${search.toString()}`,
      permanent: false,
    },
  };
};
