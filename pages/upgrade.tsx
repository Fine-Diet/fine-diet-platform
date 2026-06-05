/**
 * /upgrade — subscribe / re-subscribe surface for lapsed or locked-tool users.
 *
 * SSR resolves the viewer's access state:
 *   - not signed in        -> /login?redirect=/upgrade
 *   - active subscriber     -> /app (already has access)
 *   - data_access_only/none -> show the default offer with "tools locked, data kept" framing
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { resolveAccessStateForPerson } from '@/lib/access/accessState';
import { getDefaultPublicOffer } from '@/lib/access/offerConfig';
import { toMarketingDTO, type OfferMarketingDTO } from '@/lib/access/offerCatalogService';
import OfferCard from '@/components/offers/OfferCard';
import type { AppAccessStateName } from '@/lib/access/accessStateTypes';

interface UpgradePageProps {
  primaryOffer: OfferMarketingDTO;
  state: AppAccessStateName;
}

export default function UpgradePage({ primaryOffer, state }: UpgradePageProps) {
  const isLapsed = state === 'data_access_only';

  return (
    <>
      <Head>
        <title>Subscribe &bull; Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-brand-900 text-white">
        <section className="mx-auto max-w-3xl px-4 pt-16 pb-20 sm:pt-24">
          <span className="text-xs font-semibold uppercase tracking-wider text-denim-400 antialiased">
            {isLapsed ? 'Your data is safe' : 'Subscribe'}
          </span>
          <h1 className="mt-3 text-3xl font-bold leading-tight text-white antialiased sm:text-4xl">
            {isLapsed ? 'Unlock your tools again' : 'Subscribe to Fine Diet'}
          </h1>
          <p className="mt-4 text-base text-white/70 antialiased">
            {isLapsed
              ? 'Your account and saved data are still here. Subscribe to re-activate journaling, insights, recipes, meal scheduling, and programs.'
              : 'One subscription unlocks the full Fine Diet app and programs as they run.'}
          </p>

          <div className="mt-8">
            <OfferCard offer={primaryOffer} placement="upgrade" featured />
          </div>
        </section>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<UpgradePageProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user) {
    return {
      redirect: { destination: '/login?redirect=/upgrade&ctx=generic', permanent: false },
    };
  }

  const { data: personRow } = await supabaseAdmin
    .from('people')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  const resolved = await resolveAccessStateForPerson(personRow?.id ?? null);

  // Already has active app access -> send to the app.
  if (resolved.canUseActiveTools) {
    return {
      redirect: { destination: '/app', permanent: false },
    };
  }

  return {
    props: {
      primaryOffer: toMarketingDTO(getDefaultPublicOffer()),
      state: resolved.state,
    },
  };
};
