import { describe, expect, it } from 'vitest';
import { parseAcquisitionParams } from './parse-acquisition-params';

describe('parseAcquisitionParams', () => {
  it('extracts a Google Ads gclid and classifies it as paid_search', () => {
    const params = parseAcquisitionParams({ url: 'https://example.com/landing?gclid=abc123&utm_campaign=spring_sale' });
    expect(params.clickId).toBe('abc123');
    expect(params.channel).toBe('paid_search');
    expect(params.utmCampaign).toBe('spring_sale');
    expect(params.landingPage).toBe('https://example.com/landing');
  });

  it('extracts a Meta fbclid and classifies it as paid_social, outranking utm_medium', () => {
    const params = parseAcquisitionParams({ url: 'https://example.com/?fbclid=xyz&utm_medium=email' });
    expect(params.clickId).toBe('xyz');
    expect(params.channel).toBe('paid_social');
  });

  it('recognizes msclkid and ttclid too', () => {
    expect(parseAcquisitionParams({ url: 'https://example.com/?msclkid=m1' }).channel).toBe('paid_search');
    expect(parseAcquisitionParams({ url: 'https://example.com/?ttclid=t1' }).channel).toBe('paid_social');
  });

  it('falls back to utm_medium as the channel when no click id is present', () => {
    const params = parseAcquisitionParams({ url: 'https://example.com/?utm_source=newsletter&utm_medium=Email' });
    expect(params.clickId).toBeUndefined();
    expect(params.utmSource).toBe('newsletter');
    expect(params.channel).toBe('email');
  });

  it('classifies a cross-site referrer with no UTM/click params as referral', () => {
    const params = parseAcquisitionParams({ url: 'https://example.com/', referrer: 'https://news.ycombinator.com/' });
    expect(params.channel).toBe('referral');
    expect(params.referrer).toBe('https://news.ycombinator.com/');
  });

  it('classifies a same-site referrer (internal navigation) as direct, not referral', () => {
    const params = parseAcquisitionParams({ url: 'https://example.com/signup', referrer: 'https://example.com/pricing' });
    expect(params.channel).toBe('direct');
    // The referrer is still recorded — only its influence on `channel` is cross-site-gated.
    expect(params.referrer).toBe('https://example.com/pricing');
  });

  it('treats an unparseable referrer as not cross-site rather than throwing', () => {
    const params = parseAcquisitionParams({ url: 'https://example.com/', referrer: 'not-a-url' });
    expect(params.channel).toBe('direct');
  });

  it('classifies a bare visit with no signal at all as direct', () => {
    const params = parseAcquisitionParams({ url: 'https://example.com/' });
    expect(params.channel).toBe('direct');
    expect(params.clickId).toBeUndefined();
    expect(params.utmSource).toBeUndefined();
    expect(params.referrer).toBeUndefined();
  });

  it('treats a whitespace-only query value the same as an absent one', () => {
    const params = parseAcquisitionParams({ url: 'https://example.com/?utm_source=%20%20&gclid=' });
    expect(params.utmSource).toBeUndefined();
    expect(params.clickId).toBeUndefined();
  });

  it('strips the query string and fragment from the landing page', () => {
    const params = parseAcquisitionParams({ url: 'https://example.com/pricing?gclid=abc#compare' });
    expect(params.landingPage).toBe('https://example.com/pricing');
  });
});
