import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { ProjectSettingsForm } from './project-settings-form';
import { OrganizationSettingsForm } from './organization-settings-form';
import { DangerZoneCard } from './danger-zone-card';
import { NotificationSettingsCard } from './notification-settings-card';
import enMessages from '@/messages/en.json';

const mockRouterRefresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: mockRouterRefresh,
  }),
}));

describe('Operations & Settings Components (Milestone 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders ProjectSettingsForm, validates empty name, and saves changes', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    global.fetch = mockFetch;

    renderWithIntl(
      <ProjectSettingsForm
        orgId="org-1"
        projectId="proj-1"
        initialName="EasySign SaaS"
        initialVertical="LegalTech"
      />,
    );

    const nameInput = screen.getByLabelText(enMessages.ProjectSettings.nameLabel);
    const verticalInput = screen.getByLabelText(enMessages.ProjectSettings.verticalLabel);

    expect(nameInput).toHaveValue('EasySign SaaS');
    expect(verticalInput).toHaveValue('LegalTech');

    // Test empty validation
    fireEvent.change(nameInput, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: enMessages.ProjectSettings.save }));

    expect(screen.getByRole('alert')).toHaveTextContent(enMessages.ProjectSettings.nameRequiredError);
    expect(mockFetch).not.toHaveBeenCalled();

    // Test valid save
    fireEvent.change(nameInput, { target: { value: 'EasySign Enterprise' } });
    fireEvent.click(screen.getByRole('button', { name: enMessages.ProjectSettings.save }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/proj-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            name: 'EasySign Enterprise',
            vertical: 'LegalTech',
          }),
        }),
      );
      expect(screen.getByTestId('project-settings-saved-banner')).toBeInTheDocument();
      expect(mockRouterRefresh).toHaveBeenCalled();
    });
  });

  it('renders OrganizationSettingsForm and submits PATCH updates', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    global.fetch = mockFetch;

    renderWithIntl(
      <OrganizationSettingsForm
        orgId="org-1"
        initialName="Acme Corp"
        initialSlug="acme"
        initialBillingEmail="billing@acme.com"
      />,
    );

    expect(screen.getByTestId('org-name-input')).toHaveValue('Acme Corp');
    expect(screen.getByTestId('org-slug-input')).toHaveValue('acme');
    expect(screen.getByTestId('org-billing-email-input')).toHaveValue('billing@acme.com');

    fireEvent.change(screen.getByTestId('org-name-input'), { target: { value: 'Acme Global' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/orgs/org-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'Acme Global', slug: 'acme', billing_email: 'billing@acme.com' }),
        }),
      );
    });
  });

  it('handles DangerZoneCard confirmation modal logic', () => {
    const handleArchive = vi.fn();
    renderWithIntl(<DangerZoneCard projectName="MyProject" onArchive={handleArchive} />);

    fireEvent.click(screen.getByTestId('archive-project-trigger'));
    expect(screen.getByText('Confirm Archiving')).toBeInTheDocument();

    const input = screen.getByTestId('danger-confirm-input');
    const submitBtn = screen.getByTestId('danger-confirm-submit-btn');

    expect(submitBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: 'MyProject' } });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);
    expect(handleArchive).toHaveBeenCalledTimes(1);
  });

  it('renders NotificationSettingsCard and handles toggle switches', () => {
    const handleSave = vi.fn();
    renderWithIntl(<NotificationSettingsCard onSave={handleSave} />);

    expect(screen.getByTestId('notification-settings-card')).toBeInTheDocument();
    expect(screen.getByText('Budget Guardrail Alerts')).toBeInTheDocument();
  });
});
