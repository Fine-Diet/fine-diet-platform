/**
 * Shared auth context model.
 *
 * Single source of truth for "where did this auth attempt come from and where
 * should it go". Consumed by the dedicated /create-account and /login pages,
 * the AccountDrawer / MobileNav, and the underlying Login/Signup forms.
 *
 * Canonical post-auth param is `?redirect=` (relative paths only). `returnTo`
 * is accepted as a read-only alias on the way IN, but `buildAuthUrl` always
 * emits `redirect` on the way OUT.
 */

import { getSafeRedirectTarget } from '@/lib/redirectHelpers';

export type AuthIntent = 'login' | 'signup';

export type AuthSource =
  | 'checkout'
  | 'assessment'
  | 'waitlist'
  | 'generic'
  | 'marketing';

export interface AuthContext {
  /** Which tab/form to show first. */
  intent: AuthIntent;
  /** Drives context-specific copy. */
  source: AuthSource;
  /** Safe relative path to send the user after auth, or '' when none. */
  redirectTo: string;
  /** Prefill: email address. */
  email?: string;
  /** Prefill: display name. */
  name?: string;
  /** Checkout copy detail — offer being purchased. */
  offerKey?: string;
  /** Assessment claim preservation — survives email confirm + Google OAuth. */
  assessmentSlug?: string;
  /** Assessment submission id (also enables /results/<id> fallback). */
  submissionId?: string;
  /** Guest tracking/session id used for the assessment claim. */
  sessionId?: string;
}

export interface AuthCopy {
  title: string;
  subtitle: string;
}

/**
 * Neutral landing surface used when no safe redirect/context exists.
 * No-context signups land here — never auto-routed into onboarding,
 * checkout, the Baseline Program, or the app dashboard.
 */
export const NEUTRAL_POST_AUTH_TARGET = '/account/start';

const VALID_INTENTS: ReadonlySet<string> = new Set<AuthIntent>(['login', 'signup']);
const VALID_SOURCES: ReadonlySet<string> = new Set<AuthSource>([
  'checkout',
  'assessment',
  'waitlist',
  'generic',
  'marketing',
]);

type QueryValue = string | string[] | undefined | null;
type QueryLike = Record<string, QueryValue>;

/** Read the first string value from a Next.js query field. */
function firstString(value: QueryValue): string | undefined {
  if (Array.isArray(value)) return value[0];
  if (typeof value === 'string') return value;
  return undefined;
}

function parseIntent(value: QueryValue): AuthIntent {
  const v = firstString(value);
  return v && VALID_INTENTS.has(v) ? (v as AuthIntent) : 'login';
}

function parseSource(value: QueryValue): AuthSource {
  const v = firstString(value);
  return v && VALID_SOURCES.has(v) ? (v as AuthSource) : 'generic';
}

/**
 * Parse an AuthContext from a query object (Next.js router.query or
 * URLSearchParams-derived record). All fields are optional and safe-defaulted.
 *
 * Reads `redirect` (canonical) and falls back to `returnTo` (alias). Both are
 * validated as safe relative paths; anything else is dropped.
 */
export function parseAuthContext(query: QueryLike): AuthContext {
  const rawRedirect = firstString(query.redirect) ?? firstString(query.returnTo);
  const redirectTo = getSafeRedirectTarget(rawRedirect, '');

  return {
    intent: parseIntent(query.intent),
    source: parseSource(query.ctx),
    redirectTo,
    email: firstString(query.email) || undefined,
    name: firstString(query.name) || undefined,
    offerKey: firstString(query.offer) || undefined,
    assessmentSlug: firstString(query.assessment) || undefined,
    submissionId: firstString(query.submission) || undefined,
    sessionId: firstString(query.session) || undefined,
  };
}

