import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { CampaignDailyBudgetControl } from './campaign-daily-budget-control';

const mockRefresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

describe('CampaignDailyBudgetControl', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockRefresh.mockReset();
  });

  it('renders initial budget amount and preset buttons', () => {
    renderWithIntl(
      <CampaignDailyBudgetControl
        orgId="org-1"
        projectId="proj-1"
        targetId="target-1"
        campaignLabel="Summer Sale"
        initialDailyBudgetUsd={100}
      />,
    );

    expect(screen.getByText('$100/day')).toBeInTheDocument();
    expect(screen.getByText('+10%')).toBeInTheDocument();
    expect(screen.getByText('+20%')).toBeInTheDocument();
    expect(screen.getByText('-20%')).toBeInTheDocument();
    expect(screen.getByTestId('budget-plus-target-1')).toBeInTheDocument();
    expect(screen.getByTestId('budget-minus-target-1')).toBeInTheDocument();
  });

  it('steps budget up and down with +/- buttons', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'act-1', status: 'executed' }),
    });
    global.fetch = fetchMock;
    const onBudgetChange = vi.fn();

    renderWithIntl(
      <CampaignDailyBudgetControl
        orgId="org-1"
        projectId="proj-1"
        targetId="target-1"
        campaignLabel="Summer Sale"
        initialDailyBudgetUsd={100}
        onBudgetChange={onBudgetChange}
      />,
    );

    // Step up +25
    fireEvent.click(screen.getByTestId('budget-plus-target-1'));
    expect(onBudgetChange).toHaveBeenCalledWith(125);

    await waitFor(() => {
      expect(screen.getByText('$125/day')).toBeInTheDocument();
    });

    // Step down -25
    fireEvent.click(screen.getByTestId('budget-minus-target-1'));
    expect(onBudgetChange).toHaveBeenCalledWith(100);

    await waitFor(() => {
      expect(screen.getByText('$100/day')).toBeInTheDocument();
    });
  });

  it('clicking +20% preset button immediately updates budget and calls quick-execute', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'action-1', status: 'executed', targetId: 'target-1' }),
    });
    global.fetch = fetchMock;

    renderWithIntl(
      <CampaignDailyBudgetControl
        orgId="org-1"
        projectId="proj-1"
        targetId="target-1"
        campaignLabel="Summer Sale"
        initialDailyBudgetUsd={100}
      />,
    );

    fireEvent.click(screen.getByText('+20%'));

    expect(screen.getByText('$120/day')).toBeInTheDocument();
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

    renderWithIntl(
      <CampaignDailyBudgetControl
        orgId="org-1"
        projectId="proj-1"
        targetId="target-1"
        campaignLabel="Summer Sale"
        initialDailyBudgetUsd={100}
      />,
    );

    // Open editor
    fireEvent.click(screen.getByText('$100/day'));

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

    renderWithIntl(
      <CampaignDailyBudgetControl
        orgId="org-1"
        projectId="proj-1"
        targetId="target-1"
        campaignLabel="Summer Sale"
        initialDailyBudgetUsd={100}
      />,
    );

    fireEvent.click(screen.getByText('+20%'));

    await waitFor(() => {
      expect(screen.getByText('$100/day')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Action blocked: Exceeds project daily budget ceiling',
      );
    });
  });
});
