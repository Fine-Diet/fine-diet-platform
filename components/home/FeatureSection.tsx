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
  const [activeIndex, setActiveIndex] = useState(0);
  const slides =
    content.slides && content.slides.length > 0
      ? content.slides
      : [
          {
            title: content.title,
            description: content.description,
            buttons: content.buttons,
            images: content.images,
          },
        ];
  useEffect(() => {
    if (activeIndex >= slides.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, slides.length]);
  const currentSlide = slides[activeIndex] ?? slides[0];
  const currentImages = currentSlide?.images ?? content.images;
  const backgroundImage = isMobile
    ? currentImages?.mobile ?? content.images.mobile
    : currentImages?.desktop ?? content.images.desktop;

  const handleNavigate = (href: string) => {
    router.push(href);
  };

  return (
    <section className="relative isolate overflow-hidden rounded-2xl px-6 pt-8 pb-3 sm:px-10 sm:pt-8 sm:pb-8 lg:pb-10">
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
          onSwiper={(swiper) => setActiveIndex(swiper.realIndex ?? swiper.activeIndex ?? 0)}
          onSlideChange={(swiper) => setActiveIndex(swiper.realIndex ?? swiper.activeIndex ?? 0)}
          navigation={
            slides.length > 1
              ? { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' }
              : false
          }
          pagination={{
            el: '.custom-pagination',
            clickable: true,
            bulletClass:
              'w-2 h-2 border border-white rounded-full opacity-70 transition-all duration-200',
            bulletActiveClass: 'bg-white opacity-100 border-transparent',
            renderBullet: (index, className) => `<span class='${className}'></span>`,
          }}
          className="relative w-full"
        >
          {slides.map((slide, index) => (
            <SwiperSlide key={slide.id ?? slide.title ?? index}>
              <div className="max-w-1xl text-white pb-10 sm:pb-6">
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
          <div className="absolute bottom-4 left-0 right-0 z-20 flex items-center justify-center gap-4">
            <div className="swiper-button-prev flex h-5 w-5 items-center justify-center rounded-full border border-white/80 text-white transition-all duration-200 hover:bg-white/20">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </div>
            <div className="custom-pagination flex items-center justify-center gap-3" />
            <div className="swiper-button-next flex h-5 w-5 items-center justify-center rounded-full border border-white/80 text-white transition-all duration-200 hover:bg-white/20">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
