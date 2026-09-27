import { describe, expect, it } from 'vitest';
import { extractLandingPageContent } from './landing-page';

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <title>EasySign &amp; Co - E-signatures for lawyers</title>
  <meta charset="utf-8">
  <meta property="og:description" content="OG fallback">
  <meta content="Sign contracts in 30 seconds &mdash; legally binding." name="description">
  <style>.hero { color: red }</style>
  <script>window.secret = "not text";</script>
</head>
<body>
  <nav><a href="/">Home</a><a href="/pricing">Pricing</a></nav>
  <!-- <h1>Commented out</h1> -->
  <main>
    <h1 class="hero">Sign in <em>30 seconds</em></h1>
    <p>Send, sign and store&nbsp;contracts from your phone.</p>
    <h2>Built for law firms</h2>
    <p>Trusted by 1,200 firms.</p>
    <script type="application/ld+json">{"@type":"Product"}</script>
    <h2>Built for law firms</h2>
  </main>
  <footer>Copyright &#169; 2026 EasySign</footer>
</body>
</html>`;

describe('extractLandingPageContent', () => {
  it('reads the title, meta description, h1/h2 headings and main text, without scripts, styles, nav, footer or comments', () => {
    const page = extractLandingPageContent(PAGE);
    expect(page.title).toBe('EasySign & Co - E-signatures for lawyers');
    expect(page.description).toBe('Sign contracts in 30 seconds - legally binding.');
    expect(page.headings).toEqual(['Sign in 30 seconds', 'Built for law firms']);
    expect(page.text).toBe('Sign in 30 seconds Send, sign and store contracts from your phone. Built for law firms Trusted by 1,200 firms. Built for law firms');
    expect(page.text).not.toMatch(/secret|Pricing|Copyright|Commented|Product/);
    expect(page.truncated).toBe(false);
  });

  it('falls back to og:description and to the whole body when there is no main element', () => {
    const page = extractLandingPageContent('<html><head><meta property="og:description" content="Only OG"></head><body><h2>Hello</h2><div>World &#x21;</div></body></html>');
    expect(page.description).toBe('Only OG');
    expect(page.text).toBe('Hello World !');
  });

  it('caps the text at a word boundary and says so', () => {
    const words = Array.from({ length: 400 }, (_, index) => `word${index}`).join(' ');
    const page = extractLandingPageContent(`<body><p>${words}</p></body>`, 100);
    expect(page.truncated).toBe(true);
    expect(page.text.length).toBeLessThanOrEqual(100);
    expect(page.text.endsWith(' ')).toBe(false);
    expect(words.startsWith(page.text)).toBe(true);
  });

  it('degrades to empty fields on markup it cannot read, never throws', () => {
    expect(extractLandingPageContent('')).toEqual({ title: '', description: '', headings: [], text: '', truncated: false });
    expect(extractLandingPageContent('<body><h1>Unclosed <b>tags').text).toBe('Unclosed tags');
  });
});
