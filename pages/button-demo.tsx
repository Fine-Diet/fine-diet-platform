'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

// Multiple Choice Option Button Component
interface MultipleChoiceOptionProps {
  label: string;
  selected: boolean;
  onClick: () => void;
}

function MultipleChoiceOption({ label, selected, onClick }: MultipleChoiceOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full rounded-full px-5 pt-4 pb-4 text-base
        flex items-center justify-between gap-4
        transition-colors duration-200
        ${
          selected
            ? 'bg-[#6AB1AE] text-white font-semibold'
            : 'bg-[#fffff6] text-[#4F4234] hover:bg-white font-normal'
        }
      `}
    >
      <span className="flex-1 text-left">{label}</span>
      <div
        className={`
          w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
          ${
            selected
              ? 'bg-white border-white'
              : 'bg-transparent border-[#4F4234]'
          }
        `}
      >
        {selected && (
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="#4F4234"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </div>
    </button>
  );
}

// Continue/Next Button Component
interface ContinueButtonProps {
  enabled: boolean;
  onClick: () => void;
  label?: string;
}

function ContinueButton({ enabled, onClick, label = 'Next' }: ContinueButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      className={`
        w-full px-6 py-5 text-base font-bold text-center rounded-lg
        transition-colors duration-200
        ${
          enabled
            ? 'bg-[#001010] text-white hover:bg-[#2E2E2E]'
            : 'bg-transparent text-[#BAB7A7] border-[2px] border-[#BAB7A7] cursor-not-allowed'
        }
      `}
    >
      {label}
    </button>
  );
}

export default function ButtonDemo() {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  return (
    <div className="min-h-screen bg-neutral-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-brand-700 mb-8">
          Fine Diet Button Component Demo
        </h1>

        {/* Variants Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-neutral-800 mb-4">
            Variants
          </h2>
          <div className="flex gap-4 flex-wrap">
            <Button variant="primary">Primary Button</Button>
            <Button variant="secondary">Secondary Button</Button>
            <Button variant="tertiary">Tertiary Button</Button>
            <Button variant="quaternary">Quaternary Button</Button>
          </div>
        </section>

        {/* Sizes Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-neutral-800 mb-4">
            Sizes
          </h2>
          <div className="flex gap-4 items-center flex-wrap">
            <Button size="sm">Small Button</Button>
            <Button size="md">Medium Button</Button>
            <Button size="lg">Large Button</Button>
          </div>
        </section>

        {/* Disabled State Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-neutral-800 mb-4">
            Disabled State
          </h2>
          <div className="flex gap-4 flex-wrap">
            <Button variant="primary" disabled>
              Disabled Primary
            </Button>
            <Button variant="secondary" disabled>
              Disabled Secondary
            </Button>
            <Button variant="tertiary" disabled>
              Disabled Tertiary
            </Button>
            <Button variant="quaternary" disabled>
              Disabled Quaternary
            </Button>
          </div>
        </section>

        {/* Interactive Example */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-neutral-800 mb-4">
            Interactive Example
          </h2>
          <Button
            variant="primary"
            size="lg"
            onClick={() => alert('Button clicked!')}
          >
            Click Me!
          </Button>
        </section>

        {/* Combinations */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-neutral-800 mb-4">
            All Combinations
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-neutral-700 mb-2">
                Primary
              </h3>
              <div className="flex gap-4 items-center flex-wrap">
                <Button variant="primary" size="sm">
                  Small
                </Button>
                <Button variant="primary" size="md">
                  Medium
                </Button>
                <Button variant="primary" size="lg">
                  Large
                </Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-neutral-700 mb-2">
                Secondary
              </h3>
              <div className="flex gap-4 items-center flex-wrap">
                <Button variant="secondary" size="sm">
                  Small
                </Button>
                <Button variant="secondary" size="md">
                  Medium
                </Button>
                <Button variant="secondary" size="lg">
                  Large
                </Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-neutral-700 mb-2">
                Tertiary
              </h3>
              <div className="flex gap-4 items-center flex-wrap">
                <Button variant="tertiary" size="sm">
                  Small
                </Button>
                <Button variant="tertiary" size="md">
                  Medium
                </Button>
                <Button variant="tertiary" size="lg">
                  Large
                </Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-neutral-700 mb-2">
                Quaternary
              </h3>
              <div className="flex gap-4 items-center flex-wrap">
                <Button variant="quaternary" size="sm">
                  Small
                </Button>
                <Button variant="quaternary" size="md">
                  Medium
                </Button>
                <Button variant="quaternary" size="lg">
                  Large
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Multiple Choice Selection Buttons */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-neutral-800 mb-4">
            Multiple Choice Selection Buttons
          </h2>
          <div className="space-y-4 max-w-md">
            <h3 className="text-lg font-medium text-neutral-700 mb-2">
              Individual States
            </h3>
            <MultipleChoiceOption
              label="Normal State Option"
              selected={false}
              onClick={() => {}}
            />
            <MultipleChoiceOption
              label="Selected State Option"
              selected={true}
              onClick={() => {}}
            />
          </div>
        </section>

        {/* Continue/Next Button */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-neutral-800 mb-4">
            Continue / Next Button
          </h2>
          <div className="space-y-4 max-w-md">
            <h3 className="text-lg font-medium text-neutral-700 mb-2">
              Button States
            </h3>
            <ContinueButton enabled={false} onClick={() => {}} />
            <ContinueButton enabled={true} onClick={() => {}} />
          </div>
        </section>

        {/* Interactive Form Example */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-neutral-800 mb-4">
            Interactive Form Example
          </h2>
          <div className="max-w-md space-y-6">
            <div>
              <h3 className="text-lg font-medium text-neutral-700 mb-4">
                Select an option to enable the Next button:
              </h3>
              <div className="space-y-3">
                <MultipleChoiceOption
                  label="Option 1: This is a sample question option"
                  selected={selectedOption === 'option1'}
                  onClick={() => setSelectedOption('option1')}
                />
                <MultipleChoiceOption
                  label="Option 2: Another sample question option"
                  selected={selectedOption === 'option2'}
                  onClick={() => setSelectedOption('option2')}
                />
                <MultipleChoiceOption
                  label="Option 3: Yet another sample question option"
                  selected={selectedOption === 'option3'}
                  onClick={() => setSelectedOption('option3')}
                />
              </div>
            </div>
            <div>
              <ContinueButton
                enabled={selectedOption !== null}
                onClick={() => {
                  if (selectedOption) {
                    alert(`Selected: ${selectedOption}`);
                  }
                }}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

