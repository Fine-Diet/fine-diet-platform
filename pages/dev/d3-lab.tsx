'use client';

import { useState, useEffect, useMemo } from 'react';
import { ScoreGauge } from '@/components/d3/ScoreGauge';
import { ScoreGaugeWithPulse } from '@/components/d3/ScoreGaugeWithPulse';
import { TrendLineChart } from '@/components/d3/TrendLineChart';
import { RhythmHeatmap } from '@/components/d3/RhythmHeatmap';
import { AnimatedBackdrop } from '@/components/d3/AnimatedBackdrop';
import {
  generateScoreData,
  generateTrendData,
  generateHeatmapData,
  type ScoreData,
  type TrendPoint,
  type HeatmapCell,
} from '@/components/d3/mockData';
import { theme } from '@/styles/theme';

/**
 * D3 Lab - Visual Reference Playground
 * 
 * This page showcases core D3 chart patterns for reuse across the Fine Diet app:
 * - Score Gauge: Semi-circular arc gauge for displaying scores (0-100)
 * - Trend Line: Line chart with area fill for time-series data
 * - Rhythm Heatmap: 7-day grid showing time-block consistency
 * 
 * Use the control panel to toggle theme, motion preferences, and data density.
 */
export default function D3Lab() {
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [dataSize, setDataSize] = useState<'small' | 'large'>('small');
  const [backgroundEnabled, setBackgroundEnabled] = useState(true);

  // Check for system preference on mount
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) {
      setReduceMotion(true);
    }
  }, []);

  // Generate mock data
  const scoreData = useMemo<ScoreData>(
    () => generateScoreData(dataSize),
    [dataSize]
  );

  const trendData = useMemo<TrendPoint[]>(
    () => generateTrendData(14, dataSize),
    [dataSize]
  );

  const heatmapData = useMemo<HeatmapCell[]>(
    () => generateHeatmapData(dataSize),
    [dataSize]
  );

  const isDark = themeMode === 'dark';
  const bgColor = isDark ? theme.colors.brand[900] : theme.colors.neutral[0];
  const cardBg = isDark ? theme.colors.neutral[800] : theme.colors.neutral[0];
  const textColor = isDark ? theme.colors.neutral[0] : theme.colors.neutral[900];
  const borderColor = isDark ? theme.colors.neutral[700] : theme.colors.neutral[200];
  const controlBg = isDark ? theme.colors.neutral[800] : theme.colors.neutral[50];

  return (
    <div
      className="min-h-screen relative"
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      {/* Animated Background */}
      <AnimatedBackdrop
        enabled={backgroundEnabled && !reduceMotion}
        theme={themeMode}
      />

      {/* Sticky Control Panel */}
      <div
        className="sticky top-0 z-20 border-b backdrop-blur-sm"
        style={{
          backgroundColor: controlBg,
          borderColor: borderColor,
        }}
      >
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex flex-wrap items-center gap-6">
            <h1 className="text-2xl font-semibold" style={{ fontFamily: theme.typography.fonts.sans.join(', ') }}>
              D3 Lab
            </h1>

            <div className="flex flex-wrap items-center gap-4 ml-auto">
              {/* Theme Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-sm" style={{ fontFamily: theme.typography.fonts.sans.join(', ') }}>
                  Light
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={themeMode === 'dark'}
                  onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
                  className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent"
                  style={{
                    backgroundColor: themeMode === 'dark' 
                      ? theme.colors.denim[500] 
                      : theme.colors.neutral[300],
                  }}
                >
                  <span
                    className="inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-300 ease-in-out shadow-sm"
                    style={{
                      transform: themeMode === 'dark' ? 'translateX(1.25rem)' : 'translateX(0.125rem)',
                    }}
                  />
                </button>
                <span className="text-sm" style={{ fontFamily: theme.typography.fonts.sans.join(', ') }}>
                  Dark
                </span>
              </label>

              {/* Reduce Motion Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reduceMotion}
                  onChange={(e) => setReduceMotion(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm" style={{ fontFamily: theme.typography.fonts.sans.join(', ') }}>
                  Reduce motion
                </span>
              </label>

              {/* Data Size Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <select
                  value={dataSize}
                  onChange={(e) => setDataSize(e.target.value as 'small' | 'large')}
                  className="px-3 py-1 rounded-md border text-sm"
                  style={{
                    backgroundColor: cardBg,
                    borderColor: borderColor,
                    color: textColor,
                    fontFamily: theme.typography.fonts.sans.join(', '),
                  }}
                >
                  <option value="small">Small data</option>
                  <option value="large">Large data</option>
                </select>
              </label>

              {/* Background Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={backgroundEnabled}
                  onChange={(e) => setBackgroundEnabled(e.target.checked)}
                  className="w-4 h-4"
                  disabled={reduceMotion}
                />
                <span
                  className="text-sm"
                  style={{
                    fontFamily: theme.typography.fonts.sans.join(', '),
                    opacity: reduceMotion ? 0.5 : 1,
                  }}
                >
                  Background animation
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        {/* Description */}
        <div className="mb-8 max-w-3xl">
          <p
            className="text-base opacity-80 leading-relaxed"
            style={{ fontFamily: theme.typography.fonts.sans.join(', ') }}
          >
            Visual reference playground for D3 chart patterns. Use the controls above to toggle
            theme, motion preferences, and data density. Charts are built with D3 scales and paths,
            rendered in React with SVG for optimal performance and accessibility.
          </p>
        </div>

        {/* Chart Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Score Gauge Card */}
          <div
            className="rounded-[2.5rem] p-6 shadow-soft"
            style={{
              backgroundColor: cardBg,
              border: `1px solid ${borderColor}`,
            }}
          >
            <h2
              className="text-xl font-semibold mb-4"
              style={{ fontFamily: theme.typography.fonts.sans.join(', ') }}
            >
              Score Gauge
            </h2>
            <p
              className="text-sm opacity-70 mb-6"
              style={{ fontFamily: theme.typography.fonts.sans.join(', ') }}
            >
              Semi-circular arc gauge displaying Fine Diet Score (0-100) with delta indicator.
            </p>
            <div className="flex justify-center">
              <ScoreGauge
                data={scoreData}
                width={300}
                height={200}
                animate={!reduceMotion}
                theme={themeMode}
              />
            </div>
          </div>

          {/* Score Gauge with Pulse Card */}
          <div
            className="rounded-[2.5rem] p-6 shadow-soft"
            style={{
              backgroundColor: cardBg,
              border: `1px solid ${borderColor}`,
            }}
          >
            <h2
              className="text-xl font-semibold mb-4"
              style={{ fontFamily: theme.typography.fonts.sans.join(', ') }}
            >
              Score Gauge with Pulse
            </h2>
            <p
              className="text-sm opacity-70 mb-6"
              style={{ fontFamily: theme.typography.fonts.sans.join(', ') }}
            >
              Same gauge with a blurred pulsing sphere behind it for added visual depth.
            </p>
            <div className="flex justify-center">
              <ScoreGaugeWithPulse
                data={scoreData}
                width={300}
                height={200}
                animate={!reduceMotion}
                theme={themeMode}
              />
            </div>
          </div>

          {/* Trend Line Chart Card */}
          <div
            className="rounded-[2.5rem] p-6 shadow-soft"
            style={{
              backgroundColor: cardBg,
              border: `1px solid ${borderColor}`,
            }}
          >
            <h2
              className="text-xl font-semibold mb-4"
              style={{ fontFamily: theme.typography.fonts.sans.join(', ') }}
            >
              Trend Line
            </h2>
            <p
              className="text-sm opacity-70 mb-6"
              style={{ fontFamily: theme.typography.fonts.sans.join(', ') }}
            >
              Diet quality over 14 days with area fill and interactive tooltip on hover.
            </p>
            <TrendLineChart
              data={trendData}
              width={400}
              height={250}
              theme={themeMode}
            />
          </div>

          {/* Rhythm Heatmap Card - Full Width */}
          <div
            className="rounded-[2.5rem] p-6 shadow-soft md:col-span-2"
            style={{
              backgroundColor: cardBg,
              border: `1px solid ${borderColor}`,
            }}
          >
            <h2
              className="text-xl font-semibold mb-4"
              style={{ fontFamily: theme.typography.fonts.sans.join(', ') }}
            >
              Rhythm Heatmap
            </h2>
            <p
              className="text-sm opacity-70 mb-6"
              style={{ fontFamily: theme.typography.fonts.sans.join(', ') }}
            >
              7-day grid showing time-block consistency (Morning / Midday / Evening). Intensity
              represents logged (full), partial, or not logged states.
            </p>
            <div className="flex justify-center">
              <RhythmHeatmap
                data={heatmapData}
                width={500}
                height={300}
                theme={themeMode}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
