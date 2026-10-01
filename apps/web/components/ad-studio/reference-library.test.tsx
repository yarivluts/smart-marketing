import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import type { AdStudioScene } from '@growthos/shared';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import heMessages from '@/messages/he.json';
import type { AdStudioReferenceView } from '@/lib/ad-studio/engine';
import { ReferenceLibrary } from './reference-library';
import { ScriptEditor } from './script-editor';

const refresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

function reference(overrides: Partial<AdStudioReferenceView> = {}): AdStudioReferenceView {
  return {
    id: 'r1',
    source: 'upload',
    label: 'Dashboard',
    description: 'The ad studio dashboard',
    status: 'ready',
    sourceUrl: null,
    prompt: null,
    mimeType: 'image/png',
    byteSize: 1200,
    failureCode: null,
    createdOn: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

const BASE = '/api/orgs/o/projects/p/ad-studio/briefs/b1/references';

describe('ReferenceLibrary', () => {
  it('shows each image, and offers capture and illustration only when they are set up', () => {
    renderWithIntl(<ReferenceLibrary orgId="o" projectId="p" briefId="b1" initialReferences={[reference()]} captureAvailable={false} illustrationAvailable />, { locale: 'en' });
    const card = within(screen.getByTestId('ad-studio-reference'));
    expect(card.getByRole('img', { name: 'Dashboard' })).toHaveAttribute('src', `${BASE}/r1/media`);
    expect(card.getByText('Uploaded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Capture a page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Draw an illustration' })).toBeEnabled();
  });

  it('draws an illustration and adds it; a refused upload says why', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      typeof init?.body === 'string' ? json({ reference: reference({ id: 'r2', source: 'illustration', label: 'Signed' }) }, 201) : json({ error: 'reference_request', code: 'unsupported_image' }, 400),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(<ReferenceLibrary orgId="o" projectId="p" briefId="b1" initialReferences={[]} captureAvailable illustrationAvailable />, { locale: 'en' });
    expect(screen.getByText(/No images yet/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Draw an illustration' }));
    const form = within(screen.getByTestId('ad-studio-reference-form'));
    fireEvent.change(form.getByLabelText('What should the illustration show?'), { target: { value: 'A signed contract' } });
    fireEvent.change(form.getByLabelText('Name'), { target: { value: 'Signed' } });
    fireEvent.click(form.getByRole('button', { name: 'Draw' }));
    await waitFor(() => expect(screen.getByText('AI illustration')).toBeInTheDocument());
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({
      source: 'illustration',
      prompt: 'A signed contract',
      aspectRatio: '16:9',
      label: 'Signed',
      description: '',
    });
    expect(refresh).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Upload a screenshot' }));
    const upload = within(screen.getByTestId('ad-studio-reference-form'));
    fireEvent.change(upload.getByLabelText(/Image file/), { target: { files: [new File(['GIF89a'], 'a.gif', { type: 'image/gif' })] } });
    fireEvent.change(upload.getByLabelText('Name'), { target: { value: 'Animated' } });
    fireEvent.click(upload.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only PNG and JPEG images can be used.');
  });

  it('asks before deleting an image, then removes it', async () => {
    const fetchMock = vi.fn(async () => json({ deleted: 'r1' }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(<ReferenceLibrary orgId="o" projectId="p" briefId="b1" initialReferences={[reference()]} captureAvailable illustrationAvailable />, { locale: 'he' });
    const card = within(screen.getByTestId('ad-studio-reference'));
    fireEvent.click(card.getByRole('button', { name: heMessages.AdStudio.references.delete }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(card.getByRole('button', { name: heMessages.AdStudio.references.confirmDelete }));
    await waitFor(() => expect(screen.queryByTestId('ad-studio-reference')).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/r1`, { method: 'DELETE' });
  });
});

describe('ScriptEditor scene images', () => {
  const SCENE: AdStudioScene = { id: 'a', durationSeconds: 5, visualPrompt: 'A marketer looks at a laptop', voiceover: '', onScreenText: '' };

  it('attaches a ready image to a scene as its screen, changes how it is used, and saves it with the script', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => json({ brief: { scenes: JSON.parse(String(init?.body)).scenes } }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(
      <ScriptEditor orgId="o" projectId="p" briefId="b1" initialScenes={[SCENE]} generatedByModel={null} aiAvailable references={[reference(), reference({ id: 'r2', label: 'Drawing', status: 'generating' })]} />,
      { locale: 'en' },
    );
    const images = within(screen.getByTestId('ad-studio-scene-references-1'));
    const attach = images.getByLabelText('Attach an image…');
    // Only ready images can be attached.
    expect(within(attach).getAllByRole('option').map((option) => option.textContent)).toEqual(['Attach an image…', 'Dashboard']);
    fireEvent.change(attach, { target: { value: 'r1' } });
    expect(images.getByText('Dashboard')).toBeInTheDocument();
    fireEvent.change(images.getByLabelText('How to use it'), { target: { value: 'first_frame' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save script' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).scenes[0].references).toEqual([{ imageId: 'r1', use: 'first_frame' }]);

    fireEvent.click(images.getByRole('button', { name: 'Remove from this scene' }));
    expect(images.queryByText('Dashboard', { selector: 'span' })).toBeNull();
  });
});
