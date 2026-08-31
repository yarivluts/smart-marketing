import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { CampaignStatusToggle } from './campaign-status-toggle';

const mockRefresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

describe('CampaignStatusToggle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockRefresh.mockReset();
  });

  it('renders active status with checked switch', () => {
    renderWithIntl(
      <CampaignStatusToggle
        orgId="org-1"
        projectId="proj-1"
        targetId="target-1"
        campaignLabel="Summer Sale"
        initialStatus="enabled"
      />,
    );

    const switchBtn = screen.getByRole('switch');
    expect(switchBtn).toBeInTheDocument();
    expect(switchBtn).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders paused status with unchecked switch', () => {
    renderWithIntl(
      <CampaignStatusToggle
        orgId="org-1"
        projectId="proj-1"
        targetId="target-1"
        campaignLabel="Summer Sale"
        initialStatus="paused"
      />,
    );

    const switchBtn = screen.getByRole('switch');
    expect(switchBtn).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  it('toggles status optimistically and calls quick-execute API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'action-1', status: 'executed', targetId: 'target-1' }),
    });
    global.fetch = fetchMock;
    const onStatusChange = vi.fn();

    renderWithIntl(
      <CampaignStatusToggle
        orgId="org-1"
        projectId="proj-1"
        targetId="target-1"
        campaignLabel="Summer Sale"
        initialStatus="enabled"
        onStatusChange={onStatusChange}
      />,
    );

    const switchBtn = screen.getByRole('switch');
    fireEvent.click(switchBtn);

    expect(onStatusChange).toHaveBeenCalledWith('paused');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/proj-1/automation/actions/quick-execute',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          targetId: 'target-1',
          actionType: 'campaign_pause',
        }),
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('undo-toast')).toBeInTheDocument();
    });
  });

  it('rolls back status on network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    global.fetch = fetchMock;
    const onStatusChange = vi.fn();

    renderWithIntl(
      <CampaignStatusToggle
        orgId="org-1"
        projectId="proj-1"
        targetId="target-1"
        campaignLabel="Summer Sale"
        initialStatus="enabled"
        onStatusChange={onStatusChange}
      />,
    );

    const switchBtn = screen.getByRole('switch');
    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(switchBtn).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
