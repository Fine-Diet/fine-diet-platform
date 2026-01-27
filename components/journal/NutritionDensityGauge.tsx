'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface NutritionDensityGaugeProps {
  value: number; // 0-100
  animate?: boolean;
  size?: number; // width/height of the component
  className?: string;
}

/**
 * Half-donut gauge for Nutrition Density score.
 * Displays a semicircular arc with tick marks and centered score.
 */
export function NutritionDensityGauge({
  value,
  animate = true,
  size = 280,
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

  // Draw the gauge
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = size;
    const height = size * 0.6; // Half-circle needs less height
    const centerX = width / 2;
    const centerY = height - 20; // Position arc near bottom

    const radius = Math.min(width, height * 1.5) / 2 - 20;
    const arcThickness = 8;
    const tickLength = 12;
    const numTicks = 40;

    // Arc angles: semicircle opening upward
    const startAngle = -Math.PI; // Left
    const endAngle = 0; // Right

    const g = svg.append('g').attr('transform', `translate(${centerX}, ${centerY})`);

    // Scale for value (0-100 maps to arc)
    const scale = d3.scaleLinear().domain([0, 100]).range([startAngle, endAngle]);

    // Draw tick marks
    for (let i = 0; i <= numTicks; i++) {
      const tickAngle = startAngle + (i / numTicks) * (endAngle - startAngle);
      const tickValue = (i / numTicks) * 100;
      const isActive = tickValue <= displayValue;
      
      const innerR = radius - arcThickness - 2;
      const outerR = innerR - tickLength;
      
      const x1 = Math.cos(tickAngle) * innerR;
      const y1 = Math.sin(tickAngle) * innerR;
      const x2 = Math.cos(tickAngle) * outerR;
      const y2 = Math.sin(tickAngle) * outerR;

      g.append('line')
        .attr('x1', x1)
        .attr('y1', y1)
        .attr('x2', x2)
        .attr('y2', y2)
        .attr('stroke', isActive ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.25)')
        .attr('stroke-width', 2)
        .attr('stroke-linecap', 'round');
    }

    // Draw background arc (track)
    const trackArc = d3.arc()
      .innerRadius(radius - arcThickness)
      .outerRadius(radius)
      .startAngle(startAngle)
      .endAngle(endAngle);

    g.append('path')
      .attr('d', trackArc(null as any) || '')
      .attr('fill', 'rgba(255, 255, 255, 0.15)');

    // Draw value arc
    const valueArc = d3.arc()
      .innerRadius(radius - arcThickness)
      .outerRadius(radius)
      .startAngle(startAngle)
      .endAngle(scale(displayValue));

    g.append('path')
      .attr('d', valueArc(null as any) || '')
      .attr('fill', 'rgba(255, 255, 255, 0.8)');

  }, [displayValue, size]);

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <svg
        ref={svgRef}
        width={size}
        height={size * 0.6}
        viewBox={`0 0 ${size} ${size * 0.6}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-auto"
        style={{ maxWidth: size }}
        aria-label={`Nutrition Density score: ${displayValue}`}
      />
      {/* Score and label positioned below the arc */}
      <div className="text-center -mt-4">
        <div className="text-7xl font-light text-white tracking-tight">
          {displayValue}
        </div>
        <div className="text-white/70 text-base mt-1">
          Nutrition Density
        </div>
      </div>
    </div>
  );
}
