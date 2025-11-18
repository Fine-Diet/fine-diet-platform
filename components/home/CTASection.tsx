import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';

import { Button } from '@/components/ui/Button';
import { ArrowUpRightIcon } from '@heroicons/react/24/outline';

interface CTASectionProps {
  content: {
    title: string;
    description: string;
    button: {
      label: string;
      variant: string;
      href: string;
    };
    images?: {
      desktop: string;
      mobile: string;
    };
    background?: string;
  };
}

// Simple media query hook to support responsive background selection.
const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const updateMatch = () => setMatches(mediaQuery.matches);

    if (mediaQuery.matches !== matches) {
      setMatches(mediaQuery.matches);
    }

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', updateMatch);
    } else {
      mediaQuery.addListener(updateMatch);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', updateMatch);
      } else {
        mediaQuery.removeListener(updateMatch);
      }
    };
  }, [matches, query]);

  return matches;
};

export const CTASection = ({ content }: CTASectionProps) => {
  const router = useRouter();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const backgroundImage = content.images ? (isMobile ? content.images.mobile : content.images.desktop) : null;

  const handleNavigate = (href: string) => {
    router.push(href);
  };

  const normalizedLabel = content.button.label.toLowerCase();
  const showArrow =
    content.button.href === '/journal' ||
    normalizedLabel.includes('start your free journal') ||
    normalizedLabel.includes('start tracking');
  const labelText = content.button.label.replace(/\s*↗$/, '');

  return (
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-0">
        {backgroundImage ? (
          <>
            <Image
              src={backgroundImage}
              alt="CTA section background"
              fill
              priority
              className="object-cover"
              sizes="100vw"
            />
            <div className="absolute inset-0 backdrop-blur-lg bg-black/50" />
          </>
        ) : (
          <div className="absolute inset-0 bg-neutral-700" />
        )}
      </div>

      <div className="relative mx-auto flex h-[320px] sm:h-[300px] max-w-[1200px] flex-col items-center justify-center text-center px-6 py-16 sm:px-10 lg:py-20">
        <div className="max-w-2xl">
          <h2 className="antialiased text-3xl font-sans font-semibold leading-none sm:text-4xl text-white">
            {content.title}
          </h2>
          <p className="antialiased mt-2 text-base font-light leading-5 text-white font-light">
            {content.description}
          </p>
        </div>

        <div className="mt-3 flex flex-col items-stretch gap-3 sm:items-center">
          <Button
            variant={content.button.variant as any}
            size="lg"
            onClick={() => handleNavigate(content.button.href)}
            className="gap-2"
          >
            <span>{labelText}</span>
            {showArrow && <ArrowUpRightIcon className="h-3 w-3 -translate-y-[2px]" strokeWidth={3.5} />}
          </Button>
        </div>
      </div>
    </section>
  );
};
