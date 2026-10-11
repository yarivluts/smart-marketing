// Real end-to-end Ad Studio usage on prod, recorded: plan -> confirm -> create (real Gemini images and
// Omni video) -> review -> publish a PAUSED Google Display ad (and Meta when connected). One locale per run.
// Usage (from apps/web): PW=... node <this> en|he
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const locale = process.argv[2] ?? 'en';
const BASE = 'https://web-prod-1098891924957.me-west1.run.app';
const ORG = 'JGTxet9aGXV6xUPWYidR';
const PROJECT = 'LYierelkF0eKnLmIrS9u';
const OUT = `C:/Users/yariv/Downloads/growthos-ad-real/${locale}`;
fs.mkdirSync(OUT, { recursive: true });
const M = JSON.parse(fs.readFileSync(`C:/www/sm-ad-export/apps/web/messages/${locale}.json`, 'utf8')).AdStudio;
const BRIEF_NAME = { en: 'EasySign - sign in 30 seconds', he: 'איזי סיין - חתימה ב-30 שניות' }[locale];
const COPY = {
  en: {
    campaign: 'EasySign - sign in 30 seconds - Display',
    headline: 'Sign in 30 seconds',
    primary: 'Legally binding e-signatures from any phone. Try EasySign free.',
    description: 'Templates, audit trail and reminders. Start free today.',
    business: 'EasySign',
  },
  he: {
    campaign: 'איזי סיין - חתימה ב-30 שניות - דיספליי',
    headline: 'חתימה דיגיטלית ב-30 שניות',
    primary: 'חתימה דיגיטלית מחייבת מכל טלפון. נסו את איזי סיין בחינם.',
    description: 'תבניות, תיעוד מלא ותזכורות. מתחילים בחינם היום.',
    business: 'איזי סיין',
  },
}[locale];

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), locale, ...a);
let shot = 0;
async function snap(page, name) {
  shot += 1;
  const file = `${OUT}/${String(shot).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  log('shot', file);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: locale === 'he' ? 'he-IL' : 'en-US',
  recordVideo: { dir: `${OUT}/video`, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
page.setDefaultTimeout(120000);
const result = { locale, briefId: null, published: [], errors: [] };
try {
  await page.goto(`${BASE}/${locale}/login`);
  await page.fill('#email', 'yariv.luts+growthos-easysign-screens@gmail.com');
  await page.fill('#password', process.env.PW);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.endsWith('/login'));
  await context.addCookies([{ name: `gos_env_${PROJECT}`, value: 'prod', domain: new URL(BASE).hostname, path: '/' }]);

  const base = `${BASE}/${locale}/orgs/${ORG}/projects/${PROJECT}/ad-studio`;
  await page.goto(base, { waitUntil: 'networkidle' });
  const list = await page.evaluate(async (url) => (await fetch(url)).json(), `/api/orgs/${ORG}/projects/${PROJECT}/ad-studio/briefs`);
  const brief = (list.briefs ?? list).find((b) => b.name === BRIEF_NAME);
  if (!brief) throw new Error(`brief not found: ${BRIEF_NAME}`);
  result.briefId = brief.id;
  log('brief', brief.id);

  // Step 1: the brief.
  await page.goto(`${base}?brief=${brief.id}&step=brief`, { waitUntil: 'networkidle' });
  await snap(page, 'step1-brief');

  // Step 2: prepare the plan. Add the landscape placement so the Google Display ad has a true 1.91:1 source.
  await page.goto(`${base}?brief=${brief.id}&step=plan`, { waitUntil: 'networkidle' });
  const landscape = page.getByRole('button', { name: M.images.format.landscape, exact: true }).first();
  if ((await landscape.getAttribute('aria-pressed')) !== 'true') await landscape.click();
  await snap(page, 'step2-plan-options');
  const start = page.getByRole('button', { name: new RegExp(`^(${M.autopilot.prepare}|${M.autopilot.runAgain})$`) }).first();
  await start.click();
  log('preparing the plan');
  await page.getByTestId('ad-studio-confirm-plan').waitFor({ timeout: 15 * 60 * 1000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  await snap(page, 'step2-plan-ready-for-confirmation');

  // Confirm the plan: renders start only now.
  await page.getByRole('button', { name: M.autopilot.confirmPlan }).click();
  await page.waitForURL(/step=create/, { timeout: 120000 });
  log('plan confirmed; creating');
  await page.waitForTimeout(8000);
  await snap(page, 'step3-create-started');
  const createDeadline = Date.now() + 60 * 60 * 1000;
  let lastShot = Date.now();
  while (!/step=review/.test(page.url()) && Date.now() < createDeadline) {
    await page.waitForTimeout(15000);
    if (Date.now() - lastShot > 5 * 60 * 1000) {
      await snap(page, 'step3-create-progress');
      lastShot = Date.now();
    }
    const failed = await page.getByText(M.autopilot.runStatus.failed).first().isVisible().catch(() => false);
    if (failed) {
      await snap(page, 'step3-create-failed');
      result.errors.push('autopilot failed during create');
      break;
    }
  }
  if (!/step=review/.test(page.url())) await page.goto(`${base}?brief=${brief.id}&step=review`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(4000);
  await snap(page, 'step4-review');

  // Step 5: publish. Google Display from an image; Meta (image, then the video) when connected.
  await page.goto(`${base}?brief=${brief.id}&step=publish`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await snap(page, 'step5-publish');
  const panel = page.getByTestId('ad-studio-publish');
  async function publish(destination, creativeKey) {
    const label = M.publish.destination[destination];
    await panel.getByRole('radio', { name: new RegExp(label) }).click();
    if (creativeKey) await panel.locator(`[data-testid="ad-studio-publish-creative-${creativeKey}"] input`).check({ force: true });
    await panel.getByLabel(M.publish.campaignName).fill(`${COPY.campaign}${destination === 'meta' ? ' - Meta' : ''}${creativeKey === 'video' ? ' - video' : ''}`);
    await panel.getByLabel(M.publish.headline).fill(COPY.headline);
    await panel.getByLabel(M.publish.primaryText).fill(COPY.primary);
    await panel.getByLabel(M.publish.descriptionLabel).fill(COPY.description);
    if (destination === 'google_ads') {
      await panel.getByLabel(M.publish.businessName).fill(COPY.business);
      await panel.getByLabel(M.publish.euNo).check();
    } else {
      await panel.getByLabel(M.publish.countries).fill('IL');
    }
    const create = panel.getByRole('button', { name: M.publish.create.replace('{destination}', label) });
    if (await create.isDisabled()) {
      result.errors.push(`${destination}${creativeKey ? `/${creativeKey}` : ''}: publish button disabled`);
      await snap(page, `step5-${destination}-disabled`);
      return;
    }
    await snap(page, `step5-${destination}${creativeKey === 'video' ? '-video' : ''}-filled`);
    await create.click();
    await page.getByRole('status').waitFor({ timeout: 5 * 60 * 1000 });
    await page.waitForTimeout(1500);
    await snap(page, `step5-${destination}${creativeKey === 'video' ? '-video' : ''}-result`);
    const statusText = await page.getByRole('status').innerText();
    const href = await page.getByRole('status').getByRole('link').getAttribute('href').catch(() => null);
    result.published.push({ destination, creative: creativeKey ?? 'first-image', status: statusText, link: href });
    log('published', destination, href ?? statusText);
  }
  await publish('google_ads', null);
  const metaConnected = !(await panel.getByRole('radio', { name: new RegExp(M.publish.destination.meta) }).innerText()).includes(M.publish.notConnected);
  if (metaConnected) {
    await publish('meta', null);
    const hasVideo = await panel.locator('[data-testid="ad-studio-publish-creative-video"]').count();
    if (hasVideo) await publish('meta', 'video');
  } else {
    result.errors.push('meta not connected');
  }
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await snap(page, 'step5-published-list');
} catch (error) {
  result.errors.push(String(error).slice(0, 400));
  await snap(page, 'error').catch(() => {});
} finally {
  await context.close();
  await browser.close();
  fs.writeFileSync(`${OUT}/result.json`, JSON.stringify(result, null, 2));
  log('RESULT', JSON.stringify(result));
}
