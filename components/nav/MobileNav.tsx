import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { User, Session } from '@supabase/supabase-js';

import { getSession, onAuthStateChange, signOut } from '@/lib/authHelpers';
import { LoginForm } from '@/components/account/LoginForm';
import { SignupForm } from '@/components/account/SignupForm';
import { ResetPasswordForm } from '@/components/account/ResetPasswordForm';
import { NavDrawerCards } from './NavDrawerCards';
import { NavigationData, NavigationCategory } from './types';
import { ArrowUpRightIcon } from '@heroicons/react/24/outline';
import {
  SHARED_PROGRAM_CARDS,
  ASSESSMENT_TYPE_MAP,
  ASSESSMENTS_EMPTY_FALLBACK,
  PROGRAMS_SEE_MORE_HREF,
  ASSESSMENTS_SEE_MORE_HREF,
} from '@/lib/config/accountCards';

interface MobileNavProps {
  navigation: NavigationData;
  onMenuOpenChange?: (isOpen: boolean) => void;
  onAccountClick: () => void;
  logoHref?: string;
  isAuthed?: boolean;
  redirectTo?: string;
}

type MobileAuthView = 'login' | 'signup' | 'forgot-password';

interface AssessmentSubmission {
  id: string;
  assessment_type: string;
  assessment_version: number;
  primary_avatar: string;
  created_at: string;
}

