'use client';

import * as React from 'react';
import { useLocale } from 'next-intl';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { seriesColor } from './palette';
import { formatVizValue, type VizValueFormat } from './format';

export interface TrendSeries {
  key: string;
  label: string;
  color?: string;
}

export type TrendDatum = Record<string, string | number | null>;

export interface TrendChartProps {
  data: readonly TrendDatum[];
  /** The field holding each point's x value (a date or category). */
  xKey: string;
  series: readonly TrendSeries[];
  kind?: 'area' | 'line' | 'bar';
  stacked?: boolean;
  height?: number;
  /** How values are shown on the axis, tooltip and hidden table. The x values are shown as given, so pass them pre-formatted. */
  valueFormat?: VizValueFormat;
  /** Accessible name for the chart; also captions the hidden data table. */
  label: string;
  showLegend?: boolean;
}

/**
 * The one time-series / category chart every page uses (recharts), themed from the design tokens.
 * Hebrew mirrors the x axis and moves the y axis to the right, so time reads right-to-left. A
 * visually hidden table carries the same numbers for screen readers and for tests (jsdom cannot
 * lay out SVG).
 */
export function TrendChart({
  data,
  xKey,
  series,
  kind = 'area',
  stacked,
  height = 260,
  valueFormat = 'number',
  label,
  showLegend = series.length > 1,
}: TrendChartProps): React.ReactElement {
  const locale = useLocale();
  const rtl = locale === 'he';
  const valueFormatter = (value: number) => formatVizValue(value, valueFormat, locale);
  const xFormatter = (value: string) => value;
  const gradientId = React.useId().replace(/:/g, '');
  const rows = data as TrendDatum[];

  // A keyed array, not a fragment: recharts 2 finds its axes, grid, tooltip and legend among the
  // chart's direct children and does not look inside a fragment - wrapped in one, none rendered.
  const axes = [
      <CartesianGrid key="grid" strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />,
      <XAxis
        key="x"
        dataKey={xKey}
        reversed={rtl}
        tickFormatter={(value: unknown) => xFormatter(String(value))}
        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
        axisLine={false}
        tickLine={false}
        minTickGap={16}
      />,
      <YAxis
        key="y"
        orientation={rtl ? 'right' : 'left'}
        tickFormatter={(value: unknown) => valueFormatter(Number(value))}
        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
        axisLine={false}
        tickLine={false}
        width={56}
      />,
      <Tooltip
        key="tooltip"
        formatter={(value: unknown) => valueFormatter(Number(value))}
        labelFormatter={(value: unknown) => xFormatter(String(value))}
        contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
        cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
      />,
      showLegend ? <Legend key="legend" wrapperStyle={{ fontSize: 12 }} /> : null,
  ];

  let chart: React.ReactElement;
  if (kind === 'bar') {
    chart = (
      <BarChart data={rows}>
        {axes}
        {series.map((entry, index) => (
          <Bar key={entry.key} dataKey={entry.key} name={entry.label} fill={seriesColor(index, entry.color)} radius={[6, 6, 0, 0]} maxBarSize={56} stackId={stacked ? 'stack' : undefined} />
        ))}
      </BarChart>
    );
  } else if (kind === 'line') {
    chart = (
      <LineChart data={rows}>
        {axes}
        {series.map((entry, index) => (
          <Line key={entry.key} type="monotone" dataKey={entry.key} name={entry.label} stroke={seriesColor(index, entry.color)} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} />
        ))}
      </LineChart>
    );
  } else {
    chart = (
      <AreaChart data={rows}>
        <defs>
          {series.map((entry, index) => (
            <linearGradient key={entry.key} id={`${gradientId}-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={seriesColor(index, entry.color)} stopOpacity={0.35} />
              <stop offset="100%" stopColor={seriesColor(index, entry.color)} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        {axes}
        {series.map((entry, index) => (
          <Area
            key={entry.key}
            type="monotone"
            dataKey={entry.key}
            name={entry.label}
            stroke={seriesColor(index, entry.color)}
            strokeWidth={2.5}
            fill={`url(#${gradientId}-${index})`}
            stackId={stacked ? 'stack' : undefined}
            connectNulls={false}
          />
        ))}
      </AreaChart>
    );
  }

  return (
    <figure className="w-full" aria-label={label} data-testid="trend-chart">
      <div dir="ltr" style={{ height }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          {chart}
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">{xKey}</th>
            {series.map((entry) => (
              <th key={entry.key} scope="col">
                {entry.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${String(row[xKey])}-${index}`}>
              <th scope="row">{xFormatter(String(row[xKey]))}</th>
              {series.map((entry) => {
                const value = row[entry.key];
                return <td key={entry.key}>{typeof value === 'number' ? valueFormatter(value) : '-'}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
