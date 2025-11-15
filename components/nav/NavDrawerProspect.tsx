import Image from 'next/image';
import { Button } from '@/components/ui/Button';

interface ProspectProduct {
  subcategoryLabel: string;
  id: string;
  title: string;
  description: string;
  badge?: string;
  image: string;
  href: string;
  buttons: Array<{
    label: string;
    variant: string;
    href: string;
  }>;
}

interface NavDrawerProspectProps {
  prospectProduct: ProspectProduct;
  onNavigate: (href: string) => void;
}

export const NavDrawerProspect = ({
  prospectProduct,
  onNavigate,
}: NavDrawerProspectProps) => {
  const buttons = prospectProduct.buttons ?? [];

  return (
    <div className="border-t border-white/40 flex flex-col">
      {/* Top Row - Subcategory Label */}
      <div className="w-full pl-10 pt-10 pb-4">
        <div className="text-left text-base font-semibold pl-3 text-white/100 antialiased">
          {prospectProduct.subcategoryLabel}
        </div>
      </div>

      {/* Bottom Row - Product Content (Full Width) */}
      <div className="w-full pl-8 pt-0 space-y-4">
        <div className="flex flex-col gap-6 items-start px-5 pb-8 md:flex-row">
          <div className="relative overflow-hidden rounded-[2.5rem] w-full md:w-[300px] flex-shrink-0">
            <div className="relative aspect-square md:h-[300px]">
              <Image 
                src={prospectProduct.image} 
                alt={prospectProduct.title} 
                fill 
                className="object-cover" 
              />
            </div>
          </div>
          <div className="flex-1 text-white">
            <h3 className="text-3xl font-semibold antialiased">{prospectProduct.title}</h3>
            <p className="antialiased text-base font-light mt-1 mr-5 mb-2 leading-5 text-white font-light">
              {prospectProduct.description}
            </p>
            {prospectProduct.badge && (
              <p className="text-sm mb-1 mt-1font-semibold text-white antialiased">
                {prospectProduct.badge}
              </p>
            )}
            {buttons.length > 0 && (
              <div className="flex gap-3">
                {buttons.map((button, index) => {
                  const targetHref = button.href ?? prospectProduct.href;
                  return (
                    <Button
                      key={button.label}
                      variant={button.variant as any}
                      size="sm"
                      onClick={() => {
                        if (targetHref) {
                          onNavigate(targetHref);
                        }
                      }}
                      className="min-w-[140px] gap-2"
                    >
                      <span>{button.label}</span>
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

