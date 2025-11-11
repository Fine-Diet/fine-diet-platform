import { useEffect, useState } from 'react';

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
  const isMobile = useMediaQuery('(max-width: 640px)');
  const content = trackSection;

  if (!content?.slides || content.slides.length === 0) return null;

  const handleNavigate = (href: string) => {
    router.push(href);
  };

  return (
    <section className="relative isolate overflow-hidden rounded-2xl sm:px-10 sm:py-16 lg:pb-10">
      <div className="relative mx-auto flex aspect-[5/6] sm:aspect-auto sm:h-[420px] max-w-[1200px] flex-col items-center justify-center text-white">
        <Swiper
          modules={[Autoplay, Pagination, Navigation]}
          autoplay={{ delay: 6000, disableOnInteraction: false }}
          loop={content.slides.length > 1}
          initialSlide={0}
          onSwiper={(swiper) => swiper.update()}
          navigation={
            content.slides.length > 1
              ? { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' }
              : false
          }
          pagination={{
            el: '.custom-pagination',
            clickable: true,
            bulletClass:
              'w-3 h-3 border border-white rounded-full opacity-70 transition-all duration-200',
            bulletActiveClass: 'bg-white opacity-100 border-transparent',
          }}
          className="relative w-full"
        >
          {content.slides.map((slide, index) => (
            <SwiperSlide key={slide.id ?? index}>
              <div className="relative w-full min-h-[75vh] flex flex-col justify-end items-center text-center overflow-hidden rounded-[1.5rem]">
                <img
                  src={isMobile ? slide.images.mobile : slide.images.desktop}
                  alt={slide.title}
                  className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out"
                  loading={index === 0 ? 'eager' : 'lazy'}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent" />
                <div className="relative z-10 max-w-[1200px] px-6 pb-12 text-white">
                  <h2 className="text-3xl md:text-4xl font-semibold mb-4">{slide.title}</h2>
                  <p className="text-base md:text-lg mb-6">{slide.description}</p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    {slide.buttons?.map((button, i) => (
                      <Button
                        key={i}
                        variant={button.variant}
                        onClick={() => window.location.assign(button.href)}
                        className="w-full sm:w-auto px-6"
                      >
                        {button.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>

        {content.slides.length > 1 && (
          <>
            <div className="custom-pagination absolute bottom-6 left-0 right-0 flex justify-center gap-3 z-20" />
            <div className="swiper-button-prev absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-black/30 hover:bg-black/50 text-white cursor-pointer transition-all duration-200">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </div>
            <div className="swiper-button-next absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-black/30 hover:bg-black/50 text-white cursor-pointer transition-all duration-200">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </>
        )}
      </div>
    </section>
  );
};
