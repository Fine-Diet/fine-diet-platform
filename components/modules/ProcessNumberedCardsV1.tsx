import { cn } from '@/lib/utils';

export interface ProcessNumberedCardsV1Content {
  eyebrow?: string;
  heading: string;
  intro?: string;
  steps: Array<{
    number: string;
    title: string;
    body: string;
  }>;
  surface?: 'dark' | 'light';
}

interface Props {
  content: ProcessNumberedCardsV1Content;
}

export function ProcessNumberedCardsV1({ content }: Props) {
  if (!content.steps || content.steps.length === 0) return null;
  const isDark = (content.surface ?? 'dark') === 'dark';

  return (
    <section
      className={cn(
        'px-6 py-16 sm:px-10 lg:py-20',
        isDark ? 'bg-neutral-950 text-white' : 'bg-brand-50 text-brand-900',
      )}
    >
      <div className="mx-auto max-w-3xl">
        <div>
          {content.eyebrow && (
            <p
              className={cn(
                'text-sm font-semibold antialiased',
                isDark ? 'text-white/60' : 'text-brand-900/46',
              )}
            >
              {content.eyebrow}
            </p>
          )}
          <h2
            className={cn(
              'mt-3 text-3xl font-semibold leading-tight antialiased sm:text-4xl',
              isDark ? 'text-white' : 'text-brand-900',
            )}
          >
            {content.heading}
          </h2>
          {content.intro && (
            <p
              className={cn(
                'mt-4 text-sm leading-5 antialiased sm:text-base',
                isDark ? 'text-white/60' : 'text-brand-900/66',
              )}
            >
              {content.intro}
            </p>
          )}
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {content.steps.map((step) => (
            <article
              key={step.number}
              className={cn(
                'rounded-2xl border bg-transparent p-5 sm:p-6',
                isDark ? 'border-white/20' : 'border-brand-900/15 bg-white/70',
              )}
            >
              <div className="flex gap-4">
                <span
                  className={cn(
                    'text-sm font-semibold antialiased',
                    isDark ? 'text-white' : 'text-brand-900',
                  )}
                >
                  {step.number}
                </span>
                <div>
                  <h3
                    className={cn(
                      'text-sm font-semibold antialiased',
                      isDark ? 'text-white' : 'text-brand-900',
                    )}
                  >
                    {step.title}
                  </h3>
                  <p
                    className={cn(
                      'mt-1 text-sm font-light leading-5 antialiased',
                      isDark ? 'text-white/60' : 'text-brand-900/62',
                    )}
                  >
                    {step.body}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
