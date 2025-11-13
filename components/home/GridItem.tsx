import Image from 'next/image';
import { useRouter } from 'next/router';
import { Button } from '@/components/ui/Button';

interface GridItemButton {
  label: string;
  variant: 'primary' | 'secondary' | 'tertiary' | string;
  href: string;
}

export interface GridItemProps {
  title: string;
  description: string;
  image?: string;
  button: GridItemButton;
  aspect?: 'form-4-3' | string;
  ctaType?: 'button-only' | string;
}

export const GridItem = ({
  title,
  description,
  image,
  button,
  aspect,
  ctaType,
}: GridItemProps) => {
  const router = useRouter();

  const handleClick = () => {
    if (button?.href) {
      router.push(button.href);
    }
  };

  // Determine height classes based on aspect ratio
  const heightClasses = aspect === 'form-4-3' 
    ? 'aspect-[4/3] md:aspect-auto md:h-[325px]'
    : 'h-[325px]';

  return (
    <div className={`relative isolate overflow-hidden rounded-[2.5rem] ${heightClasses}`}>
      {/* Background Image */}
      {image ? (
        <div className="absolute inset-0">
          <Image
            src={image}
            alt={title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-neutral-700" />
      )}

      {/* Content */}
      <div className="relative h-full flex flex-col justify-end p-6 md:p-8">
        <div className="space-y-3">
          <h3 className="text-xl md:text-2xl font-semibold text-white">
            {title}
          </h3>
          <p className="text-base md:text-lg font-light text-white">
            {description}
          </p>
          
          {/* Button */}
          {button && (
            <div className="pt-2">
              <Button
                variant={button.variant as 'primary' | 'secondary' | 'tertiary'}
                size="md"
                onClick={handleClick}
                className="w-full md:w-auto"
              >
                {button.label}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

