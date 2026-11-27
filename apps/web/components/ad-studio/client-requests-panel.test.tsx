import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import type { AdShareFeedbackItem, AdShareProposalView } from '@growthos/shared';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { ClientRequestsPanel } from './client-requests-panel';
import { ShareLinksPanel, type ShareLinkRow } from './share-links-panel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const BRIEFS = [{ id: 'brief-1', name: 'Summer Solar Video' }];
const LINKS: ShareLinkRow[] = [
  {
    id: 'lnk-1',
    briefIds: null,
    label: 'Acme Client',
    createdOn: '2026-11-18T07:00:00.000Z',
    expiresOn: '2026-12-18T07:00:00.000Z',
    revokedOn: null,
    status: 'active',
    includeResults: true,
    allowFeedback: true,
    revisionNumber: 1,
    revisionNote: null,
  },
];

const INITIAL_FEEDBACK: AdShareFeedbackItem[] = [
  {
    id: 'fb-1',
    shareLinkId: 'lnk-1',
    clientLabel: 'Acme Client',
    authorName: 'Dana',
    targetKind: 'brief',
    briefId: 'brief-1',
    briefName: 'Summer Solar Video',
    creativeRef: null,
    campaignId: null,
    campaignLabel: null,
    verdict: 'changes_requested',
    comment: 'Switch narrator to energetic male voice and emphasize warranty.',
    status: 'open',
    createdOn: '2026-11-18T08:00:00.000Z',
    resolvedOn: null,
  },
];

const PENDING_PROPOSAL: AdShareProposalView = {
  id: 'prop-1',
  feedbackIds: ['fb-1'],
  clientQuote: 'Switch narrator to energetic male voice and emphasize warranty.',
  kind: 'update_brief_settings',
  briefId: 'brief-1',
  briefName: 'Summer Solar Video',
  title: 'Energetic male voice + 25y warranty callout',
  summary: 'Set narrator preset to man_energetic and update video instructions.',
  rationale: 'Directly addresses client review feedback.',
  changes: { voicePreset: 'man_energetic', videoInstructions: 'Highlight 25-year warranty cleanly.' },
  status: 'pending',
  appliedBriefId: null,
  runId: null,
  failureReason: null,
  createdOn: '2026-11-18T08:05:00.000Z',
  decidedOn: null,
};

