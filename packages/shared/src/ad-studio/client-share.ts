import type { AdStudioAdCopy } from './copy';
import type { AdStudioImageFormat } from './images';
import type { AdStudioFormat } from './scenes';
import type { AdStudioSearchAd } from './search-ads';
import type { AdStudioVoicePreset } from './voice';

/**
 * Pure domain types, validation, return-report generation, and fix-agent prompt synthesis for
 * third-party client ad sharing, per-ad/campaign client feedback, and AI improvement proposals.
 */

export const AD_SHARE_FEEDBACK_COMMENT_MAX = 1500;
export const AD_SHARE_AUTHOR_MAX = 80;
export const AD_SHARE_REVISION_NOTE_MAX = 500;
export const AD_SHARE_MAX_FEEDBACK_PER_LINK = 100;

export const AD_SHARE_VERDICTS = ['approved', 'changes_requested', 'comment', 'request'] as const;
export type AdShareVerdict = (typeof AD_SHARE_VERDICTS)[number];

export const AD_SHARE_TARGET_KINDS = ['brief', 'campaign', 'general'] as const;
export type AdShareTargetKind = (typeof AD_SHARE_TARGET_KINDS)[number];

export const AD_SHARE_FEEDBACK_STATUSES = ['open', 'proposed', 'applied', 'declined', 'sent_to_client'] as const;
export type AdShareFeedbackStatus = (typeof AD_SHARE_FEEDBACK_STATUSES)[number];

export const AD_SHARE_PROPOSAL_KINDS = [
  'update_brief_settings',
  'update_video_script',
  'update_image_concepts',
  'update_search_ad',
  'create_new_brief',
] as const;
export type AdShareProposalKind = (typeof AD_SHARE_PROPOSAL_KINDS)[number];

export const AD_SHARE_PROPOSAL_STATUSES = ['pending', 'approved', 'declined', 'applied', 'failed'] as const;
export type AdShareProposalStatus = (typeof AD_SHARE_PROPOSAL_STATUSES)[number];

export function isAdShareVerdict(value: unknown): value is AdShareVerdict {
  return typeof value === 'string' && (AD_SHARE_VERDICTS as readonly string[]).includes(value);
}

export function isAdShareTargetKind(value: unknown): value is AdShareTargetKind {
  return typeof value === 'string' && (AD_SHARE_TARGET_KINDS as readonly string[]).includes(value);
}

export function isAdShareFeedbackStatus(value: unknown): value is AdShareFeedbackStatus {
  return typeof value === 'string' && (AD_SHARE_FEEDBACK_STATUSES as readonly string[]).includes(value);
}

export function isAdShareProposalKind(value: unknown): value is AdShareProposalKind {
  return typeof value === 'string' && (AD_SHARE_PROPOSAL_KINDS as readonly string[]).includes(value);
}

export interface AdShareFeedbackItem {
  id: string;
  shareLinkId: string;
  clientLabel: string;
  authorName: string;
  targetKind: AdShareTargetKind;
  briefId: string | null;
  briefName: string | null;
  creativeRef: string | null;
  campaignId: string | null;
  campaignLabel: string | null;
  verdict: AdShareVerdict;
  comment: string;
  status: AdShareFeedbackStatus;
  createdOn: string;
  resolvedOn: string | null;
}

export interface AdShareProposalChanges {
  // update_brief_settings / create_new_brief
  name?: string;
  objective?: string;
  productDescription?: string;
  landingPageUrl?: string | null;
  format?: AdStudioFormat;
  language?: string;
  targetSeconds?: number;
  videoInstructions?: string | null;
  videoCopy?: AdStudioAdCopy;
  voicePreset?: AdStudioVoicePreset;
  // update_video_script
  scenes?: {
    durationSeconds: number;
    visualPrompt: string;
    voiceover: string;
    onScreenText: string;
  }[];
  // update_image_concepts
  mode?: 'replace_all' | 'append' | 'update_first';
  concepts?: {
    headline: string;
    visualPrompt: string;
    formats: AdStudioImageFormat[];
    copy?: AdStudioAdCopy;
  }[];
  // update_search_ad
  headlines?: string[];
  descriptions?: string[];
  path1?: string;
  path2?: string;
}

export interface AdShareProposalView {
  id: string;
  feedbackIds: string[];
  clientQuote: string;
  kind: AdShareProposalKind;
  briefId: string | null;
  briefName: string | null;
  title: string;
  summary: string;
  rationale: string;
  changes: AdShareProposalChanges;
  status: AdShareProposalStatus;
  appliedBriefId: string | null;
  runId: string | null;
  failureReason: string | null;
  createdOn: string;
  decidedOn: string | null;
}

