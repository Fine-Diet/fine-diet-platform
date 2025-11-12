import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';

import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination, Navigation } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
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
  const prevRef = useRef<HTMLButtonElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const swiperRef = useRef<SwiperType | null>(null);
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
  useEffect(() => {
    const swiperInstance = swiperRef.current;
    const prevEl = prevRef.current;
    const nextEl = nextRef.current;

    if (!swiperInstance || !prevEl || !nextEl || slides.length <= 1) {
      return;
    }

    swiperInstance.params.navigation = {
      ...(swiperInstance.params.navigation as any),
      prevEl,
      nextEl,
    };

    if (swiperInstance.navigation.destroy) {
      swiperInstance.navigation.destroy();
    }
    swiperInstance.navigation.init();
    swiperInstance.navigation.update();
  }, [slides.length]);
  const currentSlide = slides[activeIndex] ?? slides[0];
  const currentImages = currentSlide?.images ?? content.images;
  const backgroundImage = isMobile
    ? currentImages?.mobile ?? content.images.mobile
    : currentImages?.desktop ?? content.images.desktop;

  const handleNavigate = (href: string) => {
    router.push(href);
  };

  return (
    <section className="feature-swiper relative isolate overflow-hidden rounded-2xl px-6 pt-8 pb-3 sm:px-10 sm:pt-8 m:pb-5 sm:pb-8 lg:pb-6">
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

      <div className="relative mx-auto flex aspect-[5/6] sm:aspect-auto sm:h-[325px] max-w-[1200px] flex-col items-start justify-end pb-2 p-0 text-left">
        <Swiper
          modules={[Autoplay, Pagination, Navigation]}
          autoplay={{ delay: 6000, disableOnInteraction: false }}
          loop={slides.length > 1}
          onSwiper={(swiper) => {
            swiperRef.current = swiper;
            setActiveIndex(swiper.realIndex ?? swiper.activeIndex ?? 0);
          }}
          onSlideChange={(swiper) => setActiveIndex(swiper.realIndex ?? swiper.activeIndex ?? 0)}
          navigation={false}
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
              <div className="max-w-1xl text-white pb-3 sm:pb-4 md:pb-6 lg:pb-8">
                <h2 className="text-3xl font-sans font-semibold leading-tight lg:leading-tight">
                  {slide.title ?? content.title}
                </h2>
                <p className="mt-0 text-base font-sans leading-snug text-white font-light">
                  {slide.description ?? content.description}
                </p>
                <div className="w-full max-w-1xl flex flex-col items-stretch gap-3 mb-4 mt-2 sm:flex-row sm:items-center">
                  {(slide.buttons ?? content.buttons ?? []).map((button: CTAButton, buttonIndex: number) => (
                    <Button
                      key={`${button.label}-${buttonIndex}`}
                      variant={button.variant}
                      size="sm"
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
          <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between lg:px-0 ">
            <button
              ref={prevRef}
              type="button"
              aria-label="Previous slide"
              className="feature-nav flex h-6 w-6 items-center justify-center text-white text-lg leading-none transition-opacity duration-200 hover:opacity-80"
              onClick={() => swiperRef.current?.slidePrev()}
            >
              <span aria-hidden="true">❮</span>
            </button>
            <div className="custom-pagination flex items-center justify-center gap-2" />
            <button
              ref={nextRef}
              type="button"
              aria-label="Next slide"
              className="feature-nav flex h-6 w-6 items-center justify-center text-white text-lg leading-none transition-opacity duration-200 hover:opacity-80"
              onClick={() => swiperRef.current?.slideNext()}
            >
              <span aria-hidden="true">❯</span>
            </button>
          </div>
        )}
      </div>
      <style jsx global>{`
        .feature-swiper .feature-nav {
          color: #fff;
        }
      `}</style>
    </section>
  );
};
