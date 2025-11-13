import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { Button } from '@/components/ui/Button';
import { NavigationData, NavigationCategory, NavigationItem, NavigationSubcategory } from './types';

interface MobileNavProps {
  navigation: NavigationData;
}

export const MobileNav = ({ navigation }: MobileNavProps) => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string>(navigation.categories[0]?.id ?? '');
  const [activeSubcategoryId, setActiveSubcategoryId] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

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
    setIsOpen(false);
  };

  return (
    <div className="md:hidden w-full">
      <div className="flex items-center justify-between px-4 py-3">
        <Image
          src="/images/home/Fine-Diet-Logo.svg"
          alt="Fine Diet"
          width={110}
          height={30}
          priority
          className="h-8 w-auto"
        />
        <button
          type="button"
          aria-label="Toggle navigation"
          onClick={() => setIsOpen((prev) => !prev)}
          className="inline-flex h-10 w-10 flex-col items-center justify-center space-y-1 rounded-full bg-white/10 text-white"
        >
          <span className="block h-0.5 w-6 bg-white transition-all duration-200" />
          <span className="block h-0.5 w-6 bg-white transition-all duration-200" />
          <span className="block h-0.5 w-6 bg-white transition-all duration-200" />
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[45] bg-neutral-900 text-white overflow-y-auto">
          <div className="pt-[76px] pb-10 space-y-6">
            {/* Row 1: Top Links */}
            <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3 text-sm font-semibold">
              <a
                href={navigation.topLinks.journal.href}
                className="hover:text-white/80"
                onClick={closeNav}
                target="_blank"
                rel="noopener noreferrer"
              >
                {navigation.topLinks.journal.label}
              </a>
              <Link href={navigation.topLinks.account.href} className="hover:text-white/80" onClick={closeNav}>
                {navigation.topLinks.account.label}
              </Link>
            </div>

            {/* Row 2: Categories */}
            <div className="flex justify-between border-b border-neutral-700 px-4 py-2 text-sm font-semibold">
              {navigation.categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    setActiveCategoryId(category.id);
                    setActiveSubcategoryId(category.subcategories[0]?.id ?? null);
                    setActiveItemId(category.subcategories[0]?.items[0]?.id ?? null);
                  }}
                  className={`rounded-full px-3 py-1 transition-colors ${
                    activeCategoryId === category.id ? 'bg-white text-neutral-900' : 'bg-white/10 text-white'
                  }`}
                >
                  {category.label}
                </button>
              ))}
            </div>

            {/* Row 3: Subcategories and Items */}
            <div className="px-4 py-3 space-y-4">
              {activeCategory?.subcategories.map((subcategory) => (
                <div key={subcategory.id} className="space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSubcategoryId(subcategory.id);
                      setActiveItemId(subcategory.items[0]?.id ?? null);
                    }}
                    className={`text-left text-sm font-semibold ${
                      activeSubcategoryId === subcategory.id ? 'text-white' : 'text-white/70 hover:text-white'
                    }`}
                  >
                    {activeSubcategoryId === subcategory.id ? `• ${subcategory.name}` : subcategory.name}
                  </button>
                  <div className="space-y-2 pl-3">
                    {subcategory.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveItemId(item.id)}
                        className={`block w-full text-left text-sm font-light transition-colors ${
                          activeItemId === item.id ? 'text-white' : 'text-white/70 hover:text-white'
                        }`}
                      >
                        {item.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Preview */}
            {activeItem && (
              <div className="px-4">
                <div className="space-y-4 rounded-[2.5rem] bg-neutral-800/90 p-4">
                  <div className="relative w-full overflow-hidden rounded-[2.5rem]">
                    <div className="relative aspect-[4/3]">
                      <Image
                        src={activeItem.image}
                        alt={activeItem.title}
                        fill
                        className="object-cover"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-semibold">{activeItem.title}</h3>
                    <p className="text-sm font-light text-white/80">{activeItem.description}</p>
                    {activeItem.button && (
                      <Button
                        variant={activeItem.button.variant as any}
                        onClick={() => {
                          if (activeItem.href) {
                            closeNav();
                            router.push(activeItem.href);
                          }
                        }}
                        className="gap-2"
                      >
                        <span>{activeItem.button.label}</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="px-4">
              <Button variant="tertiary" className="w-full" onClick={closeNav}>
                Close Menu
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