export interface ValidateClientFeedbackInput {
  targetKind: unknown;
  verdict: unknown;
  authorName?: unknown;
  comment?: unknown;
  briefId?: unknown;
  creativeRef?: unknown;
  campaignId?: unknown;
  campaignLabel?: unknown;
}

const SAFE_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;

function isValidOptionalId(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  return typeof value === 'string' && SAFE_ID_PATTERN.test(value);
}

/** Validates third-party client feedback / request payloads; returns issue codes, empty when valid. */
export function validateClientFeedbackInput(input: ValidateClientFeedbackInput): string[] {
  const issues: string[] = [];
  if (!isAdShareTargetKind(input.targetKind)) issues.push('invalid_target_kind');
  if (!isAdShareVerdict(input.verdict)) issues.push('invalid_verdict');

  if (input.authorName !== undefined && input.authorName !== null) {
    if (typeof input.authorName !== 'string') {
      issues.push('invalid_author_name');
    } else if (input.authorName.trim().length > AD_SHARE_AUTHOR_MAX) {
      issues.push('author_too_long');
    }
  }

  const rawComment = input.comment === undefined || input.comment === null ? '' : input.comment;
  if (typeof rawComment !== 'string') {
    issues.push('invalid_comment');
  } else {
    const trimmed = rawComment.trim();
    if (trimmed.length === 0 && input.verdict !== 'approved') {
      issues.push('comment_required');
    }
    if (trimmed.length > AD_SHARE_FEEDBACK_COMMENT_MAX) {
      issues.push('comment_too_long');
    }
  }

  if (!isValidOptionalId(input.briefId)) issues.push('invalid_brief_id');
  if (!isValidOptionalId(input.creativeRef)) issues.push('invalid_creative_ref');
  if (!isValidOptionalId(input.campaignId)) issues.push('invalid_campaign_id');

  if (input.targetKind === 'brief' && (typeof input.briefId !== 'string' || !SAFE_ID_PATTERN.test(input.briefId))) {
    issues.push('brief_id_required');
  }
  if (
    input.targetKind === 'campaign' &&
    (typeof input.campaignId !== 'string' || !SAFE_ID_PATTERN.test(input.campaignId)) &&
    (typeof input.campaignLabel !== 'string' || input.campaignLabel.trim().length === 0)
  ) {
    issues.push('campaign_required');
  }

  return issues;
}

const HE = {
  reportTitle: '\u05d3\u05d5\u05d7 \u05de\u05e9\u05d5\u05d1 \u05d5\u05d1\u05e7\u05e9\u05d5\u05ea \u05dc\u05e7\u05d5\u05d7',
  project: '\u05e4\u05e8\u05d5\u05d9\u05e7\u05d8',
  generatedOn: '\u05d4\u05d5\u05e4\u05e7 \u05d1-',
  summary: '\u05e1\u05d9\u05db\u05d5\u05dd',
  approved: '\u05d0\u05d5\u05e9\u05e8\u05d5',
  changesRequested: '\u05d1\u05e7\u05e9\u05d5\u05ea \u05dc\u05e9\u05d9\u05e0\u05d5\u05d9',
  comments: '\u05d4\u05e2\u05e8\u05d5\u05ea',
  requests: '\u05d1\u05e7\u05e9\u05d5\u05ea \u05d7\u05d3\u05e9\u05d5\u05ea',
  openCount: '\u05e4\u05ea\u05d5\u05d7\u05d5\u05ea',
  noItems: '\u05e2\u05d3\u05d9\u05d9\u05df \u05dc\u05d0 \u05d4\u05ea\u05e7\u05d1\u05dc \u05de\u05e9\u05d5\u05d1 \u05de\u05d4\u05dc\u05e7\u05d5\u05d7.',
  adTarget: '\u05de\u05d5\u05d3\u05e2\u05d4',
  campaignTarget: '\u05e7\u05de\u05e4\u05d9\u05d9\u05df',
  generalTarget: '\u05d1\u05e7\u05e9\u05d4 \u05db\u05dc\u05dc\u05d9\u05ea',
  clientAnonymous: '\u05dc\u05e7\u05d5\u05d7',
  verdicts: {
    approved: '\u05d0\u05d5\u05e9\u05e8',
    changes_requested: '\u05e0\u05d3\u05e8\u05e9 \u05e9\u05d9\u05e0\u05d5\u05d9',
    comment: '\u05d4\u05e2\u05e8\u05d4',
    request: '\u05d1\u05e7\u05e9\u05d4 \u05dc\u05d9\u05e6\u05d9\u05e8\u05d4 / \u05e9\u05d9\u05e4\u05d5\u05e8',
  } as Record<AdShareVerdict, string>,
  statuses: {
    open: '\u05e4\u05ea\u05d5\u05d7',
    proposed: '\u05d4\u05d5\u05e6\u05e2 \u05ea\u05d9\u05e7\u05d5\u05df AI',
    applied: '\u05e2\u05d5\u05d3\u05db\u05df \u05d1\u05de\u05d5\u05d3\u05e2\u05d4',
    declined: '\u05e0\u05d3\u05d7\u05d4',
    sent_to_client: '\u05e0\u05e9\u05dc\u05d7 \u05dc\u05dc\u05e7\u05d5\u05d7',
  } as Record<AdShareFeedbackStatus, string>,
};

