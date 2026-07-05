import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { RequestAttachmentForm } from './request-attachment-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

describe('RequestAttachmentForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('for a credential, parses the comma-separated scope input and submits it', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ attachmentId: 'a1' }) } as Response);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <RequestAttachmentForm
          orgId="org-1"
          projectId="project-1"
          resourceKind="credential"
          resourceId="cred-1"
          availableScopes={['act_1', 'act_2']}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.change(screen.getByLabelText('Scopes to request (comma-separated)'), { target: { value: 'act_1, act_2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/resource-attachments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ resourceKind: 'credential', resourceId: 'cred-1', scopeSelection: ['act_1', 'act_2'] }),
      }),
    );
  });

  it('for a person, submits with no scope selection field and no scope input rendered', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ attachmentId: 'a2' }) } as Response);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <RequestAttachmentForm orgId="org-1" projectId="project-1" resourceKind="person" resourceId="person-1" />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByLabelText('Scopes to request (comma-separated)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Request' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/resource-attachments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ resourceKind: 'person', resourceId: 'person-1', scopeSelection: undefined }),
      }),
    );
  });

  it('shows an inline error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <RequestAttachmentForm orgId="org-1" projectId="project-1" resourceKind="template" resourceId="template-1" />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Request' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't send that request. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
