// Reproduce the blank-dashboard report against the deployed dev site.
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'https://web-dev-1098891924957.me-west1.run.app';
const EMAIL = 'claude-e2e-test@example.com';
const PASSWORD = 'Test12345!';

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleMsgs = [];
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) consoleMsgs.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => consoleMsgs.push(`[pageerror] ${e.message}`));
const failedReqs = [];
page.on('requestfailed', (r) => failedReqs.push(`${r.method()} ${r.url()} -> ${r.failure()?.errorText}`));
page.on('response', (r) => {
  if (r.status() >= 400) failedReqs.push(`${r.request().method()} ${r.url()} -> HTTP ${r.status()}`);
});

console.log('== open /en/login ==');
await page.goto(`${BASE}/en/login`, { waitUntil: 'networkidle', timeout: 60000 });
console.log('title:', await page.title());

// Fill the email/password form (find inputs generically).
const emailInput = page.locator('input[type="email"], input[name="email"]').first();
const passInput = page.locator('input[type="password"]').first();
await emailInput.fill(EMAIL);
await passInput.fill(PASSWORD);
const submit = page.locator('button[type="submit"]').first();
await submit.click();

console.log('== wait for post-login navigation ==');
await page.waitForTimeout(8000);
console.log('url now:', page.url());

// Go to dashboard explicitly.
await page.goto(`${BASE}/en/dashboard`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(5000);
console.log('== dashboard state ==');
console.log('url:', page.url());
console.log('title:', await page.title());
const bodyText = (await page.locator('body').innerText()).trim();
console.log('body text (first 300):', JSON.stringify(bodyText.slice(0, 300)));
console.log('body html length:', (await page.content()).length);

console.log('== console errors/warnings ==');
consoleMsgs.forEach((m) => console.log(m));
console.log('== failed requests ==');
failedReqs.forEach((m) => console.log(m));

await page.screenshot({ path: process.env.SCREENSHOT ?? 'dashboard-repro.png', fullPage: true });
await browser.close();
