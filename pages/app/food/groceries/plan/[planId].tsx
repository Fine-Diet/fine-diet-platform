import type { GetServerSideProps } from 'next';

export default function LegacyPlanListRedirect() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ params, query }) => {
  const planId = typeof params?.planId === 'string' ? params.planId : '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key !== 'planId' && typeof value === 'string') search.set(key, value);
  }
  const suffix = search.toString();
  return {
    redirect: {
      destination: `/app/food/lists/plan/${encodeURIComponent(planId)}${suffix ? `?${suffix}` : ''}`,
      permanent: false,
    },
  };
};
