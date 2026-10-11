import type { YouTubeCredentialSecret } from './credential-secret';

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

export const YOUTUBE_PRIVACY_STATUSES = ['private', 'unlisted', 'public'] as const;
export type YouTubePrivacyStatus = (typeof YOUTUBE_PRIVACY_STATUSES)[number];

/** Why a YouTube upload failed, as a stable code (the message keeps the API's own words for the log). */
export type YouTubeUploadErrorCode = 'auth_failed' | 'quota_exceeded' | 'rejected' | 'upload_failed';

export class YouTubeUploadError extends Error {
  constructor(
    public readonly code: YouTubeUploadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'YouTubeUploadError';
  }
}

export interface YouTubeUploadInput {
  title: string;
  description: string;
  privacyStatus: YouTubePrivacyStatus;
  /** Declares the video not made for kids - required by YouTube for every upload; ads are never made for kids here. */
  madeForKids?: false;
  bytes: Uint8Array;
  mimeType?: string;
}

export interface YouTubeUploadResult {
  videoId: string;
  url: string;
}

async function readError(response: Response): Promise<{ message: string; reason: string | null }> {
  const body = (await response.json().catch(() => ({}))) as { error?: { message?: string; errors?: { reason?: string }[] } | string; error_description?: string };
  if (typeof body.error === 'string') return { message: body.error_description ?? body.error, reason: body.error };
  return { message: body.error?.message ?? `HTTP ${response.status}`, reason: body.error?.errors?.[0]?.reason ?? null };
}

/** Exchanges the refresh token for a short-lived access token. The token lives only in memory. */
export async function refreshYouTubeAccessToken(secret: YouTubeCredentialSecret, fetchImpl: FetchLike = fetch): Promise<string> {
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: secret.clientId, client_secret: secret.clientSecret, refresh_token: secret.refreshToken, grant_type: 'refresh_token' }).toString(),
  });
  if (!response.ok) {
    const { message } = await readError(response);
    throw new YouTubeUploadError('auth_failed', `Could not refresh the YouTube access token: ${message}`);
  }
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new YouTubeUploadError('auth_failed', 'The token endpoint returned no access token.');
  return body.access_token;
}

function codeFor(status: number, reason: string | null): YouTubeUploadErrorCode {
  if (status === 401) return 'auth_failed';
  if (status === 403 && (reason === 'quotaExceeded' || reason === 'uploadLimitExceeded')) return 'quota_exceeded';
  if (status === 403 || status === 400) return 'rejected';
  return 'upload_failed';
}

/**
 * Uploads a video with the YouTube Data API v3 resumable protocol: one POST opens the session with
 * the metadata (the Location header is the upload URL), one PUT sends the bytes, and 200/201 returns
 * the video resource. A 60-second ad is small enough for a single PUT.
 */
export async function uploadYouTubeVideo(secret: YouTubeCredentialSecret, input: YouTubeUploadInput, fetchImpl: FetchLike = fetch): Promise<YouTubeUploadResult> {
  const accessToken = await refreshYouTubeAccessToken(secret, fetchImpl);
  const mimeType = input.mimeType ?? 'video/mp4';
  const session = await fetchImpl(UPLOAD_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-length': String(input.bytes.byteLength),
      'x-upload-content-type': mimeType,
    },
    body: JSON.stringify({
      snippet: { title: input.title.slice(0, 100), description: input.description.slice(0, 5000) },
      status: { privacyStatus: input.privacyStatus, selfDeclaredMadeForKids: input.madeForKids ?? false },
    }),
  });
  if (!session.ok) {
    const { message, reason } = await readError(session);
    throw new YouTubeUploadError(codeFor(session.status, reason), message);
  }
  const uploadUrl = session.headers.get('location');
  if (!uploadUrl) throw new YouTubeUploadError('upload_failed', 'YouTube did not return an upload URL.');

  const upload = await fetchImpl(uploadUrl, {
    method: 'PUT',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': mimeType, 'content-length': String(input.bytes.byteLength) },
    body: input.bytes,
  });
  if (upload.status !== 200 && upload.status !== 201) {
    const { message, reason } = await readError(upload);
    throw new YouTubeUploadError(codeFor(upload.status, reason), message);
  }
  const video = (await upload.json()) as { id?: string };
  if (!video.id) throw new YouTubeUploadError('upload_failed', 'YouTube returned no video id.');
  return { videoId: video.id, url: `https://www.youtube.com/watch?v=${video.id}` };
}
