/**
 * Module: faq.accordion.v2
 *
 * Premium styled FAQ accordion with dark cap header and bordered rounded shell.
 * Single-open behavior. First item open by default.
 * Plus/minus icon. No auto-revert — open until another item is selected.
 *
 * Classification: new module — styled FAQ variant (distinct from faq.accordion.v1)
 * Visual identity: large rounded bordered container, dark header cap, light body,
 *   bold question text, premium editorial spacing.
 */

import { useState } from 'react';
import type { FaqAccordionV2Content } from '@/lib/modules/types';

interface Props {
  content: FaqAccordionV2Content;
}

export function FaqAccordionV2({ content }: Props) {
  const defaultId = content.items[content.defaultOpenIndex ?? 0]?.id
    ?? String(content.defaultOpenIndex ?? 0);
  const [openId, setOpenId] = useState<string>(defaultId);

  const toggle = (id: string) => setOpenId((prev) => (prev === id ? '' : id));

  return (
    <section className="px-6 py-12 sm:px-10 sm:py-16">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-brand-900/20">
        {/* Dark cap header */}
        <div className="bg-brand-900 px-8 py-6">
          <h2 className="antialiased font-sans text-2xl font-semibold text-white sm:text-3xl">
            {content.title}
          </h2>
        </div>

        {/* Accordion body */}
        <div className="bg-neutral-0 divide-y divide-brand-900/10">
          {content.items.map((item, index) => {
            const id = item.id ?? String(index);
            const isOpen = openId === id;

            return (
              <div key={id}>
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="flex w-full items-start justify-between gap-6 px-8 py-5 text-left"
                  aria-expanded={isOpen}
                >
                  <span className={`antialiased text-base font-semibold leading-snug transition-colors ${isOpen ? 'text-brand-900' : 'text-brand-900/70'}`}>
                    {item.question}
                  </span>
                  <span
                    className={`mt-0.5 flex-shrink-0 text-brand-900/40 transition-transform duration-200 ${isOpen ? 'rotate-45' : 'rotate-0'}`}
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
                  <div className="px-8 pb-5 pr-16 -mt-1">
                    <p className="antialiased text-base font-light leading-5 text-brand-900/70">
                      {item.answer}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
