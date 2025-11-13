import { useRouter } from 'next/router';

import { Button } from '@/components/ui/Button';

interface CTASectionProps {
  content: {
    title: string;
    description: string;
    button: {
      label: string;
      variant: string;
      href: string;
    };
    background?: string;
  };
}

export const CTASection = ({ content }: CTASectionProps) => {
  const router = useRouter();

  const handleNavigate = (href: string) => {
    router.push(href);
  };

  return (
    <section className="relative isolate overflow-hidden rounded-[2.5rem]">
      <div className="absolute inset-0 bg-neutral-0" />

      <div className="relative mx-auto flex h-[320px] sm:h-[300px] max-w-[1200px] flex-col items-center justify-center text-center px-6 py-16 sm:px-10 lg:py-20">
        <div className="max-w-2xl">
          <h2 className="antialiased text-3xl font-sans font-semibold leading-none sm:text-4xl">
            {content.title}
          </h2>
          <p className="antialiased mt-2 text-base font-light leading-5 text-neutral-700">
            {content.description}
          </p>
        </div>

        <div className="mt-6 flex flex-col items-stretch gap-3 sm:items-center">
          <Button
            variant={content.button.variant as any}
            size="lg"
            onClick={() => handleNavigate(content.button.href)}
            className="gap-2"
          >
            <span>{content.button.label}</span>
          </Button>
        </div>
      </div>
    </section>
  );
};
