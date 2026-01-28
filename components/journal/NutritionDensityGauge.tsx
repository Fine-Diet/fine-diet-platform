'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

// Fixed viewBox so SVG scales with container (100% width)
const VIEW_WIDTH = 95;
const VIEW_HEIGHT = 54;

interface NutritionDensityGaugeProps {
  value: number; // 0-100
  animate?: boolean;
  className?: string;
}

/**
 * Half-donut gauge for Nutrition Density score.
 * Uses fixed viewBox — fills 100% of container width, height scales by aspect ratio.
 */
export function NutritionDensityGauge({
  value,
  animate = true,
  className = '',
}: NutritionDensityGaugeProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [displayValue, setDisplayValue] = useState(animate ? 0 : value);
  const animationFrameRef = useRef<number | undefined>(undefined);

  // Animate the value
  useEffect(() => {
    if (!animate) {
      setDisplayValue(value);
      return;
    }

    const startValue = displayValue;
    const endValue = value;
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
  }, [value, animate]);

  // Draw the gauge (all coordinates in viewBox units)
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const centerX = VIEW_WIDTH / 2;
    const centerY = VIEW_HEIGHT - 4;
    const radius = 50;
    const arcThickness = 8;
    const tickLength = 18;
    const numTicks = 50;

    const startAngle = -Math.PI;
    const endAngle = 0;

    const g = svg.append('g').attr('transform', `translate(${centerX}, ${centerY})`);

    // Tick marks: only the tick at the score is full brightness; ticks before it are mid brightness
    const lastTickIndex = Math.round((displayValue / 100) * numTicks);
    for (let i = 0; i <= numTicks; i++) {
      const tickAngle = startAngle + (i / numTicks) * (endAngle - startAngle);

      const innerR = radius - arcThickness - 0.5;
      const outerR = innerR - tickLength;

      const x1 = Math.cos(tickAngle) * innerR;
      const y1 = Math.sin(tickAngle) * innerR;
      const x2 = Math.cos(tickAngle) * outerR;
      const y2 = Math.sin(tickAngle) * outerR;

      let opacity: number;
      if (i < lastTickIndex) {
        opacity = 0.4; // ticks before the score — mid brightness
      } else if (i === lastTickIndex) {
        opacity = 1; // the tick that represents the score — full brightness
      } else {
        opacity = 0.20; // ticks after the score — dim
      }

      g.append('line')
        .attr('x1', x1)
        .attr('y1', y1)
        .attr('x2', x2)
        .attr('y2', y2)
        .attr('stroke', `rgba(255, 255, 255, ${opacity})`)
        .attr('stroke-width', 0.9)
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
        <div className="absolute left-1/2 top-[77%] -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
          <div className="text-7xl font-regular text-white tracking-tight">{displayValue}</div>
          <div className="text-white/70 font-regular text-xl mt-[-5px]">Nutrition Density</div>
        </div>
      </div>
    </div>
  );
}
