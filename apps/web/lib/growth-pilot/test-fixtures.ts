import type { GrowthPilotPageData, GrowthProposalView, GrowthTargetView } from './view';

/** Test data for the Growth Pilot page: a target and proposals in any state, with every field filled. */

export function targetView(extra: Partial<GrowthTargetView> = {}): GrowthTargetView {
  return {
    id: 't1',
    kind: 'service',
    name: 'Digital signature',
    description: 'Sign in 30 seconds',
    audience: 'Law firms',
    status: 'active',
    origin: 'site',
    briefId: 'b1',
    adsStatus: 'none',
    adsFailure: null,
    landingPageId: null,
    landingStatus: 'none',
    landingFailure: null,
    audienceStatus: 'none',
    audienceFailure: null,
    publishStatus: 'none',
    publishFailure: null,
    videoStatus: 'none',
    videoFailure: null,
    liveAds: 0,
    changeRequests: [],
    dailyBudget: null,
    budgetCurrency: null,
    adsManagerUrl: null,
    createdOn: '2026-11-01T10:00:00.000Z',
    updatedOn: '2026-11-01T10:00:00.000Z',
    ...extra,
  };
}

export function proposalView(extra: Partial<GrowthProposalView> = {}): GrowthProposalView {
  return {
    id: 'p1',
    kind: 'target',
    briefId: null,
    landingPageId: null,
    audience: null,
    publish: null,
    previewImageIds: [],
    targetId: 't1',
    status: 'pending',
    draft: { kind: 'service', name: 'Digital signature', description: 'Sign in 30 seconds', audience: 'Law firms', reason: '' },
    changes: [],
    landingContent: null,
    appliesToLive: false,
    decidedOn: null,
    createdOn: '2026-11-01T10:00:00.000Z',
    ...extra,
  };
}

export function pageData(extra: Partial<GrowthPilotPageData> = {}): GrowthPilotPageData {
  return {
    pilot: { id: 'g1', siteUrl: 'https://easysign.co.il/', status: 'active', failureCode: null, analysis: null, pagesRead: [], createdOn: '2026-11-01T09:00:00.000Z' },
    targets: [],
    proposals: [],
    activity: [],
    landingPages: [],
    ...extra,
  };
}

/** A target all the way live: approved, audience and page approved, images approved, published and turned on. */
export function liveTarget(extra: Partial<GrowthTargetView> = {}): GrowthTargetView {
  return targetView({ adsStatus: 'approved', landingStatus: 'published', landingPageId: 'lp1', audienceStatus: 'approved', publishStatus: 'running', liveAds: 2, ...extra });
}
