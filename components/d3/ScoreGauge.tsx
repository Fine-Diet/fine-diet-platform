'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { theme } from '@/styles/theme';
import type { ScoreData } from './mockData';

interface ScoreGaugeProps {
  data: ScoreData;
  width?: number;
  height?: number;
  animate?: boolean;
  theme?: 'light' | 'dark';
  // Positioning controls for container-based placement
  verticalOffset?: number; // Vertical offset from center (default: 100)
  arcVerticalOffset?: number; // Arc offset relative to text (default: calculated)
  className?: string; // Additional CSS classes for the container
}

export function ScoreGauge({
  data,
  width = 300,
  height = 200,
  animate = true,
  theme: themeMode = 'light',
  verticalOffset = 100,
  arcVerticalOffset,
  className = '',
}: ScoreGaugeProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [displayValue, setDisplayValue] = useState(animate ? 0 : data.value);
  const animationFrameRef = useRef<number | undefined>(undefined);

  const isDark = themeMode === 'dark';
  const arcColor = isDark ? theme.colors.denim[500] : theme.colors.denim[700];
  const trackColor = isDark ? theme.colors.neutral[700] : theme.colors.neutral[200];
  const textColor = isDark ? theme.colors.neutral[0] : theme.colors.neutral[900];
  const deltaColor = data.delta >= 0 
    ? theme.colors.semantic.success 
    : theme.colors.semantic.error;

  useEffect(() => {
    if (!animate) {
      setDisplayValue(data.value);
      return;
    }

    const startValue = displayValue;
    const endValue = data.value;
    const duration = 1000; // 1 second
    const startTime = Date.now();

    const animateValue = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (ease-out)
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
  }, [data.value, animate]);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Arc parameters - arc opens downward (inverted U shape)
    const radius = Math.min(innerWidth, innerHeight * 1.2) / 2;
    const arcThickness = 12;
    const startAngle = -Math.PI / 2; // 270 degrees (bottom) - bottom-left of inverted U
    const endAngle = Math.PI / 2; // 90 degrees (top) - bottom-right of inverted U

    // Scale for value (0-100)
    const scale = d3.scaleLinear().domain([0, 100]).range([startAngle, endAngle]);

    // Arc generator for track (background)
    const trackArc = d3
      .arc()
      .innerRadius(radius - arcThickness)
      .outerRadius(radius)
      .startAngle(startAngle)
      .endAngle(endAngle);

    // Arc generator for value
    const valueArc = d3
      .arc()
      .innerRadius(radius - arcThickness)
      .outerRadius(radius)
      .startAngle(startAngle)
      .endAngle(scale(displayValue));

    // Center point - centered horizontally, with configurable vertical offset
    const centerX = innerWidth / 2;
    const textCenterY = innerHeight / 2 + verticalOffset;
    
    // Arc center positioned above the text (arc opens downward)
    // Default calculation: textCenterY - radius - 30 + 145, or use provided offset
    const defaultArcOffset = textCenterY - radius - 30 + 145;
    const arcCenterY = arcVerticalOffset !== undefined 
      ? textCenterY + arcVerticalOffset 
      : defaultArcOffset;

    // Draw track
    g.append('path')
      .attr('d', trackArc(null as any) || '')
      .attr('transform', `translate(${centerX}, ${arcCenterY})`)
      .attr('fill', trackColor)
      .attr('opacity', 0.3);

    // Draw value arc
    g.append('path')
      .attr('d', valueArc(null as any) || '')
      .attr('transform', `translate(${centerX}, ${arcCenterY})`)
      .attr('fill', arcColor)
      .attr('opacity', 0.9);

    // Value text (centered horizontally with the arc center)
    const textX = centerX;
    g.append('text')
      .attr('x', textX)
      .attr('y', textCenterY - 10)
      .attr('text-anchor', 'middle')
      .attr('font-size', '36')
      .attr('font-weight', '600')
      .attr('fill', textColor)
      .attr('font-family', theme.typography.fonts.sans.join(', '))
      .attr('alignment-baseline', 'middle')
      .text(displayValue);

    // Label text (positioned below value with proper spacing)
    g.append('text')
      .attr('x', textX)
      .attr('y', textCenterY + 20)
      .attr('text-anchor', 'middle')
      .attr('font-size', '14')
      .attr('font-weight', '400')
      .attr('fill', textColor)
      .attr('opacity', 0.7)
      .attr('font-family', theme.typography.fonts.sans.join(', '))
      .text(data.label);

    // Delta indicator (positioned above value text with proper spacing)
    if (data.delta !== 0) {
      const deltaY = textCenterY - 50;
      const arrowSize = 8;
      const isPositive = data.delta > 0;

      // Arrow path (pointing up for positive, down for negative)
      const arrowPath = isPositive
        ? `M ${textX} ${deltaY} L ${textX - arrowSize} ${deltaY + arrowSize} L ${textX + arrowSize} ${deltaY + arrowSize} Z`
        : `M ${textX} ${deltaY} L ${textX - arrowSize} ${deltaY - arrowSize} L ${textX + arrowSize} ${deltaY - arrowSize} Z`;

      g.append('path')
        .attr('d', arrowPath)
        .attr('fill', deltaColor);

      // Delta text (positioned above/below arrow with proper spacing)
      g.append('text')
        .attr('x', textX)
        .attr('y', deltaY + (isPositive ? arrowSize + 18 : -arrowSize - 5))
        .attr('text-anchor', 'middle')
        .attr('font-size', '12')
        .attr('font-weight', '500')
        .attr('fill', deltaColor)
        .attr('font-family', theme.typography.fonts.sans.join(', '))
        .text(`${isPositive ? '+' : ''}${data.delta}`);
    }
  }, [displayValue, width, height, data, isDark, arcColor, trackColor, textColor, deltaColor, verticalOffset, arcVerticalOffset]);

  return (
    <div className={`inline-block ${className}`}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-auto"
        style={{ maxWidth: '100%', height: 'auto' }}
        aria-label={`Score gauge showing ${data.value} out of 100`}
      />
    </div>
  );
}
