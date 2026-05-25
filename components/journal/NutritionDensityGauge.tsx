'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

// Fixed viewBox so SVG scales with container (100% width)
const VIEW_WIDTH = 95;
const VIEW_HEIGHT = 50.;

interface NutritionDensityGaugeProps {
  value: number | null; // 0-100, or null when loading/unavailable
  animate?: boolean;
  className?: string;
  /** Show loading state instead of a value */
  isLoading?: boolean;
  /** Label to show below the score (default: "Nutrition Density") */
  label?: string;
}

/**
 * Half-donut gauge for Nutrition Density score.
 * Uses fixed viewBox — fills 100% of container width, height scales by aspect ratio.
 */
export function NutritionDensityGauge({
  value,
  animate = true,
  className = '',
  isLoading = false,
  label = 'Nutrition Density',
}: NutritionDensityGaugeProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  // When loading or no value, display 0 for gauge but show placeholder text
  const effectiveValue = isLoading || value === null ? 0 : value;
  const [displayValue, setDisplayValue] = useState(animate ? 0 : effectiveValue);
  const animationFrameRef = useRef<number | undefined>(undefined);

  // Animate the value
  useEffect(() => {
    if (!animate || isLoading || value === null) {
      setDisplayValue(effectiveValue);
      return;
    }

    const startValue = displayValue;
    const endValue = effectiveValue;
    const duration = 1200;
    const startTime = Date.now();

    const animateValue = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + (endValue - startValue) * eased;
      setDisplayValue(Math.round(currentValue));

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animateValue);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animateValue);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [effectiveValue, animate, isLoading, value]);

  // Draw the gauge (all coordinates in viewBox units)
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const centerX = VIEW_WIDTH / 2;
    const centerY = VIEW_HEIGHT - 4;
    const radius = 50;
    const arcThickness = 8;
    const tickLength = 10;
    const numTicks = 50;

    const startAngle = -Math.PI;
    const endAngle = 0;

    const g = svg.append('g').attr('transform', `translate(${centerX}, ${centerY})`);

    const baselineR = radius - arcThickness - tickLength;

    g.append('line')
      .attr('x1', -baselineR)
      .attr('y1', 0)
      .attr('x2', baselineR)
      .attr('y2', 0)
      .attr('stroke', 'rgba(83, 76, 67, 1.0)')
      .attr('stroke-width', .5)
      .attr('stroke-linecap', 'square');

    // Tick marks: the tick at the score gets its own prototype color.
    const lastTickIndex = Math.round((displayValue / 100) * numTicks);
    for (let i = 0; i <= numTicks; i++) {
      const tickAngle = startAngle + (i / numTicks) * (endAngle - startAngle);

      const innerR = radius - arcThickness - 0.5;
      const outerR = innerR - tickLength;

      const x1 = Math.cos(tickAngle) * innerR;
      const y1 = Math.sin(tickAngle) * innerR;
      const x2 = Math.cos(tickAngle) * outerR;
      const y2 = Math.sin(tickAngle) * outerR;

      let stroke = 'rgba(125, 118, 108, 1.0)';
      if (i < lastTickIndex) {
        stroke = 'rgba(83, 76, 67, 1.0)';
      } else if (i === lastTickIndex) {
        stroke = 'rgba(192, 208, 220, 1.0)';
      } else {
        stroke = 'rgba(83, 76, 67, 1.0)';
      }

      const strokeWidth = i === 0 || i === numTicks ? 0.5 : 1;

      g.append('line')
        .attr('x1', x1)
        .attr('y1', y1)
        .attr('x2', x2)
        .attr('y2', y2)
        .attr('stroke', stroke)
        .attr('stroke-width', strokeWidth)
        .attr('stroke-linecap', 'square');
    }

  }, [displayValue]);

  return (
    <div className={`relative flex w-full flex-col items-center ${className}`}>
      <div className="relative w-full">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-auto block"
          style={{ maxWidth: '100%' }}
          aria-label={`Nutrition Density score: ${displayValue}`}
        />
        {/* Score and label overlaid inside the half-donut */}
        <div className="absolute left-1/2 md:top-[64%] top-[65%] -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
          {isLoading ? (
            <>
              <div className="text-[7xl] font-regular text-white/0 tracking-tight">—</div>
              <div className="text-white font-semibold text-lg mt-[-18px]">Loading...</div>
            </>
          ) : value === null ? (
            <>
              <div className="text-7xl font-regular text-white/50 tracking-tight">—</div>
              <div className="text-white font-semibold text-lg mt-[-18px]">{label}</div>
            </>
          ) : (
            <>
              <div className="text-8xl md:text-[6.4rem] font-regular text-white tracking-tight">{displayValue}</div>
              <div className="text-white font-semibold text-base md:text-lg mt-[-10px] md:mt-[-15px]">{label}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
