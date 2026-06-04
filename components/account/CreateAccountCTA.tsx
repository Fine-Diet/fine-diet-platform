import Link from 'next/link';
import { buildAuthUrl, type AuthSource } from '@/lib/auth/authContext';

interface CreateAccountCTAProps {
  /** Optional post-auth redirect (relative path). */
  redirectTo?: string;
  /** Source label for context copy. Defaults to 'marketing'. */
  source?: AuthSource;
  /** Button label. */
  label?: string;
  className?: string;
}

/**
 * CreateAccountCTA — reusable "Create account" link for marketing surfaces.
 *
 * Routes to the canonical /create-account page with context (source=marketing
 * by default) via buildAuthUrl, so copy/prefill/redirect stay consistent.
 */
export function CreateAccountCTA({
  redirectTo,
  source = 'marketing',
  label = 'Create account',
  className = '',
}: CreateAccountCTAProps) {
  const href = buildAuthUrl({ intent: 'signup', source, redirectTo });

  return (
    <Link
      href={href}
      className={
        className ||
        'inline-flex items-center justify-center gap-2 rounded-full bg-denim-500 hover:bg-denim-400 text-white px-6 py-3 text-base font-medium transition-colors antialiased'
      }
    >
      {label}
    </Link>
  );
}
