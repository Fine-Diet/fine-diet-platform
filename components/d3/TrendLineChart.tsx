'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { theme } from '@/styles/theme';
import type { TrendPoint } from './mockData';
import { formatDate } from './mockData';

interface TrendLineChartProps {
  data: TrendPoint[];
  width?: number;
  height?: number;
  theme?: 'light' | 'dark';
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  point: TrendPoint | null;
}

export function TrendLineChart({
  data,
  width = 400,
  height = 250,
  theme: themeMode = 'light',
}: TrendLineChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    point: null,
  });

  const isDark = themeMode === 'dark';
  const lineColor = isDark ? theme.colors.denim[500] : theme.colors.denim[700];
  const areaColor = isDark ? theme.colors.denim[500] : theme.colors.denim[500];
  const gridColor = isDark ? theme.colors.neutral[700] : theme.colors.neutral[200];
  const textColor = isDark ? theme.colors.neutral[0] : theme.colors.neutral[900];
  const tooltipBg = isDark ? theme.colors.neutral[800] : theme.colors.neutral[0];
  const tooltipText = isDark ? theme.colors.neutral[0] : theme.colors.neutral[900];

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => d.date) as [Date, Date])
      .range([0, innerWidth]);

    const yScale = d3
      .scaleLinear()
      .domain([0, 100] as [number, number])
      .nice()
      .range([innerHeight, 0]);

    // Line generator
    const line = d3
      .line<TrendPoint>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.value))
      .curve(d3.curveMonotoneX);

    // Area generator
    const area = d3
      .area<TrendPoint>()
      .x((d) => xScale(d.date))
      .y0(innerHeight)
      .y1((d) => yScale(d.value))
      .curve(d3.curveMonotoneX);

    // Grid lines
    const yTicks = yScale.ticks(5);
    g.selectAll('.grid-line')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('class', 'grid-line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', gridColor)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2,2')
      .attr('opacity', 0.3);

    // Area fill
    g.append('path')
      .datum(data)
      .attr('fill', areaColor)
      .attr('fill-opacity', 0.2)
      .attr('d', area);

    // Line
    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', lineColor)
      .attr('stroke-width', 2.5)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')
      .attr('d', line);

    // Data points
    const circles = g
      .selectAll('.data-point')
      .data(data)
      .enter()
      .append('circle')
      .attr('class', 'data-point')
      .attr('cx', (d) => xScale(d.date))
      .attr('cy', (d) => yScale(d.value))
      .attr('r', 4)
      .attr('fill', lineColor)
      .attr('stroke', isDark ? theme.colors.neutral[900] : theme.colors.neutral[0])
      .attr('stroke-width', 2)
      .style('cursor', 'pointer');

    // X axis
    const xAxis = d3.axisBottom(xScale).ticks(5).tickFormat((d) => {
      if (d instanceof Date) {
        return formatDate(d);
      }
      return '';
    });

    g.append('g')
      .attr('transform', `translate(0, ${innerHeight})`)
      .call(xAxis)
      .attr('color', textColor)
      .attr('opacity', 0.7)
      .selectAll('text')
      .attr('font-family', theme.typography.fonts.sans.join(', '))
      .attr('font-size', '11');

    // Y axis
    const yAxis = d3.axisLeft(yScale).ticks(5);

    g.append('g')
      .call(yAxis)
      .attr('color', textColor)
      .attr('opacity', 0.7)
      .selectAll('text')
      .attr('font-family', theme.typography.fonts.sans.join(', '))
      .attr('font-size', '11');

    // Interactive overlay for tooltip
    const overlay = g
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair');

    // Tooltip interaction
    const handleMouseMove = (event: MouseEvent) => {
      const [mouseX] = d3.pointer(event, svgRef.current);
      const x = mouseX - margin.left;

      if (x < 0 || x > innerWidth) {
        setTooltip({ visible: false, x: 0, y: 0, point: null });
        return;
      }

      // Find closest data point
      const bisect = d3.bisector((d: TrendPoint) => d.date.getTime()).left;
      const xValue = xScale.invert(x);
      const index = bisect(data, xValue, 1);
      const a = data[index - 1];
      const b = data[index];
      const closest = !b || (a && xValue.getTime() - a.date.getTime() < b.date.getTime() - xValue.getTime()) ? a : b;

      if (closest) {
        const [svgX, svgY] = d3.pointer(event, svgRef.current);
        setTooltip({
          visible: true,
          x: svgX,
          y: svgY,
          point: closest,
        });
      }
    };

    const handleMouseLeave = () => {
      setTooltip({ visible: false, x: 0, y: 0, point: null });
    };

    overlay.on('mousemove', handleMouseMove).on('mouseleave', handleMouseLeave);
    circles.on('mousemove', handleMouseMove).on('mouseleave', handleMouseLeave);
  }, [data, width, height, isDark, lineColor, areaColor, gridColor, textColor]);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="w-full h-auto"
        aria-label="Trend line chart showing diet quality over time"
      />
      {tooltip.visible && tooltip.point && (
        <div
          className="absolute pointer-events-none z-10 px-3 py-2 rounded-lg shadow-medium"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y - 60}px`,
            backgroundColor: tooltipBg,
            color: tooltipText,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="text-sm font-semibold" style={{ fontFamily: theme.typography.fonts.sans.join(', ') }}>
            {formatDate(tooltip.point.date)}
          </div>
          <div className="text-xs opacity-80" style={{ fontFamily: theme.typography.fonts.sans.join(', ') }}>
            {tooltip.point.value.toFixed(1)}
          </div>
        </div>
      )}
    </div>
  );
}
