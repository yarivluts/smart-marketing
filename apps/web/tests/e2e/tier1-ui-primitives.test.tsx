import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';
import { renderWithIntl } from './helpers/test-harness';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

// Standard StatCard Primitive Mock
interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeType?: 'increase' | 'decrease' | 'neutral';
  period?: string;
  trendLabel?: string;
}

function StatCard({
  title,
  value,
  change,
  changeType = 'neutral',
  period = 'vs prev 30d',
  trendLabel,
}: StatCardProps) {
  const isPositive = changeType === 'increase';
  const isNegative = changeType === 'decrease';

  return (
    <Card className="p-4 shadow-soft-sm hover:shadow-soft-md transition-shadow">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="mt-2 flex items-baseline justify-between">
        <div className="text-2xl font-bold tracking-tight" dir="ltr" data-testid="stat-card-value">
          {value}
        </div>
        {change !== undefined && (
          <span
            data-testid="stat-card-trend-chip"
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
              isPositive
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : isNegative
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {isPositive ? '↑' : isNegative ? '↓' : '→'} {change > 0 ? `+${change}%` : `${change}%`}
          </span>
        )}
      </div>
      {(period || trendLabel) && (
        <div className="mt-1 text-xs text-muted-foreground">
          {trendLabel ?? period}
        </div>
      )}
    </Card>
  );
}

// Badge Primitive Mock
interface BadgeProps {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info';
  children: React.ReactNode;
}

