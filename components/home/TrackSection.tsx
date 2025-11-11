import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';

import homeContent from '@/data/homeContent.json';
import { Button } from '@/components/ui/Button';

const { trackSection } = homeContent;

type CTAButton = {
  label: string;
  variant: 'primary' | 'secondary' | 'tertiary';
  href: string;
};

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

export const TrackSection = () => {
  const router = useRouter();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const backgroundImage = isMobile ? trackSection.images.mobile : trackSection.images.desktop;

  const handleNavigate = (href: string) => {
    router.push(href);
  };

  return (
    <section className="relative isolate overflow-hidden rounded-2xl m-3 sm:px-10 sm:py-16 lg:py-20">
      <div className="absolute inset-0">
        <Image
          src={backgroundImage}
          alt="Track meals, moods, and habits"
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/65 to-black/0" />
      </div>

      <div className="relative mx-auto flex min-h-[60vh] max-w-[1200px] flex-col items-start justify-center gap-6 text-left">
        <div className="max-w-3xl text-white">
          <h2 className="text-3xl font-sans font-semibold leading-tight sm:text-5xl lg:text-6xl lg:leading-tight">
            {trackSection.title}
          </h2>
          <p className="mt-3 text-lg font-sans leading-normal text-white sm:text-xl">
            {trackSection.description}
          </p>
        </div>

        <div className="mt-2 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          {trackSection.buttons.map((button: CTAButton) => (
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
