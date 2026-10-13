import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { imageConceptFingerprint, type AdStudioImageConcept } from '@growthos/shared';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import heMessages from '@/messages/he.json';
import type { AdStudioImageView } from '@/lib/ad-studio/view';
import { ImageStudio } from './image-studio';

const refresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const CONCEPT: AdStudioImageConcept = { id: 'c1', visualPrompt: 'A lawyer signing on a phone', headline: 'Sign fast', formats: ['square', 'story'] };
const BASE = '/api/orgs/o/projects/p/ad-studio/briefs/b1';

function image(overrides: Partial<AdStudioImageView> = {}): AdStudioImageView {
  return {
    id: 'i1',
    conceptId: 'c1',
    format: 'square',
    kind: 'render',
    version: 1,
    status: 'ready',
    selected: true,
    parentImageId: null,
    instruction: null,
    conceptFingerprint: imageConceptFingerprint(CONCEPT, 'square', 'en'),
    failureCode: null,
    mimeType: 'image/png',
    requestedOn: '2026-09-28T10:00:00.000Z',
    completedOn: '2026-09-28T10:00:05.000Z',
    qa: null,
    imageSize: '2K',
    ...overrides,
  };
}

function renderStudio(props: Partial<React.ComponentProps<typeof ImageStudio>> = {}, locale: 'en' | 'he' = 'en') {
  return renderWithIntl(
    <ImageStudio
      orgId="o"
      projectId="p"
      briefId="b1"
      briefName="Sign fast"
      language="en"
      initialConcepts={[CONCEPT]}
      initialImages={[image()]}
      imagesAvailable
      textAvailable
      imagesLeftToday={38}
      canExport
      destinations={{ meta: false, google_ads: true }}
      exports={[]}
      {...props}
    />,
    { locale },
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

describe('ImageStudio', () => {
  it('shows the AI check of each image: passed after re-renders, or what is wrong with a misspelled headline', () => {
    renderStudio({
      initialImages: [
        image({ qa: { status: 'passed', issues: [{ severity: 'minor', detail: 'A little blur in the corner' }], renders: 2, overlay: true } }),
        image({
          id: 'i2',
          format: 'story',
          conceptFingerprint: imageConceptFingerprint(CONCEPT, 'story', 'en'),
          qa: { status: 'issues', renders: 2, issues: [{ severity: 'major', code: 'headline_mismatch', detail: 'Sing fast' }, { severity: 'minor', detail: 'Slight blur' }] },
        }),
      ],
    });
    // The summary counts real images only: one of the two checked images passed, one needs a look.
    expect(screen.getByTestId('ad-studio-image-summary-passed')).toHaveTextContent('1 of 2');
    expect(screen.getByTestId('ad-studio-image-summary-attention')).toHaveTextContent('1');
    expect(screen.getByTestId('ad-studio-image-summary-ready')).toHaveTextContent('2 of 2');
    expect(screen.getByTestId('ad-studio-image-summary-left')).toHaveTextContent('38');
    expect(within(screen.getByTestId('ad-studio-image-slot-square')).getByTestId('ad-studio-image-qa-passed')).toHaveTextContent('AI check passed after 2 renders');
    expect(within(screen.getByTestId('ad-studio-image-slot-square')).getByTestId('ad-studio-image-qa-minor')).toHaveTextContent('A little blur in the corner');
    expect(within(screen.getByTestId('ad-studio-image-slot-square')).getByTestId('ad-studio-image-qa-overlay')).toHaveTextContent('The headline was set by the studio');
    const issues = within(screen.getByTestId('ad-studio-image-slot-story')).getByTestId('ad-studio-image-qa-issues');
    expect(issues).toHaveTextContent('The headline in the image is not spelled as written. The image reads: "Sing fast"');
    expect(issues).toHaveTextContent('Slight blur');
  });

  it('stays quiet about the check when it did not run, and shows the image size and version', () => {
    renderStudio({ initialImages: [image({ qa: { status: 'skipped', issues: [], renders: 1 } })] });
    expect(within(screen.getByTestId('ad-studio-image-slot-square')).getByText('v1 · 2K')).toBeInTheDocument();
    // Images made before the check, or with it off, are not counted as failing it.
    expect(screen.getByTestId('ad-studio-image-summary-passed')).toHaveTextContent('Not checked');
    expect(screen.queryByTestId('ad-studio-image-qa-issues')).toBeNull();
    expect(screen.queryByTestId('ad-studio-image-qa-passed')).toBeNull();
  });

  it("on one idea's own page shows only that idea, without the actions on all ideas", () => {
    const second = { ...CONCEPT, id: 'c2', headline: 'No printing' };
    renderStudio({ initialConcepts: [CONCEPT, second], focusConceptId: 'c2' });
    expect(screen.getByTestId('ad-studio-image-concept-1')).toHaveClass('hidden');
    expect(screen.getByTestId('ad-studio-image-concept-2')).not.toHaveClass('hidden');
    expect(screen.queryByTestId('ad-studio-idea-filter')).toBeNull();
    expect(screen.queryByTestId('ad-studio-image-summary')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Write new ideas with AI' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add an idea' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save ideas' })).toBeInTheDocument();
  });

  it('says so when the idea asked for is no longer in the ad', () => {
    renderStudio({ focusConceptId: 'gone' });
    expect(screen.getByTestId('ad-studio-idea-missing')).toBeInTheDocument();
  });

  it('filters the ideas to one, and back to all', () => {
    const second = { ...CONCEPT, id: 'c2', headline: 'No printing' };
    renderStudio({ initialConcepts: [CONCEPT, second] });
    const filterBar = screen.getByTestId('ad-studio-idea-filter');
    expect(within(filterBar).getByRole('button', { name: 'All ideas (2)' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(filterBar).getByRole('button', { name: 'Idea 2' }));
    expect(screen.getByTestId('ad-studio-image-concept-1')).toHaveClass('hidden');
    expect(screen.getByTestId('ad-studio-image-concept-2')).not.toHaveClass('hidden');
    fireEvent.click(within(filterBar).getByRole('button', { name: 'All ideas (2)' }));
    expect(screen.getByTestId('ad-studio-image-concept-1')).not.toHaveClass('hidden');
  });

  it('shows each placement of an idea with its image and state, and renders a missing one', async () => {
    const fetchMock = vi.fn(async () => json({ concepts: [CONCEPT], images: [image(), image({ id: 'i2', format: 'story', conceptFingerprint: imageConceptFingerprint(CONCEPT, 'story', 'en') })] }));
    vi.stubGlobal('fetch', fetchMock);
    renderStudio();

    const square = screen.getByTestId('ad-studio-image-slot-square');
    expect(within(square).getByText('Ready')).toBeInTheDocument();
    expect(within(square).getByRole('img')).toHaveAttribute('src', `${BASE}/images/i1/media`);
    const story = screen.getByTestId('ad-studio-image-slot-story');
    expect(within(story).getByText('Not rendered')).toBeInTheDocument();

    fireEvent.click(within(story).getByRole('button', { name: 'Render' }));
    await waitFor(() => expect(within(screen.getByTestId('ad-studio-image-slot-story')).getByText('Ready')).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/images`);
    expect(JSON.parse(init.body as string)).toEqual({ conceptId: 'c1', format: 'story' });
  });

  it('says why an image failed in image terms, not video terms, in English and Hebrew', () => {
    const failed = image({ id: 'i9', format: 'story', status: 'failed', selected: false, failureCode: 'provider_error', conceptFingerprint: imageConceptFingerprint(CONCEPT, 'story', 'en') });
    const { unmount } = renderStudio({ initialImages: [image(), failed] });
    expect(within(screen.getByTestId('ad-studio-image-slot-story')).getByText('the image model failed')).toBeInTheDocument();
    unmount();
    renderStudio({ initialImages: [image(), { ...failed, failureCode: 'provider_billing' }] }, 'he');
    expect(within(screen.getByTestId('ad-studio-image-slot-story')).getByText(heMessages.AdStudio.imageFailure.provider_billing)).toBeInTheDocument();
  });

  it('marks an image out of date after its idea changes, and saves the edited ideas', async () => {
    const edited = { ...CONCEPT, headline: 'Signed before lunch' };
    const fetchMock = vi.fn(async () => json({ concepts: [edited], images: [image()] }));
    vi.stubGlobal('fetch', fetchMock);
    renderStudio();

    fireEvent.change(screen.getByLabelText('Headline in the image (optional)'), { target: { value: 'Signed before lunch' } });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    // Rendering waits for the save, so a render always uses the idea as saved.
    expect(within(screen.getByTestId('ad-studio-image-slot-square')).getByRole('button', { name: 'Render again' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save ideas' }));

    await waitFor(() => expect(within(screen.getByTestId('ad-studio-image-slot-square')).getByText('Out of date')).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/image-concepts`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string).concepts[0].headline).toBe('Signed before lunch');
  });

  it('changes an image by an instruction and lets the person pick between versions', async () => {
    const v2 = image({ id: 'i2', version: 2, kind: 'edit', parentImageId: 'i1', instruction: 'Warmer light' });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ concepts: [CONCEPT], images: [v2, image({ selected: false })] }))
      .mockResolvedValueOnce(json({ concepts: [CONCEPT], images: [{ ...v2, selected: false }, image()] }));
    vi.stubGlobal('fetch', fetchMock);
    renderStudio();

    const square = screen.getByTestId('ad-studio-image-slot-square');
    fireEvent.click(within(square).getByRole('button', { name: 'Change with AI' }));
    fireEvent.change(within(square).getByLabelText('What should change?'), { target: { value: 'Warmer light' } });
    fireEvent.click(within(square).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(within(screen.getByTestId('ad-studio-image-slot-square')).getByRole('button', { name: 'v2' })).toHaveAttribute('aria-pressed', 'true'));
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ instruction: 'Warmer light' });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(`${BASE}/images/i1/edit`);

    fireEvent.click(within(screen.getByTestId('ad-studio-image-slot-square')).getByRole('button', { name: 'v1' }));
    await waitFor(() => expect((fetchMock.mock.calls[1] as unknown as [string])[0]).toBe(`${BASE}/images/i1/select`));
  });

  it('exports to a connected destination only, and in Hebrew', async () => {
    const fetchMock = vi.fn(async () => json({ export: { id: 'e1', imageId: 'i1', destination: 'google_ads', status: 'done', externalId: 'customers/1/assets/2', failureCode: null } }, 201));
    vi.stubGlobal('fetch', fetchMock);
    renderStudio({}, 'he');
    const square = screen.getByTestId('ad-studio-image-slot-square');
    const meta = within(square).getByRole('button', { name: `\u05e9\u05dc\u05d9\u05d7\u05d4 \u05dc${heMessages.AdStudio.images.destination.meta}` });
    expect(meta).toBeDisabled();
    fireEvent.click(within(square).getByRole('button', { name: `\u05e9\u05dc\u05d9\u05d7\u05d4 \u05dc${heMessages.AdStudio.images.destination.google_ads}` }));
    await waitFor(() => expect(within(screen.getByTestId('ad-studio-image-slot-square')).getByRole('button', { name: `\u05e0\u05e9\u05dc\u05d7 \u05dc${heMessages.AdStudio.images.destination.google_ads}` })).toBeInTheDocument());
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toEqual({ destination: 'google_ads', title: `Sign fast - Sign fast - ${heMessages.AdStudio.images.format.square}` });
  });

  it('asks before rewriting existing ideas, and does nothing when the person cancels', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderStudio();
    fireEvent.click(screen.getByRole('button', { name: 'Write new ideas with AI' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
