import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { EditTemplateForm } from './edit-template-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(initialConfig?: Record<string, unknown>): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EditTemplateForm orgId="org-1" templateId="template-1" initialName="Standard SaaS Funnel" initialConfig={initialConfig} />
    </NextIntlClientProvider>,
  );
}

describe('EditTemplateForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('starts collapsed as an Edit button, not exposing the form fields', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('reveals the fields pre-filled with the current name and no config text when config is unset', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name')).toHaveValue('Standard SaaS Funnel');
    expect(screen.getByLabelText('Config (JSON)')).toHaveValue('');
  });

  it('pre-fills the config textarea with pretty-printed JSON when a config is already set', () => {
    renderForm({ steps: ['signup', 'activation'] });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Config (JSON)')).toHaveValue(JSON.stringify({ steps: ['signup', 'activation'] }, null, 2));
  });

  it('submits the edited name and parsed config via PATCH, then collapses back and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ template: { id: 'template-1' } }) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Standard SaaS Funnel v2' } });
    fireEvent.change(screen.getByLabelText('Config (JSON)'), { target: { value: '{"steps": ["signup", "activation", "conversion"]}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/resources/templates/template-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Standard SaaS Funnel v2', config: { steps: ['signup', 'activation', 'conversion'] } }),
      }),
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('submits config: undefined when the config textarea is left blank', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ template: { id: 'template-1' } }) } as Response);
    renderForm({ steps: ['signup'] });

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Config (JSON)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/resources/templates/template-1',
      expect.objectContaining({ body: JSON.stringify({ name: 'Standard SaaS Funnel', config: undefined }) }),
    );
  });

  it('shows an inline error and never calls fetch for malformed config JSON', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Config (JSON)'), { target: { value: '{not valid json' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Config must be valid JSON (an object).');
    expect(fetch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows an inline error for config JSON that parses to an array, not an object', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Config (JSON)'), { target: { value: '[1, 2, 3]' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Config must be valid JSON (an object).');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cancels back to the Edit button without submitting', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Discard Me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline error and stays open when saving fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save these changes. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });
});
