import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';

import navigation from '@/data/navigation.json';

import { DesktopNav } from './DesktopNav';
import { MobileNav } from './MobileNav';
import { NavDrawer } from './NavDrawer';
import { NavigationCategory } from './types';

const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQueryList = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);

    setMatches(mediaQueryList.matches);
    if (mediaQueryList.addEventListener) {
      mediaQueryList.addEventListener('change', listener);
    } else {
      mediaQueryList.addListener(listener);
    }

    return () => {
      if (mediaQueryList.removeEventListener) {
        mediaQueryList.removeEventListener('change', listener);
      } else {
        mediaQueryList.removeListener(listener);
      }
    };
  }, [query]);

  return matches;
};

export const NavBar = () => {
  const router = useRouter();
  const isHomepage = router.pathname === '/';
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [activeSubcategoryId, setActiveSubcategoryId] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const activeCategory: NavigationCategory | null = useMemo(() => {
    if (!activeCategoryId) return null;
    return navigation.categories.find((category) => category.id === activeCategoryId) ?? null;
  }, [activeCategoryId]);

  useEffect(() => {
    if (!isDesktop) {
      // Clear any closing timeout when switching to mobile
      if (closingTimeoutRef.current) {
        clearTimeout(closingTimeoutRef.current);
        closingTimeoutRef.current = null;
      }
      setActiveCategoryId(null);
      setActiveSubcategoryId(null);
      setActiveItemId(null);
      setIsClosing(false);
    }
  }, [isDesktop]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closingTimeoutRef.current) {
        clearTimeout(closingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!activeCategory) {
      setActiveSubcategoryId(null);
      setActiveItemId(null);
      return;
    }

    const defaultSubcategory = activeCategory.subcategories[0];
    setActiveSubcategoryId(defaultSubcategory?.id ?? null);
    setActiveItemId(defaultSubcategory?.items[0]?.id ?? null);
  }, [activeCategory]);

  useEffect(() => {
    if (!isHomepage) {
      setHasScrolled(true);
      return;
    }

    const handleScroll = () => {
      setHasScrolled(window.scrollY > 120);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isHomepage]);

  const handleCategorySelect = (categoryId: string) => {
    // Clear any existing closing timeout
    if (closingTimeoutRef.current) {
      clearTimeout(closingTimeoutRef.current);
      closingTimeoutRef.current = null;
    }

    if (activeCategoryId === categoryId) {
      // Start closing animation
      setIsClosing(true);
      // Clear category after animation completes (500ms matches duration-500)
      closingTimeoutRef.current = setTimeout(() => {
        setActiveCategoryId(null);
        setActiveSubcategoryId(null);
        setActiveItemId(null);
        setIsClosing(false);
        closingTimeoutRef.current = null;
      }, 500);
    } else {
      setActiveCategoryId(categoryId);
      setIsClosing(false);
    }
  };

  const handleCategoryHover = (categoryId: string) => {
    if (!isDesktop) return;
    if (isClosing) return; // Don't open while closing
    
    // Clear any existing closing timeout
    if (closingTimeoutRef.current) {
      clearTimeout(closingTimeoutRef.current);
      closingTimeoutRef.current = null;
    }
    
    setActiveCategoryId(categoryId);
    setIsClosing(false);
  };

  const closeDrawer = () => {
    if (activeCategoryId) {
      // Clear any existing closing timeout
      if (closingTimeoutRef.current) {
        clearTimeout(closingTimeoutRef.current);
        closingTimeoutRef.current = null;
      }
      
      setIsClosing(true);
      closingTimeoutRef.current = setTimeout(() => {
        setActiveCategoryId(null);
        setActiveSubcategoryId(null);
        setActiveItemId(null);
        setIsClosing(false);
        closingTimeoutRef.current = null;
      }, 500);
    }
  };

  const handleNavigate = (href: string) => {
    closeDrawer();
    router.push(href);
  };

  const isDrawerOpen = Boolean(isDesktop && activeCategory && !isClosing);
  const isMobileMenuOpenState = !isDesktop && isMobileMenuOpen; // Only true on mobile

  const navBackgroundClasses = isHomepage && !hasScrolled && !isDrawerOpen && !isMobileMenuOpenState
    ? 'bg-transparent text-white rounded-[2.5rem] max-w-[1200px] mx-auto'
    : isDrawerOpen || isMobileMenuOpenState
    ? 'bg-neutral-900/0 text-white shadow-md rounded-[2.5rem] max-w-[1200px] mx-auto'  // No blur when drawer or mobile menu is open
    : 'backdrop-blur-lg text-white shadow-md rounded-[2.5rem] max-w-[1200px] mx-auto';  // Blur when drawer is closed

  return (
    <>
      <nav className={`fixed top-4 left-5 right-5 z-[60] overflow-visible ${navBackgroundClasses}`}>
        <div className="relative">
          {isHomepage && !hasScrolled && !isDrawerOpen && (
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[85px]   " />
          )}
          <div className="relative z-[60] px-6">
            <div className="mx-auto hidden max-w-[1200px] items-center justify-between gap-3 px-6 py-6 lg:flex">
              <Link href="/" className="flex items-center gap-2">
                <Image
                  src="/images/home/Fine-Diet-Logo.svg"
                  alt="Fine Diet"
                  width={140}
                  height={32}
                  priority
                  className="h-5 w-auto"
                />
              </Link>
              <DesktopNav
                navigation={navigation}
                activeCategoryId={activeCategoryId}
                onCategorySelect={handleCategorySelect}
                onCategoryHover={handleCategoryHover}
              />
            </div>
            <MobileNav 
              navigation={navigation} 
              onMenuOpenChange={setIsMobileMenuOpen}
            />
            {isDesktop && (
              <NavDrawer
                open={Boolean(activeCategory && !isClosing)}
                category={activeCategory}
                activeSubcategoryId={activeSubcategoryId}
                activeItemId={activeItemId}
                onSubcategorySelect={(subcategoryId) => setActiveSubcategoryId(subcategoryId)}
                onItemSelect={(itemId) => setActiveItemId(itemId)}
                onNavigate={handleNavigate}
              />
            )}
          </div>
        </div>
      </nav>
      {isDesktop && activeCategory && !isClosing && (
        <div className="fixed top-0 left-0 right-0 bottom-0 z-[30] backdrop-blur-sm bg-black/10" onClick={closeDrawer} />
      )}
    </>
  );
};