describe('ClientRequestsPanel', () => {
  it('copies return report & fix-agent instructions, approves AI proposal, and creates an updated client link', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const appliedFeedback: AdShareFeedbackItem = { ...INITIAL_FEEDBACK[0], status: 'applied' };
    const appliedProposal: AdShareProposalView = {
      ...PENDING_PROPOSAL,
      status: 'applied',
      appliedBriefId: 'brief-1',
      runId: 'run-99',
    };

    let approved = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/proposals/prop-1')) {
        approved = true;
        return json({ proposal: appliedProposal, appliedBriefId: 'brief-1', runId: 'run-99' });
      }
      if (url.includes('/client-requests?locale=')) {
        return json({
          feedback: approved ? [appliedFeedback] : INITIAL_FEEDBACK,
          proposals: [approved ? appliedProposal : PENDING_PROPOSAL],
        });
      }
      if (url.endsWith('/client-requests') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        if (body.action === 'propose') {
          return json({ proposals: [PENDING_PROPOSAL], analyzedFeedbackCount: 1 }, 201);
        }
      }
      if (url.endsWith('/share-links') && init?.method === 'POST') {
        return json(
          {
            token: 'rev2-token-abc',
            link: {
              ...LINKS[0],
              id: 'lnk-2',
              revisionNumber: 2,
              revisionNote: 'Voice updated',
            },
          },
          201,
        );
      }
      return json({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithIntl(
      <ClientRequestsPanel
        orgId="org-1"
        projectId="proj-1"
        projectName="Acme Solar"
        briefs={BRIEFS}
        initialFeedback={INITIAL_FEEDBACK}
        initialProposals={[]}
        shareLinks={LINKS}
        canCreateShareLink
        aiAvailable
      />,
    );

    fireEvent.click(screen.getByTestId('copy-feedback-report-btn'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Client Feedback Return Report'));

    fireEvent.click(screen.getByTestId('copy-fix-agent-btn'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Switch narrator to energetic male voice'));

    fireEvent.click(screen.getByTestId('generate-client-proposals-btn'));
    await screen.findByTestId('client-proposal-card-prop-1');

    fireEvent.click(screen.getByTestId('approve-proposal-prop-1'));
    await screen.findByTestId('client-requests-send-revision');

    fireEvent.change(screen.getByPlaceholderText('e.g. Updated opening hook, energetic voice, and added B2B ad'), {
      target: { value: 'Updated voice and warranty highlight' },
    });
    fireEvent.click(screen.getByTestId('send-updated-version-btn'));

    await waitFor(() => {
      const shareCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/share-links'));
      expect(shareCall).toBeTruthy();
      expect(JSON.parse(String((shareCall![1] as RequestInit).body))).toMatchObject({
        revisionNumber: 2,
        revisionNote: 'Updated voice and warranty highlight',
        supersedesLinkId: 'lnk-1',
        markFeedbackSentIds: ['fb-1'],
      });
    });

    expect(screen.getByDisplayValue(/\/en\/share\/ads\/rev2-token-abc/)).toBeInTheDocument();
  });

  it('logs a manual client request directly from the manager drawer', async () => {
    const savedManual: AdShareFeedbackItem = {
      id: 'fb-manual',
      shareLinkId: 'manual',
      clientLabel: 'Beta Corp',
      authorName: 'Beta Corp',
      targetKind: 'general',
      briefId: null,
      briefName: null,
      creativeRef: null,
      campaignId: null,
      campaignLabel: null,
      verdict: 'request',
      comment: 'Create a promo video for free next-day delivery.',
      status: 'open',
      createdOn: '2026-11-18T09:00:00.000Z',
      resolvedOn: null,
    };

    const fetchMock = vi.fn(async () => json({ item: savedManual }, 201));
    vi.stubGlobal('fetch', fetchMock);

    renderWithIntl(
      <ClientRequestsPanel
        orgId="org-1"
        projectId="proj-1"
        projectName="Acme Solar"
        briefs={BRIEFS}
        initialFeedback={[]}
        initialProposals={[]}
        shareLinks={LINKS}
        canCreateShareLink
        aiAvailable
      />,
    );

    fireEvent.click(screen.getByTestId('toggle-manual-request-btn'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Dana — Acme'), { target: { value: 'Beta Corp' } });
    fireEvent.change(screen.getByPlaceholderText(/Create a vertical reel highlighting free delivery/), {
      target: { value: 'Create a promo video for free next-day delivery.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save client request' }));

    const queue = await screen.findByTestId('client-feedback-queue');
    expect(within(queue).getByText('Create a promo video for free next-day delivery.')).toBeInTheDocument();
  });
});

describe('ShareLinksPanel — results & feedback toggles', () => {
  it('sends includeResults: false and allowFeedback: false only when unchecked', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () =>
      json(
        {
          token: 'tok-xyz',
          link: { ...LINKS[0], id: 'lnk-2', includeResults: false, allowFeedback: false },
        },
        201,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderWithIntl(<ShareLinksPanel orgId="org-1" projectId="proj-1" briefs={BRIEFS} initialLinks={[]} />);

    fireEvent.click(screen.getByLabelText('Include how the ads are doing'));
    fireEvent.click(screen.getByLabelText('Let client approve ads and leave notes'));
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));

    await screen.findByTestId('ad-share-created');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}'))).toEqual({
      briefIds: null,
      label: '',
      expiresInDays: 30,
      includeResults: false,
      allowFeedback: false,
    });
  });
});