const EN = {
  verdicts: {
    approved: 'Approved',
    changes_requested: 'Changes requested',
    comment: 'Comment',
    request: 'New request',
  } as Record<AdShareVerdict, string>,
  statuses: {
    open: 'Open',
    proposed: 'AI proposal ready',
    applied: 'Applied to ad',
    declined: 'Declined',
    sent_to_client: 'Sent to client',
  } as Record<AdShareFeedbackStatus, string>,
};

/**
 * Generates a structured Markdown return report summarizing client feedback, per-ad approvals,
 * and open change requests so a marketing manager can review or archive it.
 */
export function buildClientFeedbackReport(params: {
  projectName: string;
  brandName: string;
  generatedAt: string;
  locale: string;
  items: readonly AdShareFeedbackItem[];
}): string {
  const isHe = params.locale.startsWith('he');
  const titleName = params.brandName.trim() || params.projectName;
  const counts = {
    approved: params.items.filter((i) => i.verdict === 'approved').length,
    changes_requested: params.items.filter((i) => i.verdict === 'changes_requested').length,
    comment: params.items.filter((i) => i.verdict === 'comment').length,
    request: params.items.filter((i) => i.verdict === 'request').length,
    open: params.items.filter((i) => i.status === 'open' || i.status === 'proposed').length,
  };

  if (isHe) {
    const lines: string[] = [
      `# ${HE.reportTitle} — ${titleName}`,
      `${HE.project}: ${params.projectName} · ${HE.generatedOn}${params.generatedAt.slice(0, 10)}`,
      '',
      `## ${HE.summary}`,
      `- ${HE.approved}: ${counts.approved} | ${HE.changesRequested}: ${counts.changes_requested} | ${HE.comments}: ${counts.comment} | ${HE.requests}: ${counts.request} | ${HE.openCount}: ${counts.open}`,
      '',
    ];
    if (params.items.length === 0) {
      lines.push(HE.noItems);
      return lines.join('\n');
    }
    for (const item of params.items) {
      const target =
        item.targetKind === 'brief'
          ? `${HE.adTarget}: ${item.briefName || item.briefId || ''}${item.creativeRef ? ` (${item.creativeRef})` : ''}`
          : item.targetKind === 'campaign'
            ? `${HE.campaignTarget}: ${item.campaignLabel || item.campaignId || ''}`
            : HE.generalTarget;
      const author = item.authorName.trim() || item.clientLabel.trim() || HE.clientAnonymous;
      lines.push(`### [${HE.verdicts[item.verdict]}] ${target} — ${author} (${HE.statuses[item.status]})`);
      if (item.comment.trim()) {
        lines.push(`> ${item.comment.trim().replace(/\n+/g, '\n> ')}`);
      }
      lines.push('');
    }
    return lines.join('\n').trimEnd();
  }

  const lines: string[] = [
    `# Client Feedback Return Report — ${titleName}`,
    `Project: ${params.projectName} · Generated ${params.generatedAt.slice(0, 10)}`,
    '',
    '## Summary',
    `- Approved: ${counts.approved} | Changes requested: ${counts.changes_requested} | Comments: ${counts.comment} | Requests: ${counts.request} | Open: ${counts.open}`,
    '',
  ];
  if (params.items.length === 0) {
    lines.push('No client feedback received yet.');
    return lines.join('\n');
  }
  for (const item of params.items) {
    const target =
      item.targetKind === 'brief'
        ? `Ad: ${item.briefName || item.briefId || ''}${item.creativeRef ? ` (${item.creativeRef})` : ''}`
        : item.targetKind === 'campaign'
          ? `Campaign: ${item.campaignLabel || item.campaignId || ''}`
          : 'General request';
    const author = item.authorName.trim() || item.clientLabel.trim() || 'Client';
    lines.push(`### [${EN.verdicts[item.verdict]}] ${target} — ${author} (${EN.statuses[item.status]})`);
    if (item.comment.trim()) {
      lines.push(`> ${item.comment.trim().replace(/\n+/g, '\n> ')}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

export interface ClientFixPromptBriefSnapshot {
  id: string;
  name: string;
  objective: string;
  productDescription: string;
  landingPageUrl: string | null;
  language: string;
  videoInstructions: string | null;
  videoCopy: AdStudioAdCopy | null;
  scenes: readonly { id: string; durationSeconds: number; visualPrompt: string; voiceover: string }[];
  imageConcepts: readonly { id: string; headline: string; visualPrompt: string; copy?: AdStudioAdCopy }[];
  searchAd: AdStudioSearchAd | null;
}

/**
 * Produces an actionable AI fix-agent prompt combining open client comments & requests with the
 * exact current configuration, copy, scenes, image ideas, and search ad context for each brief.
 */
export function buildClientFeedbackFixPrompt(params: {
  projectName: string;
  brandName: string;
  items: readonly AdShareFeedbackItem[];
  briefs: readonly ClientFixPromptBriefSnapshot[];
}): string {
  const actionable = params.items.filter(
    (item) => (item.status === 'open' || item.status === 'proposed') && item.comment.trim().length > 0,
  );
  const titleName = params.brandName.trim() || params.projectName;
  const lines: string[] = [
    `You are the GrowthOS Ad Fix Agent for "${titleName}" (project: ${params.projectName}).`,
    'Update the ad configurations, video scripts, image concepts, and/or search ads below to satisfy every open client request cleanly.',
    '',
    '## Client Feedback & Requests',
  ];

  if (actionable.length === 0) {
    lines.push('- No open client comments or change requests right now.');
  } else {
    actionable.forEach((item, index) => {
      const target =
        item.targetKind === 'brief'
          ? `Brief ${item.briefId ?? ''} ("${item.briefName ?? ''}"${item.creativeRef ? `, creative: ${item.creativeRef}` : ''})`
          : item.targetKind === 'campaign'
            ? `Campaign "${item.campaignLabel ?? item.campaignId ?? ''}"`
            : 'New ad or project-wide request';
      const author = item.authorName.trim() || item.clientLabel.trim() || 'Client';
      lines.push(`${index + 1}. [${item.verdict}] ${target} — ${author}: "${item.comment.trim()}"`);
    });
  }

  const referencedBriefIds = new Set(actionable.map((item) => item.briefId).filter((id): id is string => Boolean(id)));
  const relevantBriefs =
    referencedBriefIds.size === 0 || actionable.some((item) => item.targetKind === 'general' || item.targetKind === 'campaign')
      ? params.briefs
      : params.briefs.filter((brief) => referencedBriefIds.has(brief.id));

  if (relevantBriefs.length > 0) {
    lines.push('', '## Current Ad Context');
    for (const brief of relevantBriefs) {
      lines.push(`### Brief ${brief.id}: ${brief.name} (${brief.language})`);
      lines.push(`- Objective: ${brief.objective}`);
      lines.push(`- Product: ${brief.productDescription}`);
      if (brief.landingPageUrl) lines.push(`- URL: ${brief.landingPageUrl}`);
      if (brief.videoInstructions) lines.push(`- General video directions: ${brief.videoInstructions}`);
      if (brief.videoCopy) {
        lines.push(`- Video copy: headline="${brief.videoCopy.headline}" | primary="${brief.videoCopy.primaryText}"`);
      }
      if (brief.scenes.length > 0) {
        lines.push(`- Video scenes (${brief.scenes.length}):`);
        brief.scenes.forEach((scene, idx) => {
          lines.push(`  - Scene ${idx + 1} (${scene.durationSeconds}s): visual="${scene.visualPrompt}"${scene.voiceover ? ` | voiceover="${scene.voiceover}"` : ''}`);
        });
      }
      if (brief.imageConcepts.length > 0) {
        lines.push(`- Image concepts (${brief.imageConcepts.length}):`);
        brief.imageConcepts.forEach((concept, idx) => {
          lines.push(`  - Idea ${idx + 1}: headline="${concept.headline}" | visual="${concept.visualPrompt}"`);
        });
      }
      if (brief.searchAd && (brief.searchAd.headlines.length > 0 || brief.searchAd.descriptions.length > 0)) {
        lines.push(`- Search ad: headlines=[${brief.searchAd.headlines.join(' | ')}] | descriptions=[${brief.searchAd.descriptions.join(' | ')}]`);
      }
      lines.push('');
    }
  }

  lines.push('Output concrete updates per brief and trigger creative regeneration where needed.');
  return lines.join('\n').trimEnd();
}
