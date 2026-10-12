import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { BrandKitPanel } from './brand-kit-panel';

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const EMPTY = { brandName: '', toneOfVoice: '', avoidWords: [], colors: [] };

afterEach(() => vi.unstubAllGlobals());

describe('BrandKitPanel', () => {
  it('lets a project admin set the name, a word to avoid and a colour, and saves them', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify({ brandKit: JSON.parse(String(init?.body)).brandKit }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(<BrandKitPanel orgId="o" projectId="p" initial={EMPTY} canEdit />, { locale: 'en' });
    const save = screen.getByRole('button', { name: 'Save brand kit' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^Brand name/), { target: { value: 'EasySign' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Words and phrases never to use' }), { target: { value: 'cheap' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a colour' }));
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Brand kit saved.'));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/orgs/o/projects/p/ad-studio/brand-kit');
    expect(JSON.parse(String(init.body)).brandKit).toEqual({ brandName: 'EasySign', toneOfVoice: '', avoidWords: ['cheap'], colors: ['#5b4fe9'] });
  });

  it('shows the kit read-only to someone who cannot change it', () => {
    renderWithIntl(<BrandKitPanel orgId="o" projectId="p" initial={{ ...EMPTY, brandName: 'EasySign', avoidWords: ['cheap'] }} canEdit={false} />, { locale: 'en' });
    expect(screen.getByLabelText(/^Brand name/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save brand kit' })).toBeNull();
    expect(screen.getByText('Only project admins can change the brand kit.')).toBeInTheDocument();
  });
});
