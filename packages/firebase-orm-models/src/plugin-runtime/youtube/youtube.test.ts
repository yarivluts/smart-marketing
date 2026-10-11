import { describe, expect, it, vi } from 'vitest';
import { InvalidYouTubeCredentialSecretError, parseYouTubeCredentialSecret } from './credential-secret';
import { uploadYouTubeVideo, YouTubeUploadError } from './upload-client';

const SECRET = { clientId: 'cid', clientSecret: 'csecret', refreshToken: 'rtoken' };
const BYTES = new Uint8Array([1, 2, 3, 4]);

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('parseYouTubeCredentialSecret', () => {
  it('reads the three fields and rejects anything else', () => {
    expect(parseYouTubeCredentialSecret(' {"clientId":" cid ","clientSecret":"s","refreshToken":"r"} ')).toEqual({ clientId: 'cid', clientSecret: 's', refreshToken: 'r' });
    for (const raw of ['not json', '[]', '{"clientId":"c","clientSecret":"s"}', '{"clientId":"c","clientSecret":"s","refreshToken":" "}']) {
      expect(() => parseYouTubeCredentialSecret(raw)).toThrow(InvalidYouTubeCredentialSecretError);
    }
  });
});

describe('uploadYouTubeVideo', () => {
  it('refreshes the token, opens a resumable session with the metadata, PUTs the bytes and returns the watch URL', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith('https://oauth2.googleapis.com/token')) return json({ access_token: 'atoken' });
      if (url.includes('uploadType=resumable')) return new Response(null, { status: 200, headers: { location: 'https://upload.example/session-1' } });
      return json({ id: 'vid123' }, 201);
    });
    const result = await uploadYouTubeVideo(SECRET, { title: 'Sign in 30 seconds', description: 'desc', privacyStatus: 'unlisted', bytes: BYTES }, fetchImpl);
    expect(result).toEqual({ videoId: 'vid123', url: 'https://www.youtube.com/watch?v=vid123' });

    const [tokenUrl, tokenInit] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    expect(String(tokenInit.body)).toContain('grant_type=refresh_token');
    const [sessionUrl, sessionInit] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(sessionUrl).toBe('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status');
    expect(sessionUrl).not.toContain('atoken');
    expect(sessionInit.headers).toMatchObject({ authorization: 'Bearer atoken', 'x-upload-content-length': '4', 'x-upload-content-type': 'video/mp4' });
    expect(JSON.parse(String(sessionInit.body))).toEqual({
      snippet: { title: 'Sign in 30 seconds', description: 'desc' },
      status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false },
    });
    const [putUrl, putInit] = fetchImpl.mock.calls[2] as unknown as [string, RequestInit];
    expect(putUrl).toBe('https://upload.example/session-1');
    expect(putInit.method).toBe('PUT');
    expect(putInit.body).toBe(BYTES);
  });

  it('maps a failed token refresh to auth_failed, a quota 403 to quota_exceeded, and a missing Location to upload_failed', async () => {
    await expect(uploadYouTubeVideo(SECRET, { title: 't', description: '', privacyStatus: 'private', bytes: BYTES }, async () => json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400))).rejects.toMatchObject({
      code: 'auth_failed',
    });
    const quota = vi.fn(async (url: string) => (url.includes('oauth2') ? json({ access_token: 'a' }) : json({ error: { message: 'quota', errors: [{ reason: 'quotaExceeded' }] } }, 403)));
    await expect(uploadYouTubeVideo(SECRET, { title: 't', description: '', privacyStatus: 'private', bytes: BYTES }, quota)).rejects.toMatchObject({ code: 'quota_exceeded' });
    const noLocation = vi.fn(async (url: string) => (url.includes('oauth2') ? json({ access_token: 'a' }) : new Response(null, { status: 200 })));
    await expect(uploadYouTubeVideo(SECRET, { title: 't', description: '', privacyStatus: 'private', bytes: BYTES }, noLocation)).rejects.toBeInstanceOf(YouTubeUploadError);
  });
});
