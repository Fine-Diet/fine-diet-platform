import { GetStaticProps } from 'next';
import { getSeoForRoute } from '@/lib/seo/getSeo';
import { SeoHead } from '@/components/seo/SeoHead';
import { FinePrintForm } from '@/components/newsletter/FinePrintForm';

interface TheFinePrintProps {
  seoResult: Awaited<ReturnType<typeof getSeoForRoute>>;
}

const PERKS = [
  {
    icon: '🧬',
    title: 'Nutrition insights',
    body: 'Evidence-based breakdowns of how food, hormones, and lifestyle connect — written for real life, not lab reports.',
  },
  {
    icon: '🌱',
    title: 'Nurture content',
    body: 'Practical tools, habit-stacks, and mindset shifts to keep momentum between programs.',
  },
  {
    icon: '⚡',
    title: 'Early access',
    body: 'First look at new programs, offers, and features before they open to the general public.',
  },
];

export default function TheFinePrint({ seoResult }: TheFinePrintProps) {
  return (
    <>
      <SeoHead seo={seoResult.seo} assets={seoResult.assets} />

      <main className="min-h-screen bg-brand-900">
        {/* Hero */}
        <section className="relative isolate overflow-hidden">
          {/* Subtle gradient backdrop */}
          <div
            className="absolute inset-0 -z-10"
            style={{
              background:
                'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(59,130,246,0.12) 0%, transparent 70%)',
            }}
          />

          <div className="max-w-[720px] mx-auto px-6 pt-20 pb-12 text-center">
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-denim-400 antialiased mb-4">
              The Fine Print
            </p>

            <h1 className="text-4xl sm:text-5xl font-semibold text-white leading-none antialiased mb-4">
              The inside track on eating well and feeling better.
            </h1>

            <p className="text-base sm:text-lg text-white/70 font-light antialiased leading-relaxed">
              No generic wellness tips. Just clear, science-backed nutrition insights,
              practical tools, and early access to what we&apos;re building — sent only when
              it&apos;s worth your attention.
            </p>
          </div>
        </section>

        {/* What you get */}
        <section className="max-w-[860px] mx-auto px-6 pb-14">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PERKS.map((perk) => (
              <div
                key={perk.title}
                className="bg-neutral-800/50 border border-neutral-700/40 rounded-2xl p-5"
              >
                <span className="text-2xl mb-3 block" role="img" aria-hidden="true">
                  {perk.icon}
                </span>
                <h3 className="text-base font-semibold text-white antialiased mb-1">
                  {perk.title}
                </h3>
                <p className="text-sm text-white/60 font-light antialiased leading-relaxed">
                  {perk.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Signup form */}
        <section className="max-w-[480px] mx-auto px-6 pb-24">
          <div className="bg-neutral-800/40 backdrop-blur border border-neutral-700/40 rounded-[2rem] p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-white antialiased mb-1">
              Join the list
            </h2>
            <p className="text-sm text-white/60 font-light antialiased mb-6">
              Choose what you want to hear about. Adjust or opt out any time.
            </p>

            <FinePrintForm source="landing_the_fine_print" submitLabel="Get The Fine Print" />
          </div>
        </section>
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<TheFinePrintProps> = async () => {
  const seoResult = await getSeoForRoute({
    routePath: '/the-fine-print',
    pageTitle: 'The Fine Print | Fine Diet',
    pageDescription:
      'Nutrition insights, nurture content, and early access to new Fine Diet programs — straight to your inbox.',
  });

  return {
    props: { seoResult },
    revalidate: 3600,
  };
};
