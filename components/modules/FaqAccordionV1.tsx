/**
 * Module: faq.accordion.v1
 *
 * Expandable FAQ list. New component — no existing equivalent in the
 * codebase. Pure Tailwind + useState; no external accordion library.
 */

import { useState } from 'react';
import type { FaqAccordionV1Content } from '@/lib/modules/types';

interface Props {
  content: FaqAccordionV1Content;
}

export function FaqAccordionV1({ content }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const toggle = (id: string) => setOpenId((prev) => (prev === id ? null : id));

  return (
    <section className="px-6 sm:px-10 py-12 max-w-[800px] mx-auto">
      {content.title && (
        <h2 className="antialiased text-3xl sm:text-4xl font-semibold text-white text-center mb-8">
          {content.title}
        </h2>
      )}

      <div className="divide-y divide-white/10">
        {content.items.map((item, index) => {
          const id = item.id ?? String(index);
          const isOpen = openId === id;

          return (
            <div key={id}>
              <button
                type="button"
                onClick={() => toggle(id)}
                className="w-full flex items-center justify-between py-5 text-left gap-4 group"
                aria-expanded={isOpen}
              >
                <span className="antialiased text-base sm:text-lg font-semibold text-white group-hover:text-white/80 transition-colors">
                  {item.question}
                </span>
                <span
                  className={`flex-shrink-0 text-white/50 transition-transform duration-200 ${
                    isOpen ? 'rotate-45' : 'rotate-0'
                  }`}
                  aria-hidden="true"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </span>
              </button>

              {isOpen && (
                <div className="pb-5 pr-10">
                  <p className="antialiased text-base font-light leading-5 text-white/70">
                    {item.answer}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
