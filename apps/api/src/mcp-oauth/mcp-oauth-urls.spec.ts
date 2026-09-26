import { apiBaseUrl, assertPublicUrlsConfigured } from './mcp-oauth-urls';

const PROD_URLS = {
  GROWTHOS_API_BASE_URL: 'https://api-prod-1098891924957.me-west1.run.app',
  GROWTHOS_WEB_APP_URL: 'https://web-prod-1098891924957.me-west1.run.app',
};

describe('assertPublicUrlsConfigured', () => {
  it('lets dev (or an unset environment) run on the localhost defaults', () => {
    expect(() => assertPublicUrlsConfigured({})).not.toThrow();
    expect(() => assertPublicUrlsConfigured({ GROWTHOS_ENV: 'dev' })).not.toThrow();
  });

  it('refuses to start prod without its public URLs - the state prod actually ran in', () => {
    expect(() => assertPublicUrlsConfigured({ GROWTHOS_ENV: 'prod' })).toThrow(
      'GROWTHOS_ENV=prod needs its public URLs: GROWTHOS_API_BASE_URL is not set; GROWTHOS_WEB_APP_URL is not set.',
    );
  });

  it('refuses a deployed environment whose URLs point at localhost', () => {
    expect(() => assertPublicUrlsConfigured({ GROWTHOS_ENV: 'staging', ...PROD_URLS, GROWTHOS_API_BASE_URL: 'http://localhost:3001' })).toThrow(
      'GROWTHOS_API_BASE_URL points at http://localhost:3001',
    );
    expect(() => assertPublicUrlsConfigured({ GROWTHOS_ENV: 'prod', ...PROD_URLS, GROWTHOS_WEB_APP_URL: 'http://127.0.0.1:3000' })).toThrow('GROWTHOS_WEB_APP_URL');
  });

  it('accepts a deployed environment with real public URLs', () => {
    expect(() => assertPublicUrlsConfigured({ GROWTHOS_ENV: 'prod', ...PROD_URLS })).not.toThrow();
  });

  it('does not mistake a host that merely starts with "localhost" for localhost', () => {
    expect(() => assertPublicUrlsConfigured({ GROWTHOS_ENV: 'prod', ...PROD_URLS, GROWTHOS_API_BASE_URL: 'https://localhostel.example.com' })).not.toThrow();
  });
});

describe('apiBaseUrl', () => {
  it('reads GROWTHOS_API_BASE_URL', () => {
    const previous = process.env.GROWTHOS_API_BASE_URL;
    process.env.GROWTHOS_API_BASE_URL = PROD_URLS.GROWTHOS_API_BASE_URL;
    try {
      expect(apiBaseUrl()).toBe(PROD_URLS.GROWTHOS_API_BASE_URL);
    } finally {
      if (previous === undefined) delete process.env.GROWTHOS_API_BASE_URL;
      else process.env.GROWTHOS_API_BASE_URL = previous;
    }
  });
});
