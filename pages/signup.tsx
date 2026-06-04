import type { GetServerSideProps } from 'next';

/**
 * /signup — alias for the canonical /create-account page.
 *
 * Preserves all query params (ctx, redirect, email, offer, assessment, etc.)
 * via a server-side redirect so links pointing at /signup keep working.
 */
export default function SignupAlias() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(context.query)) {
    if (typeof v === 'string') params.set(k, v);
    else if (Array.isArray(v) && v.length > 0) params.set(k, v[0]);
  }
  const qs = params.toString();
  return {
    redirect: {
      destination: `/create-account${qs ? `?${qs}` : ''}`,
      permanent: false,
    },
  };
};
