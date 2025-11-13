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
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [activeSubcategoryId, setActiveSubcategoryId] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

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
    if (!activeCategory || !activeSubcategoryId) return;
    const subcategory = activeCategory.subcategories.find((sub) => sub.id === activeSubcategoryId);
    if (!subcategory) return;
    if (!subcategory.items.find((item) => item.id === activeItemId)) {
      setActiveItemId(subcategory.items[0]?.id ?? null);
    }
  }, [activeCategory, activeSubcategoryId, activeItemId]);

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

  const navBackgroundClasses = isHomepage
    ? 'bg-transparent text-white'
    : 'bg-neutral-900 text-white shadow-md';

  return (
    <nav className={`fixed top-0 left-0 right-0 z-[60] ${navBackgroundClasses}`}>
      <div className="relative">
        {isHomepage && (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[110px] bg-gradient-to-b from-black/25 to-black/5 z-[5]" />
        )}
        <div className="relative z-[10]">
          <div className="mx-auto flex items-center justify-between max-w-[1200px] px-4 py-4">
            <DesktopNav
              navigation={navigation}
              activeCategoryId={activeCategoryId}
              onCategorySelect={handleCategorySelect}
              onCategoryHover={handleCategoryHover}
            />
            <MobileNav navigation={navigation} />
          </div>
        </div>
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
      {isDesktop && activeCategory && (
        <div className="fixed inset-0 z-[40] bg-black/70" onClick={closeDrawer} />
      )}
    </nav>
  );
};
