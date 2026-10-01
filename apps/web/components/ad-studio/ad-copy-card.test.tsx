import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import heMessages from '@/messages/he.json';
import { AdCopyCard } from './ad-copy-card';
import { PublishPanel, type PublishCreative } from './publish-panel';

const refresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const COPY = { headline: 'Sign in 30 seconds', primaryText: 'Upload, send on WhatsApp, signed.', description: 'Start free' };
const BASE = '/api/orgs/o/projects/p/ad-studio/briefs/b1';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function renderCard(props: Partial<React.ComponentProps<typeof AdCopyCard>> = {}, locale: 'en' | 'he' = 'en') {
  return renderWithIntl(<AdCopyCard orgId="o" projectId="p" briefId="b1" copyKey="c1" copy={COPY} advertiser="EasySign" aiAvailable {...props} />, { locale });
}

const IMAGES = { kind: 'image' as const, byFormat: { portrait: '/portrait.jpg', story: '/story.jpg', landscape: '/landscape.jpg' }, alt: 'the picture' };

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

describe('AdCopyCard', () => {
  it('shows the copy as the feed does: advertiser, the main text, the headline and description', () => {
    renderCard();
    const card = within(screen.getByTestId('ad-studio-copy-c1'));
    expect(card.getByText('EasySign')).toBeInTheDocument();
    expect(card.getByText('Sponsored')).toBeInTheDocument();
    expect(card.getByTestId('ad-studio-copy-primary')).toHaveTextContent(COPY.primaryText);
    expect(card.getByTestId('ad-studio-copy-headline')).toHaveTextContent(COPY.headline);
    expect(card.getByText('Start free')).toBeInTheDocument();
  });

  it('with images, previews every placement with its own image and the copy, and says when a placement borrows one', () => {
    renderCard({ preview: IMAGES, linkUrl: 'https://www.easy-sign.co.il/lawyers' });
    const preview = screen.getByTestId('ad-placement-preview');
    expect(preview).toHaveAttribute('data-placement', 'facebook_feed');
    expect(within(preview).getByRole('img', { name: 'the picture' })).toHaveAttribute('src', '/portrait.jpg');
    expect(within(preview).getByText(COPY.primaryText)).toBeInTheDocument();
    expect(within(preview).getByText('easy-sign.co.il')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Instagram story / Reels' }));
    expect(within(preview).getByRole('img', { name: 'the picture' })).toHaveAttribute('src', '/story.jpg');
    fireEvent.click(screen.getByRole('tab', { name: 'Google display' }));
    expect(within(preview).getByRole('img', { name: 'the picture' })).toHaveAttribute('src', '/landscape.jpg');
    expect(within(preview).queryByTestId('ad-preview-format-note')).toBeNull();
    // An idea rendered only as a square: the story borrows it and says so.
    renderCard({ copyKey: 'c2', preview: { kind: 'image', byFormat: { square: '/square.jpg' }, alt: 'square only' } });
    const second = within(screen.getByTestId('ad-studio-copy-c2'));
    fireEvent.click(second.getByRole('tab', { name: 'Instagram story / Reels' }));
    expect(second.getByTestId('ad-preview-format-note')).toHaveTextContent('Showing the square image');
  });

  it('warns plainly when an ad with images has no text, in Hebrew too', () => {
    renderCard({ copy: null, preview: IMAGES }, 'he');
    expect(screen.getByTestId('ad-studio-copy-missing')).toHaveTextContent(heMessages.AdStudio.copy.missingPrimary);
    expect(screen.getByRole('tab', { name: heMessages.AdStudio.preview.placement.facebook_feed })).toHaveAttribute('aria-selected', 'true');
  });

  it('says plainly when an ad has no text yet, and the AI writes it for this creative only', async () => {
    const written = { headline: 'No more paper', primaryText: 'Every contract signed online.', description: '' };
    const fetchMock = vi.fn(async () => json({ brief: { videoCopy: null, imageConcepts: [{ id: 'c1', copy: written }] } }));
    vi.stubGlobal('fetch', fetchMock);
    renderCard({ copy: null }, 'he');
    expect(screen.getByTestId('ad-studio-copy-primary')).toHaveTextContent(heMessages.AdStudio.copy.missingPrimary);
    fireEvent.click(screen.getByRole('button', { name: heMessages.AdStudio.copy.write }));
    await waitFor(() => expect(screen.getByTestId('ad-studio-copy-headline')).toHaveTextContent('No more paper'));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/copy/generate`);
    expect(JSON.parse(String(init.body))).toEqual({ keys: ['c1'], rewrite: true });
  });

  it('edits the words with live counters, blocks a save past a limit, and saves the video copy', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => json({ brief: { videoCopy: JSON.parse(String(init?.body)).videoCopy, imageConcepts: [] } }));
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    renderCard({ copyKey: 'video', onSaved });
    fireEvent.click(screen.getByRole('button', { name: 'Edit text' }));
    const editor = within(screen.getByTestId('ad-studio-copy-editor'));
    const headline = editor.getByLabelText(/^Headline/);
    fireEvent.change(headline, { target: { value: 'x'.repeat(31) } });
    expect(editor.getByText('31/30')).toBeInTheDocument();
    expect(editor.getByText('The headline is longer than 30 characters.')).toBeInTheDocument();
    expect(editor.getByRole('button', { name: 'Save text' })).toBeDisabled();
    fireEvent.change(headline, { target: { value: 'Signed. Done.' } });
    fireEvent.click(editor.getByRole('button', { name: 'Save text' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ ...COPY, headline: 'Signed. Done.' }));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/copy`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ videoCopy: { ...COPY, headline: 'Signed. Done.' } });
  });
});

