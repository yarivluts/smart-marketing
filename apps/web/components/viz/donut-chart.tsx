'use client';

import * as React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useLocale } from 'next-intl';
import { seriesColor } from './palette';
import { formatVizValue, type VizValueFormat } from './format';

export interface DonutSlice {
  label: string;
  value: number;
  color?: string;
}

export interface DonutChartProps {
  data: readonly DonutSlice[];
  label: string;
  centerValue?: string;
  centerLabel?: string;
  valueFormat?: VizValueFormat;
  size?: number;
  /** side: legend beside the ring (wide cards); stacked: legend under it (narrow cards). */
  layout?: 'side' | 'stacked';
}

/** A share-of-total donut with its legend beside it (each slice's value and percentage). */
export function DonutChart({ data, label, centerValue, centerLabel, valueFormat = 'number', size = 180, layout = 'side' }: DonutChartProps): React.ReactElement {
  const locale = useLocale();
  const valueFormatter = (value: number) => formatVizValue(value, valueFormat, locale);
  const total = data.reduce((sum, slice) => sum + slice.value, 0);
  const slices = data.map((slice, index) => ({ ...slice, fill: seriesColor(index, slice.color) }));
  return (
    <figure className={layout === 'side' ? 'flex flex-col items-center gap-4 sm:flex-row sm:items-center' : 'flex flex-col items-center gap-4'} aria-label={label} data-testid="donut-chart">
      <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="none" isAnimationActive>
              {slices.map((slice) => (
                <Cell key={slice.label} fill={slice.fill} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: unknown) => valueFormatter(Number(value))}
              contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        {centerValue ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold text-foreground">{centerValue}</span>
            {centerLabel ? <span className="text-[11px] text-muted-foreground">{centerLabel}</span> : null}
          </div>
        ) : null}
      </div>
      <ul className="flex w-full flex-col gap-2 text-sm">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.fill }} />
              <span className="truncate text-foreground">{slice.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground" dir="ltr">
              {valueFormatter(slice.value)}
              {total > 0 ? ` · ${Math.round((slice.value / total) * 100)}%` : ''}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