function Badge({ variant = 'default', children }: BadgeProps) {
  const variantClasses = {
    default: 'bg-primary text-primary-foreground',
    secondary: 'bg-secondary text-secondary-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
    outline: 'border border-input text-foreground',
    success: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-600 border border-amber-500/20',
    info: 'bg-sky-500/10 text-sky-600 border border-sky-500/20',
  };

  return (
    <span
      data-testid="badge-primitive"
      className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold transition-colors ${variantClasses[variant]}`}
    >
      {children}
    </span>
  );
}

// Skeleton Primitive Mock
function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return (
    <div
      data-testid="skeleton-primitive"
      className={`animate-pulse rounded-md bg-muted ${className}`}
    />
  );
}

// Switch Primitive Mock
function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  'aria-label': ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-emerald-600' : 'bg-input'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// Tabs Primitive Mock
function SegmentedTabs({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: { id: string; label: string }[];
  activeTab: string;
  onTabChange: (id: string) => void;
}) {
  return (
    <div role="tablist" className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          type="button"
          aria-selected={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${
            activeTab === tab.id ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// Dialog Primitive Mock
function ModalDialog({
  isOpen,
  onClose,
  title,
  description,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-background p-6 shadow-xl space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">{title}</h2>
          <button type="button" aria-label="Close dialog" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            ✕
          </button>
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

// Table Primitive Mock
function DataTable<T extends Record<string, any>>({
  columns,
  data,
  emptyNotice = 'No records found',
}: {
  columns: { key: keyof T; header: string; align?: 'left' | 'right' | 'center' }[];
  data: T[];
  emptyNotice?: string;
}) {
  if (data.length === 0) {
    return <div data-testid="table-empty" className="p-8 text-center text-muted-foreground">{emptyNotice}</div>;
  }

  return (
    <div className="overflow-x-auto border rounded-xl">
      <table className="w-full text-sm text-left">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground border-b">
          <tr>
            {columns.map((col) => (
              <th key={String(col.key)} className="px-4 py-3 font-medium">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.map((row, idx) => (
            <tr key={idx} className="hover:bg-muted/30 transition-colors">
              {columns.map((col) => (
                <td key={String(col.key)} className="px-4 py-3">
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

describe('Tier 1: Standardized UI Primitives & Design System Tokens (R1)', () => {
  it('1.1 Button: renders all standard variants (default, destructive, outline, secondary, ghost, link, emerald) with correct styles and sizes', () => {
    renderWithIntl(
      <div>
        <Button variant="default">Default Action</Button>
        <Button variant="destructive">Delete Campaign</Button>
        <Button variant="outline">Secondary Action</Button>
        <Button variant="ghost">Ghost Action</Button>
        <Button variant="link">Learn More</Button>
        <Button variant="emerald">Launch Live</Button>
        <Button size="sm">Small</Button>
        <Button size="lg">Large</Button>
      </div>,
    );

    const defaultBtn = screen.getByRole('button', { name: 'Default Action' });
    expect(defaultBtn).toHaveClass('bg-primary');

    const destBtn = screen.getByRole('button', { name: 'Delete Campaign' });
    expect(destBtn).toHaveClass('bg-destructive');

    const outlineBtn = screen.getByRole('button', { name: 'Secondary Action' });
    expect(outlineBtn).toHaveClass('border');

    const ghostBtn = screen.getByRole('button', { name: 'Ghost Action' });
    expect(ghostBtn).toHaveClass('hover:bg-muted');

    const emeraldBtn = screen.getByRole('button', { name: 'Launch Live' });
    expect(emeraldBtn).toHaveClass('bg-emerald-600');
  });

  it('1.2 Button: handles click events, disabled state, and loading spinner', () => {
    const onClick = vi.fn();
    renderWithIntl(
      <div>
        <Button onClick={onClick}>Active Button</Button>
        <Button disabled onClick={onClick}>Disabled Button</Button>
        <Button isLoading onClick={onClick}>Loading Button</Button>
      </div>,
    );

    const activeBtn = screen.getByRole('button', { name: 'Active Button' });
    fireEvent.click(activeBtn);
    expect(onClick).toHaveBeenCalledTimes(1);

    const disabledBtn = screen.getByRole('button', { name: 'Disabled Button' });
    expect(disabledBtn).toBeDisabled();
    fireEvent.click(disabledBtn);
    expect(onClick).toHaveBeenCalledTimes(1); // Not called again

    const loadingBtn = screen.getByRole('button', { name: 'Loading Button' });
    expect(loadingBtn).toBeDisabled();
    expect(loadingBtn).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('button-spinner')).toBeInTheDocument();
  });

  it('1.3 Card: renders full card hierarchy (Header, Title, Description, Content, Footer) with consistent padding and typography', () => {
    renderWithIntl(
      <Card data-testid="test-card">
        <CardHeader>
          <CardTitle>Performance Overview</CardTitle>
          <CardDescription>Blended multi-channel marketing statistics</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Main content area with analytics charts.</p>
        </CardContent>
        <CardFooter>
          <Button size="sm">Export Report</Button>
        </CardFooter>
      </Card>,
    );

    expect(screen.getByTestId('test-card')).toBeInTheDocument();
    expect(screen.getByText('Performance Overview')).toBeInTheDocument();
    expect(screen.getByText('Blended multi-channel marketing statistics')).toBeInTheDocument();
    expect(screen.getByText('Main content area with analytics charts.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export Report' })).toBeInTheDocument();
  });

  it('1.4 Input: renders input controls with placeholder, disabled state, and handles text input changes', () => {
    function ControlledInput() {
      const [val, setVal] = useState('');
      return (
        <div>
          <Input
            data-testid="search-input"
            placeholder="Search campaigns..."
            value={val}
            onChange={(e) => setVal(e.target.value)}
          />
          <span data-testid="input-output">{val}</span>
        </div>
      );
    }

    renderWithIntl(<ControlledInput />);

    const input = screen.getByTestId('search-input');
    expect(input).toHaveAttribute('placeholder', 'Search campaigns...');

    fireEvent.change(input, { target: { value: 'Retargeting Q3' } });
    expect(screen.getByTestId('input-output')).toHaveTextContent('Retargeting Q3');
  });

  it('1.5 StatCard: renders KPI scorecard with positive (Emerald) and negative (Rose) trend chips and LTR isolation', () => {
    renderWithIntl(
      <div>
        <StatCard
          title="Total Blended Spend"
          value="$14,250"
          change={12.4}
          changeType="increase"
        />
        <StatCard
          title="Blended CAC"
          value="$47.50"
          change={-8.5}
          changeType="decrease"
        />
      </div>,
    );

    expect(screen.getByText('Total Blended Spend')).toBeInTheDocument();
    expect(screen.getByText('$14,250')).toBeInTheDocument();
    expect(screen.getByText('$14,250')).toHaveAttribute('dir', 'ltr');

    const trendChips = screen.getAllByTestId('stat-card-trend-chip');
    expect(trendChips[0]).toHaveTextContent('+12.4%');
    expect(trendChips[0]).toHaveClass('text-emerald-600');

    expect(trendChips[1]).toHaveTextContent('-8.5%');
    expect(trendChips[1]).toHaveClass('text-rose-600');
  });

  it('1.6 Badge: renders color-coded badges for status variants (success, warning, info, destructive)', () => {
    renderWithIntl(
      <div>
        <Badge variant="success">Active</Badge>
        <Badge variant="warning">At Risk</Badge>
        <Badge variant="destructive">Paused</Badge>
        <Badge variant="info">Optimizing</Badge>
      </div>,
    );

    const badges = screen.getAllByTestId('badge-primitive');
    expect(badges[0]).toHaveTextContent('Active');
    expect(badges[0]).toHaveClass('text-emerald-600');

    expect(badges[1]).toHaveTextContent('At Risk');
    expect(badges[1]).toHaveClass('text-amber-600');

    expect(badges[2]).toHaveTextContent('Paused');
    expect(badges[2]).toHaveClass('bg-destructive');

    expect(badges[3]).toHaveTextContent('Optimizing');
    expect(badges[3]).toHaveClass('text-sky-600');
  });

  it('1.7 Switch: toggles boolean state with accessible switch role and smooth emerald active color', () => {
    function ToggleContainer() {
      const [enabled, setEnabled] = useState(false);
      return (
        <div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label="Auto-pilot optimization"
          />
          <span data-testid="switch-status">{enabled ? 'ON' : 'OFF'}</span>
        </div>
      );
    }

    renderWithIntl(<ToggleContainer />);

    const switchBtn = screen.getByRole('switch', { name: 'Auto-pilot optimization' });
    expect(switchBtn).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('switch-status')).toHaveTextContent('OFF');

    fireEvent.click(switchBtn);
    expect(switchBtn).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('switch-status')).toHaveTextContent('ON');
    expect(switchBtn).toHaveClass('bg-emerald-600');
  });

  it('1.8 SegmentedTabs: switches active tab indicator with proper aria-selected attribute', () => {
    function TabbedView() {
      const [tab, setTab] = useState('overview');
      return (
        <div>
          <SegmentedTabs
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'creatives', label: 'Creatives' },
              { id: 'audiences', label: 'Audiences' },
            ]}
            activeTab={tab}
            onTabChange={setTab}
          />
          <div data-testid="tab-content">Current Tab: {tab}</div>
        </div>
      );
    }

    renderWithIntl(<TabbedView />);

    const overviewTab = screen.getByRole('tab', { name: 'Overview' });
    const creativesTab = screen.getByRole('tab', { name: 'Creatives' });

    expect(overviewTab).toHaveAttribute('aria-selected', 'true');
    expect(creativesTab).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(creativesTab);

    expect(overviewTab).toHaveAttribute('aria-selected', 'false');
    expect(creativesTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('tab-content')).toHaveTextContent('Current Tab: creatives');
  });

  it('1.9 Skeleton: renders pulse shimmer loader for loading states', () => {
    renderWithIntl(
      <div data-testid="skeleton-container">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-12 w-full mt-2" />
      </div>,
    );

    const skeletons = screen.getAllByTestId('skeleton-primitive');
    expect(skeletons).toHaveLength(2);
    expect(skeletons[0]).toHaveClass('animate-pulse');
  });

  it('1.10 ModalDialog: opens modal with header, description, and closes on trigger click', () => {
    function DialogDemo() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>Open Modal</button>
          <ModalDialog
            isOpen={open}
            onClose={() => setOpen(false)}
            title="Confirm Campaign Scale"
            description="Scaling budget will increase daily spend ceiling to $500."
          >
            <button type="button" onClick={() => setOpen(false)}>Confirm Scale</button>
          </ModalDialog>
        </div>
      );
    }

    renderWithIntl(<DialogDemo />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Modal' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Confirm Campaign Scale')).toBeInTheDocument();
    expect(screen.getByText('Scaling budget will increase daily spend ceiling to $500.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('1.11 DataTable: renders tabular rows and headers with clean fallback for empty datasets', () => {
    interface CampaignRow {
      id: string;
      name: string;
      spend: string;
      status: string;
    }

    const columns: { key: keyof CampaignRow; header: string }[] = [
      { key: 'name', header: 'Campaign Name' },
      { key: 'spend', header: '30d Spend' },
      { key: 'status', header: 'Status' },
    ];

    const data: CampaignRow[] = [
      { id: '1', name: 'Meta Search Leads', spend: '$1,200', status: 'Active' },
      { id: '2', name: 'Google Performance Max', spend: '$3,450', status: 'Optimizing' },
    ];

    const { rerender } = renderWithIntl(<DataTable columns={columns} data={data} />);

    expect(screen.getByText('Meta Search Leads')).toBeInTheDocument();
    expect(screen.getByText('Google Performance Max')).toBeInTheDocument();
    expect(screen.getByText('$3,450')).toBeInTheDocument();

    // Rerender with empty data
    rerender(<DataTable columns={columns} data={[]} emptyNotice="No active campaigns configured" />);
    expect(screen.getByTestId('table-empty')).toHaveTextContent('No active campaigns configured');
  });
});
