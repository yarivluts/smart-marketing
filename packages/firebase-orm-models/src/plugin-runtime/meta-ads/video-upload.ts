import { META_API_VERSION } from './api-client';

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Graph API version for ad video uploads - the same version as every other Meta call. */
export const META_VIDEO_API_VERSION = META_API_VERSION;

export type MetaVideoUploadErrorCode = 'auth_failed' | 'rejected' | 'upload_failed';

export class MetaVideoUploadError extends Error {
  constructor(
    public readonly code: MetaVideoUploadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MetaVideoUploadError';
  }
}

export interface MetaAdVideoUploadInput {
  accessToken: string;
  /** Ad account id without the `act_` prefix. */
  adAccountId: string;
  title: string;
  description: string;
  bytes: Uint8Array;
  fileName?: string;
}

export interface MetaAdVideoUploadResult {
  videoId: string;
  /** Where the uploaded video can be found: the ad account's media library in Ads Manager. */
  url: string;
}

/**
 * Uploads a video to an ad account's video library (`POST /act_{id}/advideos`, multipart `source`),
 * from where it can be used in any video ad. A 60-second ad is well within a single non-chunked
 * upload. The access token is sent as a form field over HTTPS and never logged.
 */
export async function uploadMetaAdVideo(input: MetaAdVideoUploadInput, fetchImpl: FetchLike = fetch): Promise<MetaAdVideoUploadResult> {
  const form = new FormData();
  form.append('access_token', input.accessToken);
  form.append('title', input.title.slice(0, 255));
  form.append('name', input.title.slice(0, 255));
  form.append('description', input.description);
  form.append('source', new Blob([input.bytes], { type: 'video/mp4' }), input.fileName ?? 'ad.mp4');

  const response = await fetchImpl(`https://graph-video.facebook.com/${META_VIDEO_API_VERSION}/act_${input.adAccountId}/advideos`, { method: 'POST', body: form });
  const body = (await response.json().catch(() => ({}))) as { id?: string; error?: { message?: string; code?: number } };
  if (!response.ok || !body.id) {
    const message = body.error?.message ?? `HTTP ${response.status}`;
    const code: MetaVideoUploadErrorCode = response.status === 401 || body.error?.code === 190 ? 'auth_failed' : response.status >= 400 && response.status < 500 ? 'rejected' : 'upload_failed';
    throw new MetaVideoUploadError(code, message);
  }
  return { videoId: body.id, url: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${input.adAccountId}` };
}
