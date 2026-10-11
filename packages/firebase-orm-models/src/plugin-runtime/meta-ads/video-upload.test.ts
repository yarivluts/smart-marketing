import { describe, expect, it, vi } from 'vitest';
import { MetaVideoUploadError, META_VIDEO_API_VERSION, uploadMetaAdVideo } from './video-upload';

const INPUT = { accessToken: 'secret-token', adAccountId: '58689695', title: 'Sign in 30 seconds', description: 'For lawyers', bytes: new Uint8Array([9, 9, 9]) };

describe('uploadMetaAdVideo', () => {
  it("posts the video as multipart source to the ad account's video library and returns its id", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: '120210000000001' }), { status: 200 }));
    const result = await uploadMetaAdVideo(INPUT, fetchImpl);
    expect(result).toEqual({ videoId: '120210000000001', url: 'https://adsmanager.facebook.com/adsmanager/manage/ads?act=58689695' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://graph-video.facebook.com/${META_VIDEO_API_VERSION}/act_58689695/advideos`);
    expect(url).not.toContain('secret-token');
    const form = init.body as FormData;
    expect(form.get('title')).toBe('Sign in 30 seconds');
    expect(form.get('description')).toBe('For lawyers');
    expect(form.get('access_token')).toBe('secret-token');
    const source = form.get('source') as File;
    expect(source.size).toBe(3);
    expect(source.type).toBe('video/mp4');
  });

  it('maps an expired token (code 190) to auth_failed, other 4xx to rejected, 5xx to upload_failed', async () => {
    const reply = (status: number, error: unknown) => async () => new Response(JSON.stringify({ error }), { status });
    await expect(uploadMetaAdVideo(INPUT, reply(400, { message: 'Error validating access token', code: 190 }))).rejects.toMatchObject({ code: 'auth_failed' });
    await expect(uploadMetaAdVideo(INPUT, reply(400, { message: 'Invalid parameter', code: 100 }))).rejects.toMatchObject({ code: 'rejected', message: 'Invalid parameter' });
    await expect(uploadMetaAdVideo(INPUT, reply(503, { message: 'Service unavailable' }))).rejects.toBeInstanceOf(MetaVideoUploadError);
  });
});