const COPY: Record<AuthSource, Record<AuthIntent, AuthCopy>> = {
  checkout: {
    signup: {
      title: 'Create your account to finish checkout',
      subtitle: 'Set up your account, then continue to secure payment.',
    },
    login: {
      title: 'Log in to finish checkout',
      subtitle: 'Sign in to continue to secure payment.',
    },
  },
  assessment: {
    signup: {
      title: 'Save your results',
      subtitle: 'Create a free account to keep your assessment and track progress.',
    },
    login: {
      title: 'Log in to save your results',
      subtitle: 'Sign in to attach this assessment to your account.',
    },
  },
  waitlist: {
    signup: {
      title: 'Create your account',
      subtitle: 'Sign up to join the journal waitlist and get early access.',
    },
    login: {
      title: 'Log in',
      subtitle: 'Sign in to check your journal access.',
    },
  },
  marketing: {
    signup: {
      title: 'Create your Fine Diet account',
      subtitle: 'Sign up to access your programs, assessments, and personalized care.',
    },
    login: {
      title: 'Welcome back',
      subtitle: 'Log in to your Fine Diet account.',
    },
  },
  generic: {
    signup: {
      title: 'Create account',
      subtitle: 'Sign up to access your programs, assessments, and personalized care.',
    },
    login: {
      title: 'Login',
      subtitle: 'Sign in to access your Fine Diet account.',
    },
  },
};

/** Context-specific headline + subhead for the given context. */
export function getAuthCopy(ctx: Pick<AuthContext, 'source' | 'intent'>): AuthCopy {
  return COPY[ctx.source]?.[ctx.intent] ?? COPY.generic[ctx.intent];
}

/**
 * Build a canonical auth URL for the given (partial) context.
 *
 * - Routes to /create-account when intent is 'signup', else /login.
 * - ALWAYS emits `redirect` (never `returnTo`).
 * - Only includes fields that are present.
 */
export function buildAuthUrl(ctx: Partial<AuthContext>): string {
  const intent: AuthIntent = ctx.intent === 'signup' ? 'signup' : 'login';
  const basePath = intent === 'signup' ? '/create-account' : '/login';

  const params = new URLSearchParams();
  if (intent === 'signup') params.set('intent', 'signup');
  if (ctx.source && ctx.source !== 'generic') params.set('ctx', ctx.source);

  const safeRedirect = getSafeRedirectTarget(ctx.redirectTo, '');
  if (safeRedirect) params.set('redirect', safeRedirect);

  if (ctx.email) params.set('email', ctx.email);
  if (ctx.name) params.set('name', ctx.name);
  if (ctx.offerKey) params.set('offer', ctx.offerKey);
  if (ctx.assessmentSlug) params.set('assessment', ctx.assessmentSlug);
  if (ctx.submissionId) params.set('submission', ctx.submissionId);
  if (ctx.sessionId) params.set('session', ctx.sessionId);

  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/**
 * Resolve where to send the user after successful auth.
 * Returns the safe redirect when present, otherwise the neutral
 * /account/start landing — never an app/checkout/onboarding deep-link.
 */
export function resolvePostAuthTarget(ctx: Pick<AuthContext, 'redirectTo'>): string {
  return getSafeRedirectTarget(ctx.redirectTo, NEUTRAL_POST_AUTH_TARGET);
}

/* ──────────────────────────────────────────────────────────────────────────
   localStorage persistence — keeps context alive across the
   signup → email-confirm/OAuth → return-and-login gap.
   ────────────────────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'fd_auth_context';

/** Subset persisted to localStorage. Kept small + serialisable. */
export type PersistedAuthContext = Omit<AuthContext, 'intent'>;

export function persistAuthContext(ctx: AuthContext): void {
  if (typeof window === 'undefined') return;
  try {
    const { intent: _intent, ...rest } = ctx;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch {
    // Non-fatal — persistence is best-effort.
  }
}

export function readPersistedAuthContext(): PersistedAuthContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedAuthContext;
    // Re-validate the redirect on read so a stale/unsafe value can't slip through.
    return {
      ...parsed,
      redirectTo: getSafeRedirectTarget(parsed.redirectTo, ''),
    };
  } catch {
    return null;
  }
}

export function clearPersistedAuthContext(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-fatal.
  }
}
