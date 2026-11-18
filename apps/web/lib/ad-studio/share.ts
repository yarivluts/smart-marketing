import 'server-only';
import { cache } from 'react';
import { NextResponse } from 'next/server';
import {
  AdStudioBriefNotFoundError,
  AdStudioImageNotFoundError,
  AdStudioVideoNotFoundError,
  getAdStudioBrandKit,
  listAdShareLinks,
  listAdStudioImages,
  resolveAdShareToken,
  type AdShareLinkView,
  type ResolvedAdShareLink,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import {
  listAdShareFeedbackForLink,
  listAdShareFeedbackForProject,
  listAdShareProposals,
} from '@growthos/firebase-orm-models';
import type { AdShareFeedbackItem, AdShareProposalView } from '@growthos/shared';
import { buildUnifiedAdsCockpitData } from '@/lib/orgs/ads-performance-synthesizer';
import { toAutomationTargetView } from '@/lib/orgs/automation-view';
import {
  getCampaignSpendBreakdownForProject,
  listAutomationActionsForProject,
  listAutomationTargetStatesForProject,
  type CampaignSpendBreakdownOutcome,
} from '@/lib/orgs/queries';
import { resolveSelectedEnvironment } from '@/lib/orgs/selected-environment';
import { listAdStudioBriefs, listAdStudioClips, listAdStudioVideos, toAdStudioBriefView } from './store';
import { toAdStudioClipView, toAdStudioImageView, toAdStudioVideoView } from './engine';
import {
  sharedBriefAds,
  sharedMediaBase,
  type SharedAdsPage,
  type SharedBriefAds,
  type SharedCampaignResultsSummary,
} from './share-view';

/**
 * Server side of the client share links: resolving a token and gathering what it shows. A token
 * that is malformed, unknown, revoked or expired resolves to null - every caller answers the same
 * way for all four, so nothing tells them apart.
 */

/** The project's share links for the studio's "Share with client" panel (callers check `project.configure`). */
export async function listShareLinks(organizationId: string, projectId: string): Promise<AdShareLinkView[]> {
  await ensureFirestoreOrm();
  return listAdShareLinks(organizationId, projectId);
}

export async function resolveShareLink(token: string): Promise<ResolvedAdShareLink | null> {
  await ensureFirestoreOrm();
  return resolveAdShareToken(token);
}

/** How long a browser may keep a shared ad's media: short, so a revoked link stops showing it soon. */
export const SHARED_MEDIA_CACHE_CONTROL = 'private, max-age=300';

/** The one answer for anything a share link cannot open - unknown token, other project, unready media. */
export function sharedNotFound(): NextResponse {
  return NextResponse.json({ error: 'not_found' }, { status: 404, headers: { 'cache-control': 'no-store' } });
}

/** Missing records read as not found; anything else is a real failure and is rethrown. */
export function sharedMediaError(error: unknown): NextResponse {
  if (error instanceof AdStudioImageNotFoundError || error instanceof AdStudioVideoNotFoundError || error instanceof AdStudioBriefNotFoundError) return sharedNotFound();
  throw error;
}

/** Whether a brief is one the link shows. Its media must still be read under the link's org and project. */
export function shareLinkCoversBrief(link: Pick<ResolvedAdShareLink, 'briefIds'>, briefId: string): boolean {
  return link.briefIds === null || link.briefIds.includes(briefId);
}

/** Firestore document ids as this app mints them; anything else from a public URL is turned away before a read. */
export function isShareableId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

/** Everything the public page shows for a token, read once per request; null when the link is not active. */
export const loadSharedAds = cache(async (token: string): Promise<SharedAdsPage | null> => {
  const link = await resolveShareLink(token);
  if (!link) return null;
  const { organizationId, projectId } = link;
  const [briefModels, brandKit, feedback] = await Promise.all([
    listAdStudioBriefs(organizationId, projectId),
    getAdStudioBrandKit(organizationId, projectId),
    link.allowFeedback ? listAdShareFeedbackForLink(organizationId, projectId, link.id) : Promise.resolve([]),
  ]);
  const briefs = briefModels.map(toAdStudioBriefView).filter((brief) => shareLinkCoversBrief(link, brief.id));
  const shown = await Promise.all(
    briefs.map(async (brief): Promise<SharedBriefAds | null> => {
      const [images, clips, videos] = await Promise.all([
        listAdStudioImages(organizationId, projectId, brief.id),
        brief.scenes.length ? listAdStudioClips(organizationId, projectId, brief.id) : Promise.resolve([]),
        brief.scenes.length ? listAdStudioVideos(organizationId, projectId, brief.id) : Promise.resolve([]),
      ]);
      return sharedBriefAds({
        token,
        brief,
        images: images.map(toAdStudioImageView),
        clips: clips.map(toAdStudioClipView),
        videos: videos.map(toAdStudioVideoView),
      });
    }),
  );

  let results: SharedCampaignResultsSummary | null = null;
  if (link.includeResults) {
    try {
      const { selected: selectedEnvironment } = await resolveSelectedEnvironment(organizationId, projectId);
      let spendOutcome: CampaignSpendBreakdownOutcome | null = null;
      try {
        spendOutcome = await getCampaignSpendBreakdownForProject(organizationId, projectId, {
          environmentId: selectedEnvironment?.id,
        });
      } catch {
        spendOutcome = null;
      }
      const [targets, actions] = await Promise.all([
        listAutomationTargetStatesForProject(organizationId, projectId),
        listAutomationActionsForProject(organizationId, projectId),
      ]);
      const targetViews = targets.map(toAutomationTargetView);
      const lastActionAtByTarget = new Map<string, string>();
      for (const action of actions) {
        if (!lastActionAtByTarget.has(action.target_id)) {
          lastActionAtByTarget.set(action.target_id, action.proposed_at);
        }
      }
      const { items, summary } = buildUnifiedAdsCockpitData(targetViews, spendOutcome, new Map(), lastActionAtByTarget);
      if (items.length > 0 || summary.campaignsWithSpendCount > 0) {
        results = {
          totalSpendUsd: summary.totalSpendUsd,
          metaSpendUsd: summary.metaSpendUsd,
          googleSpendUsd: summary.googleSpendUsd,
          activeCampaignsCount: summary.activeCampaignsCount,
          totalCampaignsCount: summary.totalCampaignsCount,
          campaignsWithSpendCount: summary.campaignsWithSpendCount,
          items: items.map((item) => ({
            id: item.targetId,
            label: item.label,
            platform: item.platform,
            status: item.status,
            dailyBudgetUsd: item.dailyBudgetUsd,
            totalSpendUsd: item.spend30dUsd,
            roas: item.roas,
            ctrPct: item.ctrPct,
            conversions: item.conversions,
          })),
        };
      }
    } catch {
      results = null;
    }
  }

  return {
    brandName: brandKit.brandName,
    logoSrc: brandKit.logo ? `${sharedMediaBase(token)}/logo${brandKit.lastChangedOn ? `?v=${encodeURIComponent(brandKit.lastChangedOn)}` : ''}` : null,
    expiresOn: link.expiresOn,
    briefs: shown.filter((entry): entry is SharedBriefAds => entry !== null),
    token,
    label: link.label,
    includeResults: link.includeResults,
    allowFeedback: link.allowFeedback,
    revisionNumber: link.revisionNumber,
    revisionNote: link.revisionNote,
    results,
    feedback,
  };
});

/** Loads project-level client feedback notes & AI proposals for the manager workspace. */
export async function loadClientRequestsState(
  organizationId: string,
  projectId: string,
): Promise<{ feedback: AdShareFeedbackItem[]; proposals: AdShareProposalView[] }> {
  await ensureFirestoreOrm();
  const [feedback, proposals] = await Promise.all([
    listAdShareFeedbackForProject(organizationId, projectId),
    listAdShareProposals(organizationId, projectId),
  ]);
  return { feedback, proposals };
}
