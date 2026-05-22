import type { GetServerSideProps } from 'next';

import { APP_ROUTES } from '@/lib/routes/appRoutes';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: APP_ROUTES.plans,
    permanent: false,
  },
});

export default function TodayPlanRedirect() {
  return null;
}
