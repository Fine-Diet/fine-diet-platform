'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { theme } from '@/styles/theme';
import type { ScoreData } from './mockData';

interface ScoreGaugeWithPulseProps {
  data: ScoreData;
  width?: number;
  height?: number;
  animate?: boolean;
  theme?: 'light' | 'dark';
}

export function ScoreGaugeWithPulse({
  data,
  width = 300,
  height = 200,
  animate = true,
  theme: themeMode = 'light',
}: ScoreGaugeWithPulseProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [displayValue, setDisplayValue] = useState(animate ? 0 : data.value);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const pulseAnimationRef = useRef<number | undefined>(undefined);

  const isDark = themeMode === 'dark';
  const arcColor = isDark ? theme.colors.denim[500] : theme.colors.denim[700];
  const trackColor = isDark ? theme.colors.neutral[700] : theme.colors.neutral[200];
  const textColor = isDark ? theme.colors.neutral[0] : theme.colors.neutral[900];
  const deltaColor = data.delta >= 0 
    ? theme.colors.semantic.success 
    : theme.colors.semantic.error;
  const sphereColor = arcColor;

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

  // Pulse animation for the sphere
  useEffect(() => {
    if (!animate || !svgRef.current) return;

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const sphereElement = svgRef.current.querySelector('.pulse-sphere') as SVGCircleElement;
    if (!sphereElement) return;

    const pulseDuration = 3000; // 3 seconds for a full pulse cycle
    let startTime = Date.now();

    const pulse = () => {
      const elapsed = Date.now() - startTime;
      const progress = (elapsed % pulseDuration) / pulseDuration;
      
      // Create a smooth sine wave for pulsing (0 to 1)
      const pulseValue = (Math.sin(progress * Math.PI * 2) + 1) / 2;
      
      // Pulse opacity between 0.2 and 0.5
      const opacity = 0.2 + pulseValue * 0.3;
      
      // Pulse size between 0.9x and 1.1x
      const baseRadius = parseFloat(sphereElement.getAttribute('r') || '40');
      const scale = 0.9 + pulseValue * 0.2;
      const currentRadius = baseRadius * scale;
      
      sphereElement.setAttribute('opacity', opacity.toString());
      sphereElement.setAttribute('r', currentRadius.toString());

      pulseAnimationRef.current = requestAnimationFrame(pulse);
    };

    pulseAnimationRef.current = requestAnimationFrame(pulse);

    return () => {
      if (pulseAnimationRef.current) {
        cancelAnimationFrame(pulseAnimationRef.current);
      }
    };
  }, [animate]);

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

    // SVG filter definitions for blur
    const defs = svg.append('defs');
    const filter = defs
      .append('filter')
      .attr('id', 'blur-filter')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    
    filter
      .append('feGaussianBlur')
      .attr('in', 'SourceGraphic')
      .attr('stdDeviation', '8');

    // Arc parameters
    const radius = Math.min(innerWidth, innerHeight * 1.2) / 2;
    const arcThickness = 12;
    const startAngle = (3 * Math.PI) / 2; // 270 degrees (bottom) - rotated 90° CCW
    const endAngle = Math.PI / 2; // 90 degrees (top) - rotated 90° CCW

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

    // Center point - centered horizontally, moved down 100px from vertical center
    const centerX = innerWidth / 2;
    const centerY = innerHeight / 2 + 100;

    // Draw blurred pulsing sphere (behind everything) - 3x bigger, positioned at arc center
    const sphereRadius = radius * 1.2; // 3x bigger than original (was 0.4, now 1.2)
    g.append('circle')
      .attr('class', 'pulse-sphere')
      .attr('cx', centerX)
      .attr('cy', centerY)
      .attr('r', sphereRadius)
      .attr('fill', sphereColor)
      .attr('opacity', 0.3)
      .attr('filter', 'url(#blur-filter)');

    // Draw track
    g.append('path')
      .attr('d', trackArc(null as any) || '')
      .attr('transform', `translate(${centerX}, ${centerY})`)
      .attr('fill', trackColor)
      .attr('opacity', 0.3);

    // Draw value arc
    g.append('path')
      .attr('d', valueArc(null as any) || '')
      .attr('transform', `translate(${centerX}, ${centerY})`)
      .attr('fill', arcColor)
      .attr('opacity', 0.9);

    // Value text (centered horizontally with the arc center)
    const textX = centerX;
    g.append('text')
      .attr('x', textX)
      .attr('y', centerY - 10)
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
      .attr('y', centerY + 20)
      .attr('text-anchor', 'middle')
      .attr('font-size', '14')
      .attr('font-weight', '400')
      .attr('fill', textColor)
      .attr('opacity', 0.7)
      .attr('font-family', theme.typography.fonts.sans.join(', '))
      .text(data.label);

    // Delta indicator (positioned above value text with proper spacing)
    if (data.delta !== 0) {
      const deltaY = centerY - 50;
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
  }, [displayValue, width, height, data, isDark, arcColor, trackColor, textColor, deltaColor, sphereColor]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="w-full h-auto"
      aria-label={`Score gauge with pulsing sphere showing ${data.value} out of 100`}
    />
  );
}
