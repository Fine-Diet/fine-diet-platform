import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';

import homeContent from '@/data/homeContent.json';
import { Button } from '@/components/ui/Button';

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

export const Hero = () => {
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

      <div className="relative mx-auto flex min-h-[75vh] max-w-[1200px] flex-col items-center justify-end gap-4 px-6 py-24 text-center sm:px-10 lg:py-20">
        <div className="max-w-2xl text-white">
          <h1 className="whitespace-pre-line text-hero-mobile font-sans font-semibold leading-none sm:text-6xl lg:text-6xl lg:leading-none">
            {hero.title}
          </h1>
          <p className="mt-2 text-lg font-sans leading-normal text-white sm:text-xl">
            {hero.description}
          </p>
        </div>

        <div className=" flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          {hero.buttons.map((button: HeroButton) => (
            <Button
              key={button.label}
              variant={button.variant}
              size="lg"
              onClick={() => handleNavigate(button.href)}
            >
              {button.label}
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
};
