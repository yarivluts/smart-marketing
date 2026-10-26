import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CreateProjectForm } from './create-project-form';
import messages from '../../messages/en.json';

const push = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreateProjectForm orgId="org-1" />
    </NextIntlClientProvider>,
  );
}

describe('CreateProjectForm', () => {
  beforeEach(() => {
    push.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('creates the project and navigates to it', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ projectId: 'proj-123' }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Growth' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/orgs/org-1/projects/proj-123'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Growth' }) }),
    );
  });

  it('shows an inline error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Growth' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not create it. Nothing was saved, so please try again in a moment.');
    expect(push).not.toHaveBeenCalled();
  });

  it('says the connection dropped, and that nothing was saved, when the request cannot be sent', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    renderForm();

    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Growth' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('We cannot reach GrowthOS. Check your internet connection');
    expect(screen.getByRole('button', { name: 'Create project' })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it('asks for a name instead of sending an empty request', () => {
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Please type a name for your project.');
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an example hint and sends a trimmed name', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ projectId: 'p1' }) } as Response);
    renderForm();

    expect(screen.getByText(/Your business or website name is perfect/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: '  Bakery ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects', expect.objectContaining({ body: JSON.stringify({ name: 'Bakery' }) }));
  });
});