describe('PublishPanel with ad copy', () => {
  it('starts from the picked creative copy and switches to the other creative copy when it is picked', () => {
    const creatives: PublishCreative[] = [
      { key: 'c1-square', kind: 'image', id: 'img1', label: 'Idea 1 · Square', previewSrc: '/img1', copy: COPY },
      { key: 'video', kind: 'video', id: 'vid1', label: 'The video', previewSrc: '/vid1', copy: { headline: 'Watch it', primaryText: 'See a contract signed.', description: '' } },
    ];
    renderWithIntl(
      <PublishPanel orgId="o" projectId="p" briefId="b1" briefName="Sign fast" defaultLink="https://x.example" defaultPrimaryText="Objective" creatives={creatives} destinations={{ meta: true, google_ads: true }} canPublish published={[]} resourcesHref="/r" />,
      { locale: 'en' },
    );
    expect(screen.getByDisplayValue(COPY.headline)).toBeInTheDocument();
    expect(screen.getByDisplayValue(COPY.primaryText)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Start free')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /The video/ }));
    expect(screen.getByDisplayValue('Watch it')).toBeInTheDocument();
    expect(screen.getByDisplayValue('See a contract signed.')).toBeInTheDocument();
  });
});

describe('PublishPanel live preview', () => {
  it('shows the ad being created with the typed words, on the chosen platform placements', () => {
    const creatives: PublishCreative[] = [{ key: 'c1-story', kind: 'image', id: 'img1', label: 'Idea 1 · Story', previewSrc: '/story.jpg', format: 'story', copy: COPY }];
    renderWithIntl(
      <PublishPanel orgId="o" projectId="p" briefId="b1" briefName="Sign fast" defaultLink="https://easy-sign.example/x" defaultPrimaryText="Objective" creatives={creatives} destinations={{ meta: true, google_ads: true }} canPublish published={[]} resourcesHref="/r" />,
      { locale: 'en' },
    );
    const preview = within(screen.getByTestId('ad-studio-publish-preview'));
    expect(preview.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Facebook feed', 'Instagram feed', 'Instagram story / Reels']);
    fireEvent.change(screen.getByDisplayValue(COPY.headline), { target: { value: 'Typed headline' } });
    expect(preview.getByText('Typed headline')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Google Ads/ }));
    const google = within(screen.getByTestId('ad-studio-publish-preview'));
    expect(google.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Google display']);
    expect(google.getByRole('img', { name: 'Idea 1 · Story' })).toHaveAttribute('src', '/story.jpg');
  });
});
