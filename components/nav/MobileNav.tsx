import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { User, Session } from '@supabase/supabase-js';

import { Button } from '@/components/ui/Button';
import { getCurrentUser, onAuthStateChange } from '@/lib/authHelpers';
import { LoginForm } from '@/components/account/LoginForm';
import { SignupForm } from '@/components/account/SignupForm';
import { AccountView } from '@/components/account/AccountView';
import { ResetPasswordForm } from '@/components/account/ResetPasswordForm';
import { NavigationData, NavigationCategory, NavigationItem, NavigationSubcategory } from './types';
import { ArrowUpRightIcon, ChevronLeftIcon } from '@heroicons/react/24/outline';

interface MobileNavProps {
  navigation: NavigationData;
  onMenuOpenChange?: (isOpen: boolean) => void;
  onAccountClick: () => void;
  logoHref?: string;
  isAuthed?: boolean;
  /** Redirect path after login/signup (e.g. from ?redirect=). */
  redirectTo?: string;
}

export const MobileNav = ({ navigation, onMenuOpenChange, onAccountClick, logoHref = '/', isAuthed, redirectTo }: MobileNavProps) => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string>(navigation.categories[0]?.id ?? '');
  const [activeSubcategoryId, setActiveSubcategoryId] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountView, setAccountView] = useState<'login' | 'signup' | 'forgot-password'>('login');
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState<string>('');

  const activeCategory: NavigationCategory | undefined = useMemo(
    () => navigation.categories.find((category) => category.id === activeCategoryId),
    [navigation.categories, activeCategoryId]
  );

  useEffect(() => {
    if (!activeCategory) {
      setActiveSubcategoryId(null);
      setActiveItemId(null);
      return;
    }

    const defaultSubcategory = activeCategory.subcategories[0];
    setActiveSubcategoryId((prev) => prev ?? defaultSubcategory?.id ?? null);
    setActiveItemId((prev) => prev ?? defaultSubcategory?.items[0]?.id ?? null);
  }, [activeCategory]);

  useEffect(() => {
    if (!activeCategory) return;
    const subcategory = activeCategory.subcategories.find((sub) => sub.id === activeSubcategoryId);
    if (subcategory && !subcategory.items.find((item) => item.id === activeItemId)) {
      setActiveItemId(subcategory.items[0]?.id ?? null);
    }
  }, [activeCategory, activeSubcategoryId, activeItemId]);

  const activeSubcategory: NavigationSubcategory | undefined = activeCategory?.subcategories.find(
    (sub) => sub.id === activeSubcategoryId
  );

  const activeItem: NavigationItem | undefined = activeSubcategory?.items.find(
    (item) => item.id === activeItemId
  );

  const closeNav = () => {
    if (isOpen && !isClosing) {
      setShowAccountPanel(false);
      setIsClosing(true);
      onMenuOpenChange?.(false); // Notify parent that menu is closing
      closingTimeoutRef.current = setTimeout(() => {
        setIsOpen(false);
        setIsClosing(false);
        if (closingTimeoutRef.current) {
          closingTimeoutRef.current = null;
        }
      }, 500);
    }
  };

  // Auth state for in-place account panel
  useEffect(() => {
    const loadSession = async () => {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      setAccountLoading(false);
    };
    loadSession();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (event === 'SIGNED_IN') setAccountView('login');
      if (event === 'SIGNED_OUT') setAccountView('login');
    });
    return () => unsubscribe();
  }, []);

  const toggleNav = () => {
    if (isOpen) {
      closeNav();
    } else {
      // Clear any existing closing timeout
      if (closingTimeoutRef.current) {
        clearTimeout(closingTimeoutRef.current);
        closingTimeoutRef.current = null;
      }
      setIsOpen(true);
      setIsClosing(false);
      onMenuOpenChange?.(true); // Notify parent that menu is opening
    }
  };

  // Notify parent when menu state changes
  useEffect(() => {
    onMenuOpenChange?.(isOpen);
  }, [isOpen, onMenuOpenChange]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closingTimeoutRef.current) {
        clearTimeout(closingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="lg:hidden w-full">
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
          <span className={`absolute block h-0.5 w-6 bg-white transition-all duration-300 ${isOpen ? 'rotate-45' : '-translate-y-2'}`} />
          <span className={`absolute block h-0.5 w-6 bg-white transition-all duration-300 ${isOpen ? 'opacity-0' : 'opacity-100'}`} />
          <span className={`absolute block h-0.5 w-6 bg-white transition-all duration-300 ${isOpen ? '-rotate-45' : 'translate-y-2'}`} />
        </button>
      </div>

      {(isOpen || isClosing) && (
        <>
          {/* Background overlay with transition */}
          <div 
            className={`fixed top-[0px] left-0 right-0 bottom-0 z-[50] backdrop-blur-sm bg-black/10 transition-all duration-500 ease-out ${isOpen && !isClosing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
            onClick={closeNav} 
          />
          <div 
            className={`fixed top-[86px] left-3 right-3 bottom-0 z-[75] rounded-[1.5rem] backdrop-blur-lg bg-black/35 mb-5 transform transition-all duration-500 ease-out ${isOpen && !isClosing ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'}`} 
            onClick={closeNav} 
          />
          <div 
            className={`fixed top-[86px] left-3 right-3 bottom-0 z-[80] rounded-[1.5rem] overflow-hidden text-white flex flex-col mb-5 transform transition-all duration-500 ease-out ${isOpen && !isClosing ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'}`}
          >
            {/* Fixed top row: Journal (half) + Login (half) — does not scroll */}
            <div className="flex-shrink-0 flex items-center border-b border-white/20 text-sm font-semibold antialiased rounded-t-[1.5rem] backdrop-blur-lg bg-black/35 overflow-hidden">
              <div className="relative flex w-1/2 justify-center pl-5 pr-2 pt-5 pb-4">
                <span className="pointer-events-none absolute inset-y-[-20px] rounded-t-[1.5rem] left-[-4px] right-[-4px] backdrop-blur-sm bg-gradient-to-r from-accent-300/50 via-dark_accent-700/40 to-neutral-500/50 transition" />
                <a
                  href={navigation.topLinks.journal.href}
                  className="relative flex items-center justify-center gap-1 w-full text-gray-200 transition hover:opacity-90 antialiased"
                  onClick={closeNav}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>{navigation.topLinks.journal.label.replace(/\s*↗$/, '')}</span>
                  <ArrowUpRightIcon className="h-3 w-3 -translate-y-[1px] flex-shrink-0" strokeWidth={3.5} />
                </a>
              </div>
              <div className="flex w-1/2 justify-end pr-6 pt-5 pb-4">
                <button
                  onClick={() => {
                    if (showAccountPanel) {
                      setShowAccountPanel(false);
                    } else {
                      setShowAccountPanel(true);
                    }
                  }}
                  className="hover:text-white/80 flex items-center gap-1"
                >
                {showAccountPanel ? (
                  <>
                    <ChevronLeftIcon className="h-4 w-4" strokeWidth={2.5} />
                    Back
                  </>
                ) : (
                  isAuthed ? 'Account' : 'Login'
                )}
                </button>
              </div>
            </div>

            {/* Scrollable body: Nav content or Account panel */}
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide backdrop-blur-lg bg-black/35">
            {showAccountPanel ? (
              <div className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto scrollbar-hide px-6 pt-6 transition-opacity duration-200">
                  {accountLoading ? (
                    <div className="flex justify-center py-12 text-white/60 antialiased">Loading...</div>
                  ) : user && session ? (
                    <AccountView user={user} onClose={closeNav} roundTopCorners={false} />
                  ) : accountView === 'login' ? (
                    <LoginForm
                      onSwitchToSignup={() => setAccountView('signup')}
                      onSuccess={() => {}}
                      onForgotPassword={(email) => {
                        setForgotPasswordEmail(email);
                        setAccountView('forgot-password');
                      }}
                      redirectTo={redirectTo}
                    />
                  ) : accountView === 'signup' ? (
                    <SignupForm
                      onSwitchToLogin={() => setAccountView('login')}
                      onSuccess={() => {}}
                      redirectTo={redirectTo}
                    />
                  ) : (
                    <ResetPasswordForm
                      initialEmail={forgotPasswordEmail}
                      onBack={() => setAccountView('login')}
                    />
                  )}
                </div>
                <div className="flex-shrink-0 px-6 py-4 border-t border-white/20">
                  <a
                    href="https://myfinediet.practicebetter.io/#/signin"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-white/70 hover:text-white/90 transition-colors antialiased"
                  >
                    Practice Better Login →
                  </a>
                </div>
              </div>
            ) : (
            <div className="pb-10 space-y-0">
            {/* Row 2: Categories */}
            <div className="flex justify-between border-b bg-black/10 border-white/20 px-6 backdrop-blur-lg bg-black-50 py-5 text-sm font-semibold antialiased">
              {navigation.categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    setActiveCategoryId(category.id);
                    setActiveSubcategoryId(category.subcategories[0]?.id ?? null);
                    setActiveItemId(category.subcategories[0]?.items[0]?.id ?? null);
                  }}
                  className={`nav-category-button relative  px-0 py-1 transition-colors ${
                    activeCategoryId === category.id ? 'bg-transparent text-white active' : 'bg-white/0 text-white/60'
                  }`}
                >
                  {category.label}
                </button>
              ))}
            </div>

            {/* Row 3: Subcategories and Items */}
            <div className="px-4 py-0 border-b border-white/20">
              <div className="grid grid-cols-2 gap-0">
                {activeCategory?.subcategories.map((subcategory, index) => {
                  const total = activeCategory.subcategories.length;
                  const lastRowStart = total - (total % 2 === 0 ? 2 : 1);
                  const isLeftColumn = index % 2 === 0;
                  const isInLastRow = index >= lastRowStart;
                  
                  return (
                    <div
                      key={subcategory.id}
                      className={`space-y-1 py-3 pl-2 ${
                        isLeftColumn ? 'border-r border-white/20' : ''
                      } ${
                        !isInLastRow ? 'border-b border-white/20' : ''
                      }`}
                    >
                      <div className="text-left text-sm font-semibold text-white antialiased">
                        {subcategory.name}
                      </div>
                      <div className="space-y-1 pl-2">
                        {subcategory.items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setActiveSubcategoryId(subcategory.id);
                              setActiveItemId(item.id);
                            }}
                            className={`block w-full text-left text-sm font-light transition-colors antialiased ${
                              activeItemId === item.id ? 'text-white' : 'text-white/70 hover:text-white'
                            }`}
                          >
                            {activeItemId === item.id ? `• ${item.title}` : item.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Preview */}
            {activeItem && (
              <div className="px-4 pt-5">
                <div className="space-y-4">
                  <div
                    className={`relative w-full overflow-hidden rounded-[1.5rem] ${(activeItem.buttons?.[0]?.href ?? activeItem.href) ? 'cursor-pointer' : ''}`}
                    onClick={() => {
                      const imageHref = activeItem!.buttons?.[0]?.href ?? activeItem!.href;
                      if (imageHref) {
                        closeNav();
                        router.push(imageHref);
                      }
                    }}
                    onKeyDown={(e) => {
                      const imageHref = activeItem!.buttons?.[0]?.href ?? activeItem!.href;
                      if (imageHref && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        closeNav();
                        router.push(imageHref);
                      }
                    }}
                    role={(activeItem.buttons?.[0]?.href ?? activeItem.href) ? 'button' : undefined}
                    tabIndex={(activeItem.buttons?.[0]?.href ?? activeItem.href) ? 0 : undefined}
                  >
                    <div className="relative aspect-[4/3]">
                      <Image
                        src={activeItem.image}
                        alt={activeItem.title}
                        fill
                        className="object-cover"
                      />
                    </div>
                  </div>
                  <div className="pt-2 space-y-1">
                    <h3 className="text-3xl font-semibold antialiased">{activeItem.title}</h3>
                    <p className="text-sm font-light text-white/80 antialiased">{activeItem.description}</p>
                    {activeItem.buttons?.length ? (
                      <div className="flex w-full gap-3 pt-1">
                        {activeItem.buttons.map((button, index) => {
                          const targetHref = button.href ?? activeItem.href;
                          const basisClass = index === 0 ? 'basis-3/5' : index === 1 ? 'basis-2/5' : 'basis-full';
                          return (
                            <Button
                              key={button.label}
                              variant={button.variant as any}
                              size="sm"
                              onClick={() => {
                                if (targetHref) {
                                  closeNav();
                                  router.push(targetHref);
                                }
                              }}
                              className={`${basisClass} min-w-[120px] gap-2 justify-center`}
                            >
                              <span>{button.label}</span>
                            </Button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
            </div>
            )}
            </div>
          </div>
        </>
      )}
      
      <style jsx>{`
        .nav-category-button {
          position: relative;
        }
        .nav-category-button.active::after {
          content: '';
          position: absolute;
          bottom: -3px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 4px solid transparent;
          border-right: 4px solid transparent;
          border-top: 4px solid white;
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
};