export const MobileNav = ({
  navigation,
  onMenuOpenChange,
  logoHref = '/',
  isAuthed,
  redirectTo,
}: MobileNavProps) => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Accordion state — which category row is expanded
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);

  // Auth panel state
  const [showAuthPanel, setShowAuthPanel] = useState(false);
  const [authView, setAuthView] = useState<MobileAuthView>('login');
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');

  // Runtime auth state
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [expandAccountSection, setExpandAccountSection] = useState(false);

  // Assessment data — fetched lazily when the account section is first opened
  const [assessmentSubmissions, setAssessmentSubmissions] = useState<AssessmentSubmission[] | null>(null);
  const [assessmentsLoading, setAssessmentsLoading] = useState(false);

  // Load initial session
  useEffect(() => {
    const loadSession = async () => {
      const sess = await getSession();
      setUser(sess?.user ?? null);
      setSession(sess);
      setAccountLoading(false);
    };
    loadSession();
  }, []);

  // Subscribe to auth changes
  useEffect(() => {
    const unsubscribe = onAuthStateChange((event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (event === 'SIGNED_IN') setAuthView('login');
      if (event === 'SIGNED_OUT') setAuthView('login');
    });
    return () => unsubscribe();
  }, []);

  const isAuthenticated = !!(user && session);

  // Lazy-fetch assessments when the account section is first expanded
  useEffect(() => {
    if (!expandAccountSection || !isAuthenticated) return;
    if (assessmentSubmissions !== null || assessmentsLoading) return;
    setAssessmentsLoading(true);
    fetch('/api/account/assessments')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { submissions: AssessmentSubmission[] }) => {
        setAssessmentSubmissions(data.submissions ?? []);
      })
      .catch(() => {
        setAssessmentSubmissions([]);
      })
      .finally(() => setAssessmentsLoading(false));
  }, [expandAccountSection, isAuthenticated, assessmentSubmissions, assessmentsLoading]);

  // Reset fetched assessment data when the user signs out
  useEffect(() => {
    if (!isAuthenticated) {
      setAssessmentSubmissions(null);
    }
  }, [isAuthenticated]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (closingTimeoutRef.current) clearTimeout(closingTimeoutRef.current);
    };
  }, []);

  const closeNav = () => {
    if (!isOpen || isClosing) return;
    setIsClosing(true);
    onMenuOpenChange?.(false);
    closingTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      setExpandedCategoryId(null);
      setShowAuthPanel(false);
      closingTimeoutRef.current = null;
    }, 400);
  };

  const toggleNav = () => {
    if (isOpen) {
      closeNav();
    } else {
      if (closingTimeoutRef.current) {
        clearTimeout(closingTimeoutRef.current);
        closingTimeoutRef.current = null;
      }
      setIsOpen(true);
      setIsClosing(false);
      onMenuOpenChange?.(true);
    }
  };

  useEffect(() => {
    onMenuOpenChange?.(isOpen);
  }, [isOpen, onMenuOpenChange]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleNavigate = (href: string) => {
    closeNav();
    router.push(href);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut();
      closeNav();
      router.reload();
    } catch {
      setLoggingOut(false);
    }
  };

  const toggleCategory = (categoryId: string) => {
    const isOpening = expandedCategoryId !== categoryId;
    setExpandedCategoryId((prev) => (prev === categoryId ? null : categoryId));
    if (isOpening) {
      setShowAuthPanel(false);
      setExpandAccountSection(false);
    }
  };

  const isVisible = isOpen || isClosing;
  const isAnimatedIn = isOpen && !isClosing;

  return (
    <div className="lg:hidden w-full">
      {/* Top bar: logo + hamburger */}
      <div className="flex items-center justify-between px-0 py-3.5">
        <Link href={logoHref} className="flex items-center gap-2 z-[60]">
          <Image
            src="/images/home/Fine-Diet-Logo.svg"
            alt="Fine Diet"
            width={140}
            height={32}
            priority
            className="h-5 w-auto"
          />
        </Link>
        <button
          type="button"
          aria-label="Toggle navigation"
          onClick={toggleNav}
          className="relative inline-flex h-10 w-10 flex-col items-center justify-center text-white z-[60]"
        >
          <span
            className={`absolute block h-0.5 w-6 bg-white transition-all duration-300 ${
              isOpen ? 'rotate-45' : '-translate-y-2'
            }`}
          />
          <span
            className={`absolute block h-0.5 w-6 bg-white transition-all duration-300 ${
              isOpen ? 'opacity-0' : 'opacity-100'
            }`}
          />
          <span
            className={`absolute block h-0.5 w-6 bg-white transition-all duration-300 ${
              isOpen ? '-rotate-45' : 'translate-y-2'
            }`}
          />
        </button>
      </div>

      {isVisible && (
        <>
          {/* Backdrop */}
          <div
            className={`fixed top-0 left-0 right-0 bottom-0 z-[50] backdrop-blur-sm bg-black/10 transition-all duration-[400ms] ease-out ${
              isAnimatedIn ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            onClick={closeNav}
          />

          {/* Panel */}
          <div
            className={`fixed top-[86px] right-3 w-[calc(100%-1.5rem)] max-w-[400px] z-[80] rounded-[1.5rem] overflow-hidden text-white backdrop-blur-lg bg-black/35 transform transition-all duration-[400ms] ease-out ${
              isAnimatedIn ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
            }`}
          >
            {/* ── Top bar: auth status ────────────────────────── */}
            {isAuthenticated ? (
              /* Row 1: Now Logged In label — fixed */
              <div className="flex items-center justify-end border-b border-white/10 px-5 py-4">
                <span className={`text-xs font-light antialiased ${
                  expandAccountSection ? 'text-neutral-500' : 'text-white/50'
                }`}>
                  Now Logged In
                </span>
              </div>
            ) : (
              /* Two-tab selector — mirrors desktop AccountDrawer first-row treatment */
              <div className="flex border-b border-white/10">
                <button
                  onClick={() => {
                    const isActive = showAuthPanel && authView === 'login';
                    if (isActive) {
                      setShowAuthPanel(false);
                    } else {
                      setShowAuthPanel(true);
                      setAuthView('login');
                      setExpandedCategoryId(null);
                      setExpandAccountSection(false);
                    }
                  }}
                  className={`flex-1 py-4 text-sm font-semibold antialiased transition-colors border-r border-white/10 ${
                    showAuthPanel && authView === 'login'
                      ? 'text-white bg-white/5'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  Login
                </button>
                <button
                  onClick={() => {
                    const isActive = showAuthPanel && authView === 'signup';
                    if (isActive) {
                      setShowAuthPanel(false);
                    } else {
                      setShowAuthPanel(true);
                      setAuthView('signup');
                      setExpandedCategoryId(null);
                      setExpandAccountSection(false);
                    }
                  }}
                  className={`flex-1 py-4 text-sm font-semibold antialiased transition-colors ${
                    showAuthPanel && authView === 'signup'
                      ? 'text-white bg-white/5'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  Create Account
                </button>
              </div>
            )}

            {/* ── Scrollable body ──────────────────────────────── */}
            <div className="overflow-y-auto max-h-[calc(100dvh-110px)] scrollbar-hide">

              {/* Account Menu toggle — scrolls with content when logged in */}
              {isAuthenticated && (
                <div className={`flex items-center border-b border-white/10 px-5 py-4 transition-colors ${
                  expandAccountSection ? 'bg-white/80' : ''
                }`}>
                  <button
                    onClick={() => {
                      setExpandAccountSection((v) => !v);
                      setExpandedCategoryId(null);
                    }}
                    className={`w-full flex items-center justify-between text-sm font-semibold antialiased ${
                      expandAccountSection ? 'text-neutral-900' : 'text-white hover:text-white/80'
                    }`}
                  >
                    Account Menu
                    <span
                      className={`inline-block transition-transform duration-200 ${
                        expandAccountSection ? '-rotate-90' : ''
                      }`}
                    >
                      <svg width="6" height="10" viewBox="0 0 6 10" fill="currentColor">
                        <polygon points="6,0 0,5 6,10" />
                      </svg>
                    </span>
                  </button>
                </div>
              )}

              {/* Auth / Account zone */}
              {isAuthenticated && expandAccountSection && !accountLoading && (
                <AccountSection
                  onNavigate={handleNavigate}
                  onLogout={handleLogout}
                  loggingOut={loggingOut}
                  assessmentSubmissions={assessmentSubmissions}
                  assessmentsLoading={assessmentsLoading}
                />
              )}

              {!isAuthenticated && showAuthPanel && (
                <div className="px-5 py-5 border-b border-white/10">
                  {accountLoading ? (
                    <p className="text-sm text-white/50 antialiased">Loading...</p>
                  ) : authView === 'login' ? (
                    <LoginForm
                      onSwitchToSignup={() => setAuthView('signup')}
                      onSuccess={closeNav}
                      onForgotPassword={(email) => {
                        setForgotPasswordEmail(email);
                        setAuthView('forgot-password');
                      }}
                      redirectTo={redirectTo}
                      hideSwitchToSignup
                    />
                  ) : authView === 'signup' ? (
                    <SignupForm
                      onSwitchToLogin={() => setAuthView('login')}
                      onSuccess={closeNav}
                      redirectTo={redirectTo}
                      hideSwitchToLogin
                    />
                  ) : (
                    <ResetPasswordForm
                      initialEmail={forgotPasswordEmail}
                      onBack={() => setAuthView('login')}
                    />
                  )}
                </div>
              )}

              {/* ── Accordion nav ────────────────────────────── */}
              <div className="space-y-0">
                {navigation.categories.map((category: NavigationCategory) => {
                  const isExpanded = expandedCategoryId === category.id;
                  return (
                    <div key={category.id} className="border-b border-white/10">
                      <button
                        type="button"
                        onClick={() => toggleCategory(category.id)}
                        className={`w-full flex items-center justify-between px-5 py-4 text-sm font-semibold antialiased transition-colors ${
                          isExpanded
                            ? 'bg-white text-neutral-900'
                            : 'text-white hover:bg-white/5'
                        }`}
                      >
                        <span>{category.label}</span>
                        <span
                          className={`inline-block transition-transform duration-200 ${
                            isExpanded ? '-rotate-90' : ''
                          }`}
                        >
                          <svg width="6" height="10" viewBox="0 0 6 10" fill="currentColor">
                            <polygon points="6,0 0,5 6,10" />
                          </svg>
                        </span>
                      </button>

                      {/* Inline cards expansion */}
                      {isExpanded && (
                        <div className="border-t border-white/5 bg-white/[0.02]">
                          <NavDrawerCards
                            category={category}
                            onNavigate={handleNavigate}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── Utility links ──────────────────────────────── */}
              <div className="border-b border-white/10">
                <a
                  href={navigation.topLinks.journal.href}
                  className="flex items-center gap-1.5 px-5 py-4 text-sm font-semibold text-white antialiased transition-colors hover:bg-white/5 w-full"
                  onClick={closeNav}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="text-white">•</span>
                  <span>Start Your Journal</span>
                </a>
              </div>
              {isAuthenticated ? (
                <>
                  <div className="border-b border-white/10">
                    <button
                      onClick={() => handleNavigate('/shop')}
                      className="flex items-center gap-1.5 px-5 py-4 text-sm font-semibold text-white antialiased transition-colors hover:bg-white/5 w-full text-left"
                    >
                      <span className="text-white">•</span>
                      <span>Shop</span>
                    </button>
                  </div>
                  <div className="border-b border-white/10">
                    <button
                      onClick={handleLogout}
                      disabled={loggingOut}
                      className="flex items-center gap-1.5 px-5 py-4 text-sm font-semibold text-white antialiased transition-colors hover:bg-white/5 w-full text-left disabled:opacity-40"
                    >
                      <span className="text-white">•</span>
                      <span>{loggingOut ? 'Logging out...' : 'Log Out'}</span>
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────
   Inline account section (logged-in, mobile)
───────────────────────────────────────────────── */

interface MobileCardData {
  id: string;
  title: string;
  description: string;
  image: string;
  href: string;
  buttonLabel: string;
}

interface AccountSectionProps {
  onNavigate: (href: string) => void;
  onLogout: () => void;
  loggingOut: boolean;
  assessmentSubmissions: AssessmentSubmission[] | null;
  assessmentsLoading: boolean;
}

function formatSubmissionDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function submissionToCard(submission: AssessmentSubmission): MobileCardData {
  const meta = ASSESSMENT_TYPE_MAP[submission.assessment_type];
  return {
    id: submission.id,
    title: meta?.title ?? submission.assessment_type,
    description: `Completed ${formatSubmissionDate(submission.created_at)}`,
    image: meta?.image ?? '/images/programs/calm-your-gut.jpg',
    href: `/results/${submission.id}`,
    buttonLabel: 'View Results',
  };
}

const AccountSection = ({
  onNavigate,
  onLogout,
  loggingOut,
  assessmentSubmissions,
  assessmentsLoading,
}: AccountSectionProps) => {
  const visiblePrograms = SHARED_PROGRAM_CARDS.slice(0, 2);
  const hasProgramOverflow = SHARED_PROGRAM_CARDS.length > 2;

  const assessmentCards = (assessmentSubmissions ?? []).map(submissionToCard);
  const visibleAssessments = assessmentCards.slice(0, 2);
  const hasAssessmentOverflow = assessmentCards.length > 2;
  const hasCompletedAssessments = assessmentCards.length > 0;

  return (
    <div className="border-b border-white/10 px-5 py-4 space-y-4">
      {/* Your Programs — static catalog (prospect-facing) */}
      {/* Real purchased-program personalization is not yet available.      */}
      {/* This section will read from /api/account/programs once that endpoint */}
      {/* and the programs entitlement model are built.                     */}
      <div>
        <p className="text-xs font-semibold text-white/40 antialiased mb-3">
          Your Programs
        </p>
        <div className="space-y-3">
          {visiblePrograms.map((card) => (
            <MobileAccountCard
              key={card.id}
              card={{ ...card, buttonLabel: card.buttonLabel ?? 'Get Started' }}
              onNavigate={onNavigate}
            />
          ))}
        </div>
        <button
          onClick={() => onNavigate(PROGRAMS_SEE_MORE_HREF)}
          className="mt-3 text-xs text-white/50 hover:text-white/80 antialiased transition-colors"
        >
          {hasProgramOverflow ? 'See more →' : 'See all programs →'}
        </button>
      </div>

      {/* Your Assessments — real data from /api/account/assessments */}
      <div>
        <p className="text-xs font-semibold text-white/40 antialiased mb-3">
          Your Assessments
        </p>

        {assessmentsLoading ? (
          <p className="text-xs text-white/40 antialiased py-2">Loading...</p>
        ) : hasCompletedAssessments ? (
          <>
            <div className="space-y-3">
              {visibleAssessments.map((card) => (
                <MobileAccountCard key={card.id} card={card} onNavigate={onNavigate} />
              ))}
            </div>
            {hasAssessmentOverflow && (
              <button
                onClick={() => onNavigate(ASSESSMENTS_SEE_MORE_HREF)}
                className="mt-3 text-xs text-white/50 hover:text-white/80 antialiased transition-colors"
              >
                See more →
              </button>
            )}
          </>
        ) : (
          /* Prospect fallback — no completed assessments */
          <MobileAccountCard
            card={{
              ...ASSESSMENTS_EMPTY_FALLBACK,
              buttonLabel: ASSESSMENTS_EMPTY_FALLBACK.buttonLabel ?? 'Get Started',
            }}
            onNavigate={onNavigate}
          />
        )}
      </div>
    </div>
  );
};

const MobileAccountCard = ({
  card,
  onNavigate,
}: {
  card: MobileCardData;
  onNavigate: (href: string) => void;
}) => (
  <div className="flex items-start gap-3">
    <div
      className="relative flex-shrink-0 w-[72px] h-[72px] overflow-hidden rounded-xl cursor-pointer"
      onClick={() => onNavigate(card.href)}
    >
      <Image src={card.image} alt={card.title} fill className="object-cover" />
    </div>
    <div className="flex-1 min-w-0">
      <h4 className="text-sm font-semibold text-white antialiased leading-tight">{card.title}</h4>
      <p className="text-xs text-white/50 antialiased mt-0.5 leading-relaxed line-clamp-2">
        {card.description}
      </p>
      <button
        onClick={() => onNavigate(card.href)}
        className="mt-1.5 w-full py-1 text-xs font-semibold text-white border border-white/25 rounded-full hover:bg-white/5 transition-colors antialiased"
      >
        {card.buttonLabel}
      </button>
    </div>
  </div>
);
