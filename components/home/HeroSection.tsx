import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { Button } from '@/components/ui/Button';
import { ArrowUpRightIcon } from '@heroicons/react/24/outline';
import { HomeContent } from '@/lib/contentTypes';

interface HeroSectionProps {
  homeContent: HomeContent;
}



type HeroButton = {
  label: string;
  variant: 'primary' | 'secondary' | 'tertiary';
  href: string;
};

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

export const HeroSection = ({ homeContent }: HeroSectionProps) => {
  const router = useRouter();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const { hero } = homeContent;
  const backgroundImage = isMobile ? hero.images.mobile : hero.images.desktop;

  const handleNavigate = (href: string) => {
    router.push(href);
  };

  return (
    <section className="relative isolate overflow-hidden rounded-b-[2.5rem]">
      <div className="absolute inset-0">
        <Image
          src={backgroundImage}
          alt="Fine Diet hero backdrop"
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-black/30" />
      </div>

      <div className="relative mx-auto flex h-screen max-w-[1200px] flex-col items-center justify-center gap-2 px-6 py-0 text-center sm:px-10 lg:py-0">
        <div className="max-w-2xl text-white">
          <h1 className="antialiased whitespace-pre-line text-hero-mobile font-sans font-semibold leading-none sm:text-6xl lg:text-6xl lg:leading-none">
            {hero.title}
          </h1>
          <p className="antialiased mt-2 text-base font-light leading-5 text-white font-light">
            {hero.description}
          </p>
        </div>

        <div className=" flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          {hero.buttons.map((button: HeroButton) => {
            const normalizedLabel = button.label.toLowerCase();
            const showArrow = button.href === '/journal' || normalizedLabel.includes('start your free journal');
            const labelText = button.label.replace(/\s*↗$/, '');
            return (
            <Button
              key={button.label}
              variant={button.variant}
              size="lg"
              onClick={() => handleNavigate(button.href)}
              className="gap-2"
            >
              <span>{labelText}</span>
              {showArrow && <ArrowUpRightIcon className="h-3 w-3 -translate-y-[2px]" strokeWidth={3.5} />}
            </Button>
          );
          })}
        </div>
      </div>
    </section>
  );
};
