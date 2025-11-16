import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
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

  const activeCategory: NavigationCategory | null = useMemo(() => {
    if (!activeCategoryId) return null;
    return navigation.categories.find((category) => category.id === activeCategoryId) ?? null;
  }, [activeCategoryId]);

  useEffect(() => {
    if (!isDesktop) {
      setActiveCategoryId(null);
      setActiveSubcategoryId(null);
      setActiveItemId(null);
    }
  }, [isDesktop]);

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
    setActiveCategoryId((prev) => (prev === categoryId ? null : categoryId));
  };

  const handleCategoryHover = (categoryId: string) => {
    if (!isDesktop) return;
    setActiveCategoryId(categoryId);
  };

  const closeDrawer = () => {
    setActiveCategoryId(null);
    setActiveSubcategoryId(null);
    setActiveItemId(null);
  };

  const handleNavigate = (href: string) => {
    closeDrawer();
    router.push(href);
  };

  const isDrawerOpen = Boolean(isDesktop && activeCategory);

  const navBackgroundClasses = isHomepage && !hasScrolled && !isDrawerOpen
    ? 'bg-transparent text-white'
    : 'bg-neutral-900 text-white shadow-md';

  return (
    <nav className={`fixed top-0 left-0 right-0 z-[60] ${navBackgroundClasses}`}>
      <div className="relative">
        {isHomepage && !hasScrolled && !isDrawerOpen && (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[85px]   " />
        )}
        <div className="relative z-[60]">
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
          <MobileNav navigation={navigation} />
          {isDesktop && (
            <NavDrawer
              open={Boolean(activeCategory)}
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
      {isDesktop && activeCategory && (
        <div className="fixed top-[85px] left-0 right-0 bottom-0 z-[30] backdrop-blur-sm bg-black/10" onClick={closeDrawer} />
      )}
    </nav>
  );
};
