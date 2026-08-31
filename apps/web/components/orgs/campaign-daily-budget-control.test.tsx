import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CampaignDailyBudgetControl } from './campaign-daily-budget-control';
import messages from '../../messages/en.json';

const mockRefresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

// The budget amount and "/day" suffix render as two separate <span> elements
// (bidi-safe number isolation), so their accessible name joins them with a
// space ("$100 /day") and their combined text is split across nodes. Neither
// `getByText('$100/day')` nor an exact-string `name` match can find it —
// match loosely instead of coupling the test to the (non-)whitespace between
// them.
function BUDGET_AMOUNT_NAME_RE(amount: number): RegExp {
  return new RegExp(`^\\$${amount}\\s*/day$`);
}

function renderBudgetControl(props: Partial<Parameters<typeof CampaignDailyBudgetControl>[0]> = {}) {
  const defaultProps = {
    orgId: 'org-1',
    projectId: 'proj-1',
    targetId: 'target-1',
    campaignLabel: 'Summer Sale',
    initialDailyBudgetUsd: 100,
    ...props,
  };

  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CampaignDailyBudgetControl {...defaultProps} />
    </NextIntlClientProvider>,
  );
}

describe('CampaignDailyBudgetControl', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockRefresh.mockReset();
  });

  it('renders initial budget amount and preset buttons', () => {
    renderBudgetControl({ initialDailyBudgetUsd: 100 });
    expect(screen.getByRole('button', { name: BUDGET_AMOUNT_NAME_RE(100) })).toBeInTheDocument();
    expect(screen.getByText('+10%')).toBeInTheDocument();
    expect(screen.getByText('+20%')).toBeInTheDocument();
    expect(screen.getByText('-20%')).toBeInTheDocument();
  });

  it('clicking +20% preset button immediately updates budget and calls quick-execute', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'action-1', status: 'executed', targetId: 'target-1' }),
    });
    global.fetch = fetchMock;

    renderBudgetControl({ initialDailyBudgetUsd: 100 });

    fireEvent.click(screen.getByText('+20%'));

    expect(screen.getByRole('button', { name: BUDGET_AMOUNT_NAME_RE(120) })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/proj-1/automation/actions/quick-execute',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          targetId: 'target-1',
          actionType: 'budget_change',
          afterDailyBudgetUsd: 120,
        }),
      }),
    );
  });

  it('clicking budget amount opens inline input and commits on Enter', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'action-2', status: 'executed', targetId: 'target-1' }),
    });
    global.fetch = fetchMock;

    renderBudgetControl({ initialDailyBudgetUsd: 100 });

    // Open editor
    fireEvent.click(screen.getByRole('button', { name: BUDGET_AMOUNT_NAME_RE(100) }));

    const input = screen.getByRole('spinbutton');
    expect(input).toHaveValue(100);

    // Edit value to 150
    fireEvent.change(input, { target: { value: '150' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/proj-1/automation/actions/quick-execute',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          targetId: 'target-1',
          actionType: 'budget_change',
          afterDailyBudgetUsd: 150,
        }),
      }),
    );
  });

  it('reverts budget on guardrail rejection', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: 'guardrail_blocked',
        violations: [{ message: 'Exceeds project daily budget ceiling' }],
      }),
    });
    global.fetch = fetchMock;

    renderBudgetControl({ initialDailyBudgetUsd: 100 });

    fireEvent.click(screen.getByText('+20%'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: BUDGET_AMOUNT_NAME_RE(100) })).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Action blocked: Exceeds project daily budget ceiling',
      );
    });
  });

  it('disables interactions when disabled prop is true', () => {
    renderBudgetControl({ disabled: true });
    expect(screen.getByRole('button', { name: BUDGET_AMOUNT_NAME_RE(100) })).toBeDisabled();
    expect(screen.queryByText('+10%')).not.toBeInTheDocument();
  });
});
