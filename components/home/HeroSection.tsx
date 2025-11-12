import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';
import homeContent from '@/data/homeContent.json';
import { Button } from '@/components/ui/Button';
import { ArrowUpRightIcon } from '@heroicons/react/24/outline';

const { hero } = homeContent;



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

export const HeroSection = () => {
  const router = useRouter();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const backgroundImage = isMobile ? hero.images.mobile : hero.images.desktop;

  const handleNavigate = (href: string) => {
    router.push(href);
  };

  return (
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-0">
        <Image
          src={backgroundImage}
          alt="Fine Diet hero backdrop"
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-black/0" />
      </div>

      <div className="relative mx-auto flex aspect-[5/6] sm:aspect-auto sm:h-[560px] max-w-[1200px] flex-col items-center justify-end gap-2 px-6 py-24 text-center sm:px-10 lg:py-20">
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
