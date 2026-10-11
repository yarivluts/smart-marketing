// Recorded: GrowthOS's own Publish step creating PAUSED Meta ads (an image ad, then the video ad) for one
// locale's brief on prod. Usage (from apps/web): PW=... node <this> en|he
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const locale = process.argv[2] ?? 'en';
const BASE = 'https://web-prod-1098891924957.me-west1.run.app';
const ORG = 'JGTxet9aGXV6xUPWYidR';
const PROJECT = 'LYierelkF0eKnLmIrS9u';
const BRIEF = { en: '8gLLDovn22AUteZAzv2E', he: 'lKqEhNw9pr0W0qOWE5aV' }[locale];
const OUT = `C:/Users/yariv/Downloads/growthos-ad-real/${locale}-meta`;
fs.mkdirSync(OUT, { recursive: true });
const M = JSON.parse(fs.readFileSync(`C:/www/sm-ad-export/apps/web/messages/${locale}.json`, 'utf8')).AdStudio;
const COPY = {
  en: { campaign: 'EasySign - sign in 30 seconds', headline: 'Sign in 30 seconds', primary: 'Legally binding e-signatures from any phone. Try EasySign free.', description: 'Templates, audit trail and reminders. Start free today.' },
  he: { campaign: 'איזי סיין - חתימה ב-30 שניות', headline: 'חתימה דיגיטלית ב-30 שניות', primary: 'חתימה דיגיטלית מחייבת מכל טלפון. נסו את איזי סיין בחינם.', description: 'תבניות, תיעוד מלא ותזכורות. מתחילים בחינם היום.' },
}[locale];

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), locale, ...a);
let shot = 0;
async function snap(page, name) {
  shot += 1;
  await page.screenshot({ path: `${OUT}/${String(shot).padStart(2, '0')}-${name}.png`, fullPage: true });
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: locale === 'he' ? 'he-IL' : 'en-US', recordVideo: { dir: `${OUT}/video`, size: { width: 1440, height: 900 } } });
const page = await context.newPage();
page.setDefaultTimeout(120000);
const result = { locale, published: [], errors: [] };
try {
  await page.goto(`${BASE}/${locale}/login`);
  await page.fill('#email', 'yariv.luts+growthos-easysign-screens@gmail.com');
  await page.fill('#password', process.env.PW);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.endsWith('/login'));
  await context.addCookies([{ name: `gos_env_${PROJECT}`, value: 'prod', domain: new URL(BASE).hostname, path: '/' }]);
  await page.goto(`${BASE}/${locale}/orgs/${ORG}/projects/${PROJECT}/ad-studio?brief=${BRIEF}&step=publish`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await snap(page, 'publish-step');

  const panel = page.getByTestId('ad-studio-publish');
  const metaLabel = M.publish.destination.meta;
  for (const [kind, key] of [['image', null], ['video', 'video']]) {
    await panel.getByRole('radio', { name: new RegExp(metaLabel) }).click();
    if (key) await panel.locator(`[data-testid="ad-studio-publish-creative-${key}"] input`).check({ force: true });
    else await panel.locator('[data-testid^="ad-studio-publish-creative-"] input').first().check({ force: true });
    await panel.getByLabel(M.publish.campaignName).fill(`${COPY.campaign} - Meta ${kind}`);
    await panel.getByLabel(M.publish.headline).fill(COPY.headline);
    await panel.getByLabel(M.publish.primaryText).fill(COPY.primary);
    await panel.getByLabel(M.publish.descriptionLabel).fill(COPY.description);
    await panel.getByLabel(M.publish.countries).fill('IL');
    const create = panel.getByRole('button', { name: M.publish.create.replace('{destination}', metaLabel) });
    if (await create.isDisabled()) {
      result.errors.push(`${kind}: publish button disabled`);
      await snap(page, `meta-${kind}-disabled`);
      continue;
    }
    await snap(page, `meta-${kind}-filled`);
    await create.click();
    await page.getByRole('status').waitFor({ timeout: 10 * 60 * 1000 });
    await page.waitForTimeout(1500);
    await snap(page, `meta-${kind}-result`);
    const status = await page.getByRole('status').innerText();
    const link = await page.getByRole('status').getByRole('link').getAttribute('href').catch(() => null);
    result.published.push({ kind, status, link });
    log('meta', kind, link ?? status);
  }
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await snap(page, 'published-list');
} catch (error) {
  result.errors.push(String(error).slice(0, 400));
  await snap(page, 'error').catch(() => {});
} finally {
  await context.close();
  await browser.close();
  fs.writeFileSync(`${OUT}/result.json`, JSON.stringify(result, null, 2));
  log('RESULT', JSON.stringify(result));
}
