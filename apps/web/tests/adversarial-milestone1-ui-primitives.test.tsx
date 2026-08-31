import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithIntl } from './e2e/helpers/test-harness';
import { TrendingUp, ArrowRight } from 'lucide-react';

const pushMock = vi.fn();
const replaceMock = vi.fn();
const mockUsePathname = vi.fn(() => '/orgs/org-1/projects/proj-1/campaigns');

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string | object; children: React.ReactNode }) => (
    <a href={typeof href === 'object' ? JSON.stringify(href) : href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
  usePathname: () => mockUsePathname(),
}));

import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  StatCard,
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  TableEmpty,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
  Switch,
  Skeleton,
  StatCardSkeleton,
  TableRowSkeleton,
  ChartSkeleton,
  Textarea,
  Label,
  Input,
  Toaster,
  toast,
  useToast,
} from '@/components/ui';

import {
  Header,
  WorkspaceSwitcher,
  CommandDialog,
  LanguageSwitcher,
  NavShell,
} from '@/components/shell';

describe('Adversarial Stress Test: Milestone 1 UI Primitives & Shell', () => {
  describe('1. StatCard Boundary & Corner Cases', () => {
    it('1.1 handles extreme massive values and empty strings without layout explosion', () => {
      renderWithIntl(
        <div>
          <StatCard
            data-testid="stat-massive"
            title=""
            value="$999,999,999,999.99"
            change="+9999.9%"
            changeType="increase"
            period="All Time"
          />
          <StatCard
            data-testid="stat-empty"
            title="Empty Metric"
            value=""
            change={0}
            changeType="neutral"
          />
        </div>,
      );

      const massive = screen.getByTestId('stat-massive');
      expect(massive).toBeInTheDocument();
      const massiveVal = within(massive).getByText('$999,999,999,999.99');
      expect(massiveVal).toHaveAttribute('dir', 'ltr');

      const empty = screen.getByTestId('stat-empty');
      expect(empty).toBeInTheDocument();
    });

    it('1.2 clamps out-of-bounds progress values (-50%, 150%) safely to [0%, 100%]', () => {
      const { container, rerender } = renderWithIntl(
        <StatCard
          title="Goal Progress"
          value="150%"
          progress={150}
          targetHint="Exceeded"
        />,
      );

      let progressBar = container.querySelector('.bg-emerald-gradient');
      expect(progressBar).toHaveStyle({ width: '100%' });

      rerender(
        <StatCard
          title="Goal Progress"
          value="-50%"
          progress={-50}
          targetHint="Underflow"
        />,
      );
      progressBar = container.querySelector('.bg-emerald-gradient');
      expect(progressBar).toHaveStyle({ width: '0%' });
    });

    it('1.3 accurately infers changeType for numeric and string inputs', () => {
      renderWithIntl(
        <div>
          <StatCard title="Positive" value="100" change={15.5} />
          <StatCard title="Negative" value="50" change={-12.3} />
          <StatCard title="Zero" value="0" change={0} />
          <StatCard title="String Positive" value="200" change="+25.0%" />
          <StatCard title="String Negative" value="30" change="-40.5%" />
          <StatCard title="Non-numeric" value="10" change="N/A" />
        </div>,
      );

      expect(screen.getByText('+25.0%')).toBeInTheDocument();
      expect(screen.getByText('-40.5%')).toBeInTheDocument();
      expect(screen.getByText('N/A')).toBeInTheDocument();
    });

    it('1.4 preserves dir="ltr" isolation across all numbers in RTL context', () => {
      renderWithIntl(
        <StatCard
          title="סך הכל הוצאות"
          value="₪14,500.00"
          change="+12.4%"
          progress={80}
          targetHint="יעד חודשי"
        />,
        { locale: 'he' },
      );

      const val = screen.getByText('₪14,500.00');
      expect(val).toHaveAttribute('dir', 'ltr');

      const changeChip = screen.getByText('+12.4%');
      expect(changeChip).toHaveAttribute('dir', 'ltr');
    });
  });

  describe('2. Switch Primitive Rapid Toggling & Concurrency', () => {
    it('2.1 handles rapid consecutive toggle clicks without state corruption', () => {
      function ControlledSwitchDemo() {
        const [checked, setChecked] = useState(false);
        return (
          <div>
            <Switch
              data-testid="stress-switch"
              checked={checked}
              onCheckedChange={setChecked}
              aria-label="Auto Optimize"
            />
            <span data-testid="switch-status">{checked ? 'ACTIVE' : 'INACTIVE'}</span>
          </div>
        );
      }

      renderWithIntl(<ControlledSwitchDemo />);
      const switchEl = screen.getByTestId('stress-switch');

      expect(screen.getByTestId('switch-status')).toHaveTextContent('INACTIVE');
      expect(switchEl).toHaveAttribute('aria-checked', 'false');

      // Rapid toggle 15 times
      for (let i = 0; i < 15; i++) {
        fireEvent.click(switchEl);
      }

      // Odd number of clicks -> ACTIVE
      expect(screen.getByTestId('switch-status')).toHaveTextContent('ACTIVE');
      expect(switchEl).toHaveAttribute('aria-checked', 'true');
    });

    it('2.2 ignores clicks when disabled and does not invoke callback', () => {
      const onCheckedChange = vi.fn();
      renderWithIntl(
        <Switch
          data-testid="disabled-switch"
          disabled
          defaultChecked={false}
          onCheckedChange={onCheckedChange}
        />,
      );

      const switchEl = screen.getByTestId('disabled-switch');
      expect(switchEl).toBeDisabled();
      fireEvent.click(switchEl);
      expect(onCheckedChange).not.toHaveBeenCalled();
      expect(switchEl).toHaveAttribute('aria-checked', 'false');
    });

    it('2.3 supports both emerald and primary variants', () => {
      const { rerender } = renderWithIntl(
        <Switch data-testid="variant-switch" checked={true} variant="emerald" />,
      );
      expect(screen.getByTestId('variant-switch')).toHaveClass('bg-emerald-600');

      rerender(<Switch data-testid="variant-switch" checked={true} variant="primary" />);
      expect(screen.getByTestId('variant-switch')).toHaveClass('bg-primary');
    });
  });

  describe('3. Button Primitive Loading & Variant Hardening', () => {
    it('3.1 disables click events and displays spinner when isLoading=true', () => {
      const onClick = vi.fn();
      renderWithIntl(
        <Button
          data-testid="loading-btn"
          isLoading={true}
          onClick={onClick}
          leftIcon={<TrendingUp data-testid="left-icon" />}
          rightIcon={<ArrowRight data-testid="right-icon" />}
        >
          Execute Proposal
        </Button>,
      );

      const btn = screen.getByTestId('loading-btn');
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByTestId('button-spinner')).toBeInTheDocument();

      // Icons should be suppressed when loading
      expect(screen.queryByTestId('left-icon')).not.toBeInTheDocument();
      expect(screen.queryByTestId('right-icon')).not.toBeInTheDocument();

      fireEvent.click(btn);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('3.2 renders leftIcon and rightIcon properly when isLoading=false', () => {
      renderWithIntl(
        <Button
          data-testid="icon-btn"
          isLoading={false}
          leftIcon={<TrendingUp data-testid="left-icon" />}
          rightIcon={<ArrowRight data-testid="right-icon" />}
        >
          Active Button
        </Button>,
      );

      expect(screen.getByTestId('left-icon')).toBeInTheDocument();
      expect(screen.getByTestId('right-icon')).toBeInTheDocument();
      expect(screen.queryByTestId('button-spinner')).not.toBeInTheDocument();
    });

    it('3.3 renders all variants cleanly without throwing', () => {
      const variants = [
        'default',
        'brand',
        'destructive',
        'outline',
        'secondary',
        'ghost',
        'link',
        'success',
        'emerald',
        'warning',
      ] as const;

      renderWithIntl(
        <div>
          {variants.map((v) => (
            <Button key={v} variant={v} data-testid={`btn-${v}`}>
              {v}
            </Button>
          ))}
        </div>,
      );

      variants.forEach((v) => {
        expect(screen.getByTestId(`btn-${v}`)).toBeInTheDocument();
      });
    });

    it('3.4 handles asChild composition with custom element', () => {
      renderWithIntl(
        <Button asChild variant="outline">
          <a href="/test-link" data-testid="child-link">
            Link Button
          </a>
        </Button>,
      );

      const link = screen.getByTestId('child-link');
      expect(link).toBeInTheDocument();
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('href', '/test-link');
    });
  });

  describe('4. Dialog & Modal Rapid Cycling & Keyboard Dismiss', () => {
    it('4.1 handles rapid open/close cycles cleanly without orphaned backdrop', () => {
      function RapidDialogDemo() {
        const [open, setOpen] = useState(false);
        return (
          <div>
            <button type="button" data-testid="open-dialog-btn" onClick={() => setOpen(true)}>
              Open
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent data-testid="modal-content">
                <DialogHeader>
                  <DialogTitle>Rapid Cycle Dialog</DialogTitle>
                  <DialogDescription>Testing cycling</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose data-testid="close-dialog-btn">Close</DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        );
      }

      renderWithIntl(<RapidDialogDemo />);

      const openBtn = screen.getByTestId('open-dialog-btn');

      // Cycle 5 times
      for (let i = 0; i < 5; i++) {
        fireEvent.click(openBtn);
        expect(screen.getByTestId('modal-content')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('close-dialog-btn'));
        expect(screen.queryByTestId('modal-content')).not.toBeInTheDocument();
      }
    });

    it('4.2 dismisses dialog on Escape key and on backdrop click', () => {
      function DialogEscDemo() {
        const [open, setOpen] = useState(false);
        return (
          <div>
            <button type="button" data-testid="open-btn" onClick={() => setOpen(true)}>
              Open
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent data-testid="dialog-box">
                <DialogTitle>Escape Test</DialogTitle>
              </DialogContent>
            </Dialog>
          </div>
        );
      }

      renderWithIntl(<DialogEscDemo />);
      fireEvent.click(screen.getByTestId('open-btn'));
      expect(screen.getByTestId('dialog-box')).toBeInTheDocument();

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      expect(screen.queryByTestId('dialog-box')).not.toBeInTheDocument();

      // Open again and click backdrop
      fireEvent.click(screen.getByTestId('open-btn'));
      expect(screen.getByTestId('dialog-box')).toBeInTheDocument();

      const backdrop = screen.getByRole('presentation');
      fireEvent.click(backdrop);
      expect(screen.queryByTestId('dialog-box')).not.toBeInTheDocument();
    });

    it('4.3 does not close dialog when clicking inside modal content', () => {
      function DialogStopPropDemo() {
        const [open, setOpen] = useState(true);
        return (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent data-testid="dialog-box">
              <button type="button" data-testid="inner-action">
                Inner Action
              </button>
            </DialogContent>
          </Dialog>
        );
      }

      renderWithIntl(<DialogStopPropDemo />);
      expect(screen.getByTestId('dialog-box')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('inner-action'));
      // Dialog should still be open
      expect(screen.getByTestId('dialog-box')).toBeInTheDocument();
    });
  });

  describe('5. Badge Variants & Status Indicators', () => {
    it('5.1 renders all 12 badge variants correctly', () => {
      const variants = [
        'default',
        'secondary',
        'success',
        'emerald',
        'warning',
        'amber',
        'destructive',
        'alert',
        'rose',
        'info',
        'purple',
        'outline',
      ] as const;

      renderWithIntl(
        <div>
          {variants.map((v) => (
            <Badge key={v} variant={v} data-testid={`badge-${v}`}>
              {v}
            </Badge>
          ))}
        </div>,
      );

      variants.forEach((v) => {
        expect(screen.getByTestId(`badge-${v}`)).toBeInTheDocument();
      });
    });

    it('5.2 renders animated status dots and trend icons', () => {
      renderWithIntl(
        <div>
          <Badge data-testid="badge-dot" dot>
            Live Feed
          </Badge>
          <Badge data-testid="badge-up" trend="up">
            +14.2%
          </Badge>
          <Badge data-testid="badge-down" trend="down">
            -5.8%
          </Badge>
          <Badge data-testid="badge-neutral" trend="neutral">
            0.0%
          </Badge>
        </div>,
      );

      expect(screen.getByTestId('badge-dot')).toBeInTheDocument();
      expect(screen.getByTestId('badge-up')).toBeInTheDocument();
      expect(screen.getByTestId('badge-down')).toBeInTheDocument();
      expect(screen.getByTestId('badge-neutral')).toBeInTheDocument();
    });
  });

  describe('6. Tabs & Segmented Pill Navigation', () => {
    it('6.1 switches active tab and updates tabpanel visibility', () => {
      renderWithIntl(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1" data-testid="trigger-1">
              Tab 1
            </TabsTrigger>
            <TabsTrigger value="tab2" data-testid="trigger-2" count={3}>
              Tab 2
            </TabsTrigger>
          </TabsList>
          <TabsContent value="tab1" data-testid="content-1">
            Content 1
          </TabsContent>
          <TabsContent value="tab2" data-testid="content-2">
            Content 2
          </TabsContent>
        </Tabs>,
      );

      expect(screen.getByTestId('content-1')).toBeInTheDocument();
      expect(screen.queryByTestId('content-2')).not.toBeInTheDocument();
      expect(screen.getByTestId('trigger-1')).toHaveAttribute('aria-selected', 'true');

      fireEvent.click(screen.getByTestId('trigger-2'));

      expect(screen.queryByTestId('content-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('content-2')).toBeInTheDocument();
      expect(screen.getByTestId('trigger-2')).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('7. Select Custom Dropdown Stress & Outside Click', () => {
    it('7.1 opens dropdown, selects item, updates trigger value, and closes listbox', () => {
      function SelectDemo() {
        const [val, setVal] = useState('usd');
        return (
          <Select value={val} onValueChange={setVal}>
            <SelectTrigger data-testid="select-trigger">
              <SelectValue />
            </SelectTrigger>
            <SelectContent data-testid="select-content">
              <SelectItem value="usd">USD ($)</SelectItem>
              <SelectItem value="eur">EUR (€)</SelectItem>
              <SelectItem value="ils">ILS (₪)</SelectItem>
            </SelectContent>
          </Select>
        );
      }

      renderWithIntl(<SelectDemo />);

      const trigger = screen.getByTestId('select-trigger');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');

      // Click trigger to open
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      // Select EUR
      const eurOption = screen.getByText('EUR (€)');
      fireEvent.click(eurOption);

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(within(trigger).getByText('EUR (€)')).toBeInTheDocument();
    });

    it('7.2 dismisses select dropdown on Escape key', () => {
      renderWithIntl(
        <Select defaultValue="meta">
          <SelectTrigger data-testid="select-trig">
            <SelectValue />
          </SelectTrigger>
          <SelectContent data-testid="select-list">
            <SelectItem value="meta">Meta Ads</SelectItem>
            <SelectItem value="google">Google Ads</SelectItem>
          </SelectContent>
        </Select>,
      );

      const trigger = screen.getByTestId('select-trig');
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('8. Toast & Toaster System Stress', () => {
    it('8.1 manages burst toast queues and respects maximum toast limit', () => {
      function ToastTriggerContainer() {
        const { toast } = useToast();
        return (
          <div>
            <button
              type="button"
              data-testid="burst-toast-btn"
              onClick={() => {
                for (let i = 1; i <= 10; i++) {
                  toast({
                    title: `Toast Alert ${i}`,
                    description: `Description ${i}`,
                    variant: i % 2 === 0 ? 'success' : 'destructive',
                  });
                }
              }}
            >
              Burst
            </button>
            <Toaster />
          </div>
        );
      }

      renderWithIntl(<ToastTriggerContainer />);

      fireEvent.click(screen.getByTestId('burst-toast-btn'));

      // Max toast limit is 5, latest toasts should be visible
      expect(screen.getByText('Toast Alert 10')).toBeInTheDocument();
      expect(screen.getByText('Toast Alert 9')).toBeInTheDocument();
      expect(screen.getByText('Toast Alert 8')).toBeInTheDocument();
      expect(screen.getByText('Toast Alert 7')).toBeInTheDocument();
      expect(screen.getByText('Toast Alert 6')).toBeInTheDocument();

      // Older toasts above limit of 5 should have been pruned
      expect(screen.queryByText('Toast Alert 1')).not.toBeInTheDocument();
    });
  });

  describe('9. Table & Skeleton Loaders Hardening', () => {
    it('9.1 renders TableEmpty when data is empty with customized colspan', () => {
      renderWithIntl(
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableEmpty colSpan={3} message="No campaigns found for this filter" />
          </TableBody>
        </Table>,
      );

      const emptyCell = screen.getByText('No campaigns found for this filter');
      expect(emptyCell).toBeInTheDocument();
      expect(emptyCell).toHaveAttribute('colspan', '3');
    });

    it('9.2 renders composite skeletons (StatCardSkeleton, TableRowSkeleton, ChartSkeleton)', () => {
      renderWithIntl(
        <div>
          <StatCardSkeleton />
          <table>
            <tbody>
              <TableRowSkeleton columns={5} />
            </tbody>
          </table>
          <ChartSkeleton height={300} />
        </div>,
      );

      expect(screen.getByTestId('stat-card-skeleton')).toBeInTheDocument();
      expect(screen.getByTestId('table-row-skeleton')).toBeInTheDocument();
      expect(screen.getByTestId('chart-skeleton')).toBeInTheDocument();
    });
  });

  describe('10. App Shell & CommandDialog Navigation Stress Tests', () => {
    it('10.1 CommandDialog searches, filters items, updates preview pane, and handles empty results', () => {
      renderWithIntl(
        <div>
          <CommandDialog />
        </div>,
      );

      // Open command dialog
      const openBtn = screen.getByRole('button', { name: /open command search/i });
      fireEvent.click(openBtn);

      const searchInput = screen.getByPlaceholderText(/type a command/i);
      expect(searchInput).toBeInTheDocument();

      // Search for specific campaign cockpit keyword
      fireEvent.change(searchInput, { target: { value: 'Cockpit' } });
      const cockpitMatches = screen.getAllByText('Ads & Performance Cockpit');
      expect(cockpitMatches.length).toBeGreaterThan(0);
      expect(screen.getByText('/campaigns')).toBeInTheDocument();

      // Search for non-existent item
      fireEvent.change(searchInput, { target: { value: 'NonExistentFeatureXYZ' } });
      expect(screen.getByText(/no matching commands found/i)).toBeInTheDocument();
    });

    it('10.2 CommandDialog supports keyboard arrow navigation and Escape dismissal', () => {
      renderWithIntl(
        <div>
          <CommandDialog />
        </div>,
      );

      const openBtn = screen.getByRole('button', { name: /open command search/i });
      fireEvent.click(openBtn);

      const searchInput = screen.getByPlaceholderText(/type a command/i);

      // Press ArrowDown
      fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
      // Press ArrowUp
      fireEvent.keyDown(searchInput, { key: 'ArrowUp' });

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByPlaceholderText(/type a command/i)).not.toBeInTheDocument();
    });

    it('10.3 Header renders brand, workspace switcher, and responsive elements', () => {
      const onToggle = vi.fn();
      renderWithIntl(
        <Header
          brandName="GrowthOS Pro"
          organizations={[{ id: 'org-1', name: 'Acme Corp' }]}
          currentOrgId="org-1"
          projects={[{ id: 'proj-1', name: 'Main Brand', env: 'dev' }]}
          currentProjectId="proj-1"
          userEmail="alex@acme.com"
          onMobileMenuToggle={onToggle}
          isMobileMenuOpen={false}
        />,
      );

      expect(screen.getByText('GrowthOS Pro')).toBeInTheDocument();
      expect(screen.getByText('alex@acme.com')).toBeInTheDocument();

      const mobileToggle = screen.getByRole('button', { name: 'Open navigation' });
      fireEvent.click(mobileToggle);
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });
});
