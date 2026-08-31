import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CampaignStatusToggle } from './campaign-status-toggle';
import messages from '../../messages/en.json';

const mockRefresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

function renderToggle(props: Partial<Parameters<typeof CampaignStatusToggle>[0]> = {}) {
  const defaultProps = {
    orgId: 'org-1',
    projectId: 'proj-1',
    targetId: 'target-1',
    campaignLabel: 'Summer Sale',
    initialStatus: 'enabled' as const,
    ...props,
  };

  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CampaignStatusToggle {...defaultProps} />
    </NextIntlClientProvider>,
  );
}

describe('CampaignStatusToggle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockRefresh.mockReset();
  });

  it('renders with initial active status', () => {
    renderToggle({ initialStatus: 'enabled' });
    const button = screen.getByRole('switch');
    expect(button).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders with initial paused status', () => {
    renderToggle({ initialStatus: 'paused' });
    const button = screen.getByRole('switch');
    expect(button).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  it('optimistically toggles from active to paused on click and calls quick-execute', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'action-123', status: 'executed', targetId: 'target-1' }),
    });
    global.fetch = fetchMock;

    renderToggle({ initialStatus: 'enabled' });
    const button = screen.getByRole('switch');

    fireEvent.click(button);

    // Optimistic toggle
    expect(button).toHaveAttribute('aria-checked', 'false');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/proj-1/automation/actions/quick-execute',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ targetId: 'target-1', actionType: 'campaign_pause' }),
      }),
    );

    // Undo toast appears
    await waitFor(() => {
      expect(screen.getByTestId('undo-toast')).toBeInTheDocument();
      expect(screen.getByText('Undo')).toBeInTheDocument();
    });
  });

  it('rolls back to original status if API returns guardrail violation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: 'guardrail_blocked',
        violations: [{ message: 'Cannot pause protected campaign' }],
      }),
    });
    global.fetch = fetchMock;

    renderToggle({ initialStatus: 'enabled' });
    const button = screen.getByRole('switch');

    fireEvent.click(button);

    await waitFor(() => {
      // Reverted to original
      expect(button).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('alert')).toHaveTextContent('Action blocked: Cannot pause protected campaign');
    });
  });

  it('clicking Undo rolls back the status', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'action-123', status: 'executed', targetId: 'target-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'action-123', status: 'rolled_back' }),
      });
    global.fetch = fetchMock;

    renderToggle({ initialStatus: 'paused' });
    const switchBtn = screen.getByRole('switch');

    // Click toggle to enable
    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(screen.getByTestId('undo-toast')).toBeInTheDocument();
    });

    // Click Undo
    const undoBtn = screen.getByText('Undo');
    fireEvent.click(undoBtn);

    await waitFor(() => {
      expect(switchBtn).toHaveAttribute('aria-checked', 'false');
    });
  });

  it('disables the switch when disabled prop is true', () => {
    renderToggle({ disabled: true });
    expect(screen.getByRole('switch')).toBeDisabled();
  });
});
