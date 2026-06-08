import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { NavigationCategory, NavigationItem } from './types';

interface NavDrawerCardsProps {
  category: NavigationCategory;
  onNavigate: (href: string) => void;
}

type NavigationItemWithPricing = NavigationItem & {
  price?: string;
  priceDescription?: string;
};

const hasPricing = (item: NavigationItemWithPricing) => Boolean(item.price || item.priceDescription);

export const NavDrawerCards = ({ category, onNavigate }: NavDrawerCardsProps) => {
  const allItems: NavigationItem[] = category.subcategories.flatMap(
    (subcategory) => subcategory.items
  );

  if (allItems.length === 0) {
    return (
      <div className="p-10 text-white/50">
        <p className="text-sm antialiased">Nothing to show here yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {allItems.map((item, index) => {
        const itemWithPricing = item as NavigationItemWithPricing;
        const primaryButton = item.buttons?.[0];
        const href = primaryButton?.href ?? item.href;
        const buttonLabel = primaryButton?.label ?? 'Get Started';

        return (
          <div key={item.id}>
            {/* Mobile layout: image left, copy right — matches MobileAccountCard */}
            <div className={`lg:hidden ${index > 0 ? 'border-t border-white/10' : ''}`}>
              <div className="flex items-start gap-3 px-5 py-4">
                <div
                  className="relative flex-shrink-0 w-[72px] h-[72px] overflow-hidden rounded-xl cursor-pointer"
                  onClick={() => href && onNavigate(href)}
                >
                  <Image src={item.image} alt={item.title} fill className="object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-white antialiased leading-tight">
                    {item.title}
                  </h4>
                  {hasPricing(itemWithPricing) && (
                    <div className="mt-0.5">
                      {itemWithPricing.price && (
                        <p className="text-xs font-bold text-white antialiased">
                          {itemWithPricing.price}
                        </p>
                      )}
                      {itemWithPricing.priceDescription && (
                        <p className="text-[11px] font-bold text-white/50 antialiased">
                          {itemWithPricing.priceDescription}
                        </p>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-white/50 antialiased mt-0.5 leading-relaxed line-clamp-2">
                    {item.description}
                  </p>
                  <button
                    onClick={() => href && onNavigate(href)}
                    className="mt-1.5 w-full py-1 text-xs font-semibold text-white border border-white/25 rounded-full hover:bg-white/5 transition-colors antialiased"
                  >
                    {buttonLabel}
                  </button>
                </div>
              </div>
            </div>

            {/* Desktop layout: original large card */}
            <div className="hidden lg:block">
              {index > 0 && <div className="border-t border-white/10" />}
              <div className="flex items-start gap-6 py-6 px-8">
                <div
                  className="relative overflow-hidden rounded-[1.75rem] flex-shrink-0 w-[180px] cursor-pointer"
                  onClick={() => href && onNavigate(href)}
                  onKeyDown={(e) => href && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onNavigate(href))}
                  role={href ? 'button' : undefined}
                  tabIndex={href ? 0 : undefined}
                >
                  <div className="relative h-[180px]">
                    <Image src={item.image} alt={item.title} fill className="object-cover" />
                  </div>
                </div>
                <div className="flex-1 flex flex-col justify-center text-white min-w-0 py-2">
                  <h3 className="text-2xl font-semibold antialiased leading-tight">
                    {item.title}
                  </h3>
                  {hasPricing(itemWithPricing) && (
                    <div className="mt-1">
                      {itemWithPricing.price && (
                        <p className="text-base font-bold text-white antialiased">
                          {itemWithPricing.price}
                        </p>
                      )}
                      {itemWithPricing.priceDescription && (
                        <p className="text-sm font-bold text-white/50 antialiased">
                          {itemWithPricing.priceDescription}
                        </p>
                      )}
                    </div>
                  )}
                  <p className="mt-1.5 mb-4 text-sm font-light leading-relaxed text-white/75 antialiased max-w-lg">
                    {item.description}
                  </p>
                  <Button
                    variant="tertiary"
                    size="sm"
                    onClick={() => href && onNavigate(href)}
                    className="w-full justify-center"
                  >
                    {buttonLabel}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};