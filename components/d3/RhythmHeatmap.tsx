'use client';

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { theme } from '@/styles/theme';
import type { HeatmapCell } from './mockData';
import { getDayName } from './mockData';

interface RhythmHeatmapProps {
  data: HeatmapCell[];
  width?: number;
  height?: number;
  theme?: 'light' | 'dark';
}

export function RhythmHeatmap({
  data,
  width = 400,
  height = 300,
  theme: themeMode = 'light',
}: RhythmHeatmapProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const isDark = themeMode === 'dark';
  const loggedColor = isDark ? theme.colors.dark_accent[500] : theme.colors.dark_accent[700];
  const partialColor = isDark ? theme.colors.accent[500] : theme.colors.accent[300];
  const emptyColor = isDark ? theme.colors.neutral[700] : theme.colors.neutral[200];
  const textColor = isDark ? theme.colors.neutral[0] : theme.colors.neutral[900];
  const gridColor = isDark ? theme.colors.neutral[600] : theme.colors.neutral[300];

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 40, right: 20, bottom: 60, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Time blocks
    const timeBlocks: Array<'morning' | 'midday' | 'evening'> = ['morning', 'midday', 'evening'];
    const days = 7;

    // Cell dimensions
    const cellWidth = innerWidth / timeBlocks.length;
    const cellHeight = innerHeight / days;
    const cellPadding = 4;

    // Color scale
    const getColor = (intensity: number) => {
      if (intensity === 0) return emptyColor;
      if (intensity === 0.5) return partialColor;
      return loggedColor;
    };

    // Draw cells
    data.forEach((cell) => {
      const x = timeBlocks.indexOf(cell.timeBlock) * cellWidth;
      const y = cell.day * cellHeight;

      // Cell rectangle
      g.append('rect')
        .attr('x', x + cellPadding)
        .attr('y', y + cellPadding)
        .attr('width', cellWidth - cellPadding * 2)
        .attr('height', cellHeight - cellPadding * 2)
        .attr('fill', getColor(cell.intensity))
        .attr('rx', 4)
        .attr('opacity', cell.intensity === 0 ? 0.3 : 0.7);

      // Grid lines
      g.append('line')
        .attr('x1', x)
        .attr('x2', x + cellWidth)
        .attr('y1', y)
        .attr('y2', y)
        .attr('stroke', gridColor)
        .attr('stroke-width', 1)
        .attr('opacity', 0.2);
    });

    // Vertical grid lines
    for (let i = 0; i <= timeBlocks.length; i++) {
      g.append('line')
        .attr('x1', i * cellWidth)
        .attr('x2', i * cellWidth)
        .attr('y1', 0)
        .attr('y2', innerHeight)
        .attr('stroke', gridColor)
        .attr('stroke-width', 1)
        .attr('opacity', 0.2);
    }

    // Day labels (left)
    for (let day = 0; day < days; day++) {
      g.append('text')
        .attr('x', -10)
        .attr('y', day * cellHeight + cellHeight / 2)
        .attr('text-anchor', 'end')
        .attr('alignment-baseline', 'middle')
        .attr('font-size', '12')
        .attr('font-weight', '500')
        .attr('fill', textColor)
        .attr('opacity', 0.8)
        .attr('font-family', theme.typography.fonts.sans.join(', '))
        .text(getDayName(day));
    }

    // Time block labels (top)
    timeBlocks.forEach((block, i) => {
      const label = block.charAt(0).toUpperCase() + block.slice(1);
      g.append('text')
        .attr('x', i * cellWidth + cellWidth / 2)
        .attr('y', -15)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11')
        .attr('font-weight', '500')
        .attr('fill', textColor)
        .attr('opacity', 0.8)
        .attr('font-family', theme.typography.fonts.sans.join(', '))
        .text(label);
    });

    // Legend
    const legendY = innerHeight + 30;
    const legendItems = [
      { label: 'Logged', color: loggedColor, intensity: 1 },
      { label: 'Partial', color: partialColor, intensity: 0.5 },
      { label: 'Not logged', color: emptyColor, intensity: 0 },
    ];

    legendItems.forEach((item, i) => {
      const legendX = (innerWidth / legendItems.length) * i + innerWidth / (legendItems.length * 2) - 30;

      // Color box
      g.append('rect')
        .attr('x', legendX)
        .attr('y', legendY)
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', item.color)
        .attr('rx', 2)
        .attr('opacity', item.intensity === 0 ? 0.3 : 0.7);

      // Label
      g.append('text')
        .attr('x', legendX + 18)
        .attr('y', legendY + 9)
        .attr('font-size', '11')
        .attr('fill', textColor)
        .attr('opacity', 0.7)
        .attr('font-family', theme.typography.fonts.sans.join(', '))
        .text(item.label);
    });
  }, [data, width, height, isDark, loggedColor, partialColor, emptyColor, textColor, gridColor]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="w-full h-auto"
      aria-label="Rhythm heatmap showing time-block consistency over 7 days"
    />
  );
}
