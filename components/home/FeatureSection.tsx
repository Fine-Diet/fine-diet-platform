import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';

import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination, Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';

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

export const FeatureSection = () => {
  const router = useRouter();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const content = trackSection;
  const backgroundImage = isMobile ? content.images.mobile : content.images.desktop;
  const slides =
    content.slides && content.slides.length > 0
      ? content.slides
      : [
          {
            title: content.title,
            description: content.description,
            buttons: content.buttons,
          },
        ];

  const handleNavigate = (href: string) => {
    router.push(href);
  };

  return (
    <section className="relative isolate overflow-hidden rounded-2xl sm:px-10 sm:py-16 lg:pb-10">
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

      <div className="relative mx-auto flex aspect-[5/6] sm:aspect-auto sm:h-[210px] max-w-[1200px] flex-col items-start justify-end p-8 text-left sm:p-0">
        <Swiper
          modules={[Autoplay, Pagination, Navigation]}
          autoplay={{ delay: 6000, disableOnInteraction: false }}
          loop={slides.length > 1}
          navigation={
            slides.length > 1
              ? { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' }
              : false
          }
          pagination={{
            el: '.custom-pagination',
            clickable: true,
            bulletClass:
              'w-3 h-3 border border-white rounded-full opacity-70 transition-all duration-200',
            bulletActiveClass: 'bg-white opacity-100 border-transparent',
            renderBullet: (index, className) => `<span class='${className}'></span>`,
          }}
          className="relative w-full"
        >
          {slides.map((slide, index) => (
            <SwiperSlide key={slide.id ?? slide.title ?? index}>
              <div className="max-w-1xl text-white">
                <h2 className="text-3xl font-sans font-semibold leading-tight lg:leading-tight">
                  {slide.title ?? content.title}
                </h2>
                <p className="mt-3 text-base font-sans leading-normal text-white">
                  {slide.description ?? content.description}
                </p>
                <div className="mt-4 w-full max-w-1xl flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                  {(slide.buttons ?? content.buttons ?? []).map((button: CTAButton, buttonIndex: number) => (
                    <Button
                      key={`${button.label}-${buttonIndex}`}
                      variant={button.variant}
                      size="md"
                      onClick={() => handleNavigate(button.href)}
                      className="w-full sm:w-auto"
                    >
                      {button.label}
                    </Button>
                  ))}
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>

        {slides.length > 1 && (
          <>
            <div className="custom-pagination absolute bottom-6 left-0 right-0 flex justify-center gap-3 z-20" />
            <div className="swiper-button-prev absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-black/30 hover:bg-black/50 text-white cursor-pointer transition-all duration-200">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </div>
            <div className="swiper-button-next absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-black/30 hover:bg-black/50 text-white cursor-pointer transition-all duration-200">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </>
        )}
      </div>
    </section>
  );
};
