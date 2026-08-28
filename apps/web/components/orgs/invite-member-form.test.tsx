import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { InviteMemberForm } from './invite-member-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const PROJECTS = [
  { id: 'proj-1', name: 'Website' },
  { id: 'proj-2', name: 'Mobile App' },
];

function renderForm(administeredProjects: typeof PROJECTS = []): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <InviteMemberForm orgId="org-1" administeredProjects={administeredProjects} />
    </NextIntlClientProvider>,
  );
}

describe('InviteMemberForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('submits the email and selected role, then refreshes the member list', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ membershipId: 'm1' }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'friend@example.com' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'org_admin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/invites',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'friend@example.com', role: 'org_admin' }),
      }),
    );
  });

  it('shows an inline error when the invite fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'friend@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't send that invite. They may already be a member.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows a project picker (defaulted to the first administered project) once a project-scoped role is selected, and includes projectId in the submitted body (KAN-135)', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ membershipId: 'm1' }) } as Response);
    renderForm(PROJECTS);

    expect(screen.queryByLabelText('Project')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'friend@example.com' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'project_admin' } });

    expect(screen.getByLabelText('Project')).toHaveValue('proj-1');
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'proj-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/invites',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'friend@example.com', role: 'project_admin', projectId: 'proj-2' }),
      }),
    );
  });

  it('disables submission and explains the gap when a project-scoped role is picked but the inviter administers no projects', () => {
    renderForm([]);

    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'editor' } });

    expect(screen.queryByLabelText('Project')).not.toBeInTheDocument();
    expect(screen.getByText("You don't administer any projects to invite this role to.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite' })).toBeDisabled();
  });

  it('drops projectId again when switching back to an org-scoped role', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ membershipId: 'm1' }) } as Response);
    renderForm(PROJECTS);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'friend@example.com' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'operator' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'viewer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/invites',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'friend@example.com', role: 'viewer' }),
      }),
    );
  });
});
