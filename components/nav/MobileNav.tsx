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
    <div className="lg:hidden w-full">
      <div className="flex items-center justify-between px-6 py-6">
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
        <button
          type="button"
          aria-label="Toggle navigation"
          onClick={() => setIsOpen((prev) => !prev)}
          className="relative inline-flex h-10 w-10 flex-col items-center justify-center text-white z-[60]"
        >
          <span className={`absolute block h-0.5 w-6 bg-white transition-all duration-300 ${isOpen ? 'rotate-45' : '-translate-y-2'}`} />
          <span className={`absolute block h-0.5 w-6 bg-white transition-all duration-300 ${isOpen ? 'opacity-0' : 'opacity-100'}`} />
          <span className={`absolute block h-0.5 w-6 bg-white transition-all duration-300 ${isOpen ? '-rotate-45' : 'translate-y-2'}`} />
        </button>
      </div>

      {isOpen && (
        <>
          <div className="fixed top-[85px] left-0 right-0 bottom-0 z-[30] backdrop-blur-sm bg-black/10" onClick={closeNav} />
          <div className="fixed top-[85px] left-0 right-0 bottom-0 z-[45] bg-neutral-900 text-white overflow-y-auto">
            <div className="pb-10 space-y-6">
            {/* Row 1: Top Links */}
            <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3 text-sm font-semibold antialiased">
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
            <div className="flex justify-between border-b border-neutral-700 px-4 py-2 text-sm font-semibold antialiased">
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
                  <div className="text-left text-sm font-semibold text-white antialiased">
                    {subcategory.name}
                  </div>
                  <div className="space-y-2 pl-3">
                    {subcategory.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveItemId(item.id)}
                        className={`block w-full text-left text-sm font-light transition-colors antialiased ${
                          activeItemId === item.id ? 'text-white' : 'text-white/70 hover:text-white'
                        }`}
                      >
                        {activeItemId === item.id ? `• ${item.title}` : item.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Preview */}
            {activeItem && (
              <div className="px-4">
                <div className="space-y-4">
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
                    <h3 className="text-2xl font-semibold antialiased">{activeItem.title}</h3>
                    <p className="text-sm font-light text-white/80 antialiased">{activeItem.description}</p>
                    {activeItem.buttons?.length ? (
                      <div className="flex w-full gap-3">
                        {activeItem.buttons.map((button, index) => {
                          const targetHref = button.href ?? activeItem.href;
                          const basisClass = index === 0 ? 'basis-2/5' : index === 1 ? 'basis-3/5' : 'basis-full';
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

            <div className="px-4">
              <Button variant="tertiary" className="w-full" onClick={closeNav}>
                Close Menu
              </Button>
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
};
