'use client';

import { useState } from 'react';
import { AuroraBackground } from '@/components/ui/aurora-background';
import { theme } from '@/styles/theme';

/**
 * Backgrounds Lab - Visual Reference Playground
 * 
 * This page showcases background components for reuse across the Fine Diet app.
 * Use this page to preview and select backgrounds for different sections.
 */
export default function BackgroundsLab() {
  const [selectedVariant, setSelectedVariant] = useState<'light' | 'dark'>('dark');

  return (
    <div className="min-h-screen">
      {/* Control Panel */}
      <div
        className="sticky top-0 z-20 border-b backdrop-blur-sm"
        style={{
          backgroundColor: selectedVariant === 'dark' 
            ? theme.colors.neutral[800] 
            : theme.colors.neutral[50],
          borderColor: selectedVariant === 'dark' 
            ? theme.colors.neutral[700] 
            : theme.colors.neutral[200],
        }}
      >
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex flex-wrap items-center gap-6">
            <h1 
              className="text-2xl font-semibold"
              style={{ 
                fontFamily: theme.typography.fonts.sans.join(', '),
                color: selectedVariant === 'dark' 
                  ? theme.colors.neutral[0] 
                  : theme.colors.neutral[900],
              }}
            >
              Backgrounds Lab
            </h1>

            <div className="flex flex-wrap items-center gap-4 ml-auto">
              {/* Variant Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <span 
                  className="text-sm"
                  style={{ 
                    fontFamily: theme.typography.fonts.sans.join(', '),
                    color: selectedVariant === 'dark' 
                      ? theme.colors.neutral[0] 
                      : theme.colors.neutral[900],
                  }}
                >
                  Light
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={selectedVariant === 'dark'}
                  onClick={() => setSelectedVariant(selectedVariant === 'dark' ? 'light' : 'dark')}
                  className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent"
                  style={{
                    backgroundColor: selectedVariant === 'dark' 
                      ? theme.colors.denim[500] 
                      : theme.colors.neutral[300],
                  }}
                >
                  <span
                    className="inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-300 ease-in-out shadow-sm"
                    style={{
                      transform: selectedVariant === 'dark' ? 'translateX(1.25rem)' : 'translateX(0.125rem)',
                    }}
                  />
                </button>
                <span 
                  className="text-sm"
                  style={{ 
                    fontFamily: theme.typography.fonts.sans.join(', '),
                    color: selectedVariant === 'dark' 
                      ? theme.colors.neutral[0] 
                      : theme.colors.neutral[900],
                  }}
                >
                  Dark
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Background Showcase */}
      <div className="space-y-8 pb-12">
        {/* Aurora Background */}
        <section>
          <div className="max-w-7xl mx-auto px-6 pt-8">
            <div className="mb-4">
              <h2 
                className="text-xl font-semibold mb-2"
                style={{ fontFamily: theme.typography.fonts.sans.join(', ') }}
              >
                Aurora Background
              </h2>
              <p 
                className="text-sm opacity-70"
                style={{ fontFamily: theme.typography.fonts.sans.join(', ') }}
              >
                Animated aurora effect using Fine Diet brand colors (denim palette). 
                Features smooth gradient animations and radial masking.
              </p>
            </div>
          </div>

          <AuroraBackground variant={selectedVariant} className="min-h-[600px]">
            <div className="relative z-10 flex flex-col gap-6 items-center justify-center px-4 text-center">
              <h3 
                className="text-3xl md:text-5xl font-bold"
                style={{ 
                  fontFamily: theme.typography.fonts.sans.join(', '),
                  color: selectedVariant === 'dark' 
                    ? theme.colors.neutral[0] 
                    : theme.colors.neutral[900],
                }}
              >
                Aurora Background
              </h3>
              <p 
                className="text-base md:text-xl font-light max-w-2xl"
                style={{ 
                  fontFamily: theme.typography.fonts.sans.join(', '),
                  color: selectedVariant === 'dark' 
                    ? theme.colors.neutral[100] 
                    : theme.colors.neutral[700],
                }}
              >
                This background uses Fine Diet's denim color palette to create a 
                flowing aurora effect. Perfect for hero sections and landing pages.
              </p>
              <div className="mt-4">
                <code 
                  className="px-4 py-2 rounded-lg text-sm"
                  style={{
                    backgroundColor: selectedVariant === 'dark' 
                      ? 'rgba(0, 0, 0, 0.3)' 
                      : 'rgba(255, 255, 255, 0.5)',
                    color: selectedVariant === 'dark' 
                      ? theme.colors.neutral[0] 
                      : theme.colors.neutral[900],
                    fontFamily: theme.typography.fonts.mono.join(', '),
                  }}
                >
                  {'<AuroraBackground variant="' + selectedVariant + '">'}
                </code>
              </div>
            </div>
          </AuroraBackground>
        </section>

        {/* Usage Examples */}
        <section className="max-w-7xl mx-auto px-6">
          <div className="mb-6">
            <h2 
              className="text-xl font-semibold mb-2"
              style={{ fontFamily: theme.typography.fonts.sans.join(', ') }}
            >
              Usage Examples
            </h2>
            <p 
              className="text-sm opacity-70 mb-4"
              style={{ fontFamily: theme.typography.fonts.sans.join(', ') }}
            >
              Copy these examples to use the Aurora Background in your components.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Usage */}
            <div
              className="rounded-[2.5rem] p-6 shadow-soft"
              style={{
                backgroundColor: selectedVariant === 'dark' 
                  ? theme.colors.neutral[800] 
                  : theme.colors.neutral[0],
                border: `1px solid ${selectedVariant === 'dark' 
                  ? theme.colors.neutral[700] 
                  : theme.colors.neutral[200]}`,
              }}
            >
              <h3 
                className="text-lg font-semibold mb-3"
                style={{ 
                  fontFamily: theme.typography.fonts.sans.join(', '),
                  color: selectedVariant === 'dark' 
                    ? theme.colors.neutral[0] 
                    : theme.colors.neutral[900],
                }}
              >
                Basic Usage
              </h3>
              <pre
                className="text-xs overflow-x-auto p-4 rounded-lg"
                style={{
                  backgroundColor: selectedVariant === 'dark' 
                    ? theme.colors.brand[900] 
                    : theme.colors.neutral[100],
                  color: selectedVariant === 'dark' 
                    ? theme.colors.neutral[0] 
                    : theme.colors.neutral[900],
                  fontFamily: theme.typography.fonts.mono.join(', '),
                }}
              >
{`import { AuroraBackground } from 
  '@/components/ui/aurora-background';

<AuroraBackground variant="dark">
  <div className="relative z-10">
    Your content here
  </div>
</AuroraBackground>`}
              </pre>
            </div>

            {/* With Custom Styling */}
            <div
              className="rounded-[2.5rem] p-6 shadow-soft"
              style={{
                backgroundColor: selectedVariant === 'dark' 
                  ? theme.colors.neutral[800] 
                  : theme.colors.neutral[0],
                border: `1px solid ${selectedVariant === 'dark' 
                  ? theme.colors.neutral[700] 
                  : theme.colors.neutral[200]}`,
              }}
            >
              <h3 
                className="text-lg font-semibold mb-3"
                style={{ 
                  fontFamily: theme.typography.fonts.sans.join(', '),
                  color: selectedVariant === 'dark' 
                    ? theme.colors.neutral[0] 
                    : theme.colors.neutral[900],
                }}
              >
                With Custom Styling
              </h3>
              <pre
                className="text-xs overflow-x-auto p-4 rounded-lg"
                style={{
                  backgroundColor: selectedVariant === 'dark' 
                    ? theme.colors.brand[900] 
                    : theme.colors.neutral[100],
                  color: selectedVariant === 'dark' 
                    ? theme.colors.neutral[0] 
                    : theme.colors.neutral[900],
                  fontFamily: theme.typography.fonts.mono.join(', '),
                }}
              >
{`<AuroraBackground 
  variant="light"
  className="min-h-screen"
  showRadialGradient={true}
>
  <div className="relative z-10">
    Your content here
  </div>
</AuroraBackground>`}
              </pre>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
