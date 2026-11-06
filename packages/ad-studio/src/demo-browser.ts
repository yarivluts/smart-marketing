import type { DemoBrowserLauncher, DemoClickable, DemoDriver, DemoSnapshot } from './demo-recorder';

/**
 * The walkthrough recorder's browser: the system Chromium (CHROMIUM_PATH, default
 * `/usr/bin/chromium`, installed in the runtime images) driven by `playwright-core`, headless, in a
 * fresh context with no stored state, no service workers and no downloads. Every request goes
 * through the recorder's rule (`allowRequest`). Pictures come from the DevTools screencast.
 */

export const DEFAULT_CHROMIUM_PATH = '/usr/bin/chromium';
const NAVIGATION_TIMEOUT_MS = 30_000;
const SETTLE_TIMEOUT_MS = 8_000;
const CLICK_TIMEOUT_MS = 5_000;
const INDEX_ATTRIBUTE = 'data-growthos-demo-index';

export function chromiumPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.CHROMIUM_PATH?.trim() || DEFAULT_CHROMIUM_PATH;
}

/** Fields that take the username or email, best first. */
const USERNAME_SELECTORS = [
  'input[type="email"]',
  'input[autocomplete="username"]',
  'input[autocomplete="email"]',
  'input[name*="email" i]',
  'input[id*="email" i]',
  'input[name*="user" i]',
  'input[id*="user" i]',
  'input[name*="login" i]',
  'input[id*="login" i]',
  'input[type="text"]',
];
const PASSWORD_SELECTOR = 'input[type="password"]';

/** Collects the page's title, headings and clickable elements, numbering each in the DOM so it can be clicked later. */
function collectSnapshot(indexAttribute: string): Omit<DemoSnapshot, 'url'> {
  const visible = (element: Element) => {
    const box = (element as HTMLElement).getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return box.width > 4 && box.height > 4 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  };
  const text = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const roleOf = (element: Element) => element.getAttribute('role') || (element.tagName === 'A' ? 'link' : element.tagName === 'SUMMARY' ? 'button' : 'button');
  document.querySelectorAll(`[${indexAttribute}]`).forEach((element) => element.removeAttribute(indexAttribute));
  const clickables: DemoClickable[] = [];
  const candidates = document.querySelectorAll('a[href], button, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"]');
  for (const element of Array.from(candidates)) {
    if (clickables.length >= 80) break;
    if (!visible(element) || (element as HTMLButtonElement).disabled) continue;
    const name = text(element.getAttribute('aria-label') || (element as HTMLElement).innerText || element.getAttribute('title'));
    const index = clickables.length + 1;
    element.setAttribute(indexAttribute, String(index));
    const button = element as HTMLButtonElement;
    clickables.push({
      index,
      role: roleOf(element),
      name,
      href: element.tagName === 'A' ? element.getAttribute('href') : null,
      inForm: Boolean(element.closest('form')) || (element.tagName === 'BUTTON' && button.type === 'submit' && Boolean(button.form)),
    });
  }
  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .filter(visible)
    .map((element) => text((element as HTMLElement).innerText))
    .filter(Boolean)
    .slice(0, 15);
  return { title: text(document.title), headings, clickables };
}

/** Stops every form submission and text entry on the page (installed after sign-in). */
function lockPage(): void {
  const block = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  window.addEventListener('submit', block, true);
  window.addEventListener('beforeinput', block, true);
  window.addEventListener('keydown', (event) => {
    if (event.key.length === 1 || event.key === 'Enter' || event.key === 'Backspace' || event.key === 'Delete') block(event);
  }, true);
}

export function createPlaywrightDemoLauncher(env: NodeJS.ProcessEnv = process.env): DemoBrowserLauncher {
  return async (options) => {
    // Loaded on first use: pages that never record do not pay for it.
    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({
      executablePath: chromiumPath(env),
      headless: true,
      // The runtime image runs as root, where Chromium's sandbox cannot start.
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--mute-audio', '--no-first-run', '--disable-extensions', '--disable-background-networking'],
    });
    try {
      const context = await browser.newContext({
        viewport: options.viewport,
        deviceScaleFactor: 1,
        locale: options.locale,
        serviceWorkers: 'block',
        acceptDownloads: false,
        bypassCSP: false,
        javaScriptEnabled: true,
      });
      await context.route('**/*', async (route) => {
        const request = route.request();
        const isNavigation = request.isNavigationRequest() && request.frame() === request.frame().page().mainFrame();
        const allowed = await options.allowRequest({ url: request.url(), method: request.method(), isNavigation }).catch(() => false);
        await (allowed ? route.continue() : route.abort('blockedbyclient')).catch(() => undefined);
      });
      // WebSockets bypass `route`, so they get the same address rule (wss checked as https; plain ws never).
      await context.routeWebSocket(/.*/, async (socket) => {
        const target = socket.url().replace(/^wss:/i, 'https:');
        const allowed = target.startsWith('https:') && (await options.allowRequest({ url: target, method: 'GET', isNavigation: false }).catch(() => false));
        if (allowed) socket.connectToServer();
        else await socket.close().catch(() => undefined);
      });
      const page = await context.newPage();
      // New tabs and windows are never followed.
      context.on('page', (opened) => {
        if (opened !== page) void opened.close().catch(() => undefined);
      });
      page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);
      page.on('dialog', (dialog) => void dialog.dismiss().catch(() => undefined));
      let cdp: Awaited<ReturnType<typeof context.newCDPSession>> | null = null;

      const settle = async () => {
        await page.waitForLoadState('domcontentloaded', { timeout: SETTLE_TIMEOUT_MS }).catch(() => undefined);
        await page.waitForLoadState('networkidle', { timeout: SETTLE_TIMEOUT_MS }).catch(() => undefined);
      };
      const firstVisible = async (selectors: readonly string[]) => {
        for (const selector of selectors) {
          const locator = page.locator(selector).filter({ visible: true }).first();
          if ((await locator.count()) > 0) return locator;
        }
        return null;
      };

      const driver: DemoDriver = {
        async open(url) {
          try {
            const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
            await settle();
            return Boolean(response) && (response?.status() ?? 500) < 400;
          } catch {
            return false;
          }
        },
        url: () => page.url(),
        async login({ username, password }) {
          let passwordField = await firstVisible([PASSWORD_SELECTOR]);
          const usernameField = await firstVisible(USERNAME_SELECTORS);
          if (!passwordField && !usernameField) return 'no_form';
          if (usernameField) await usernameField.fill(username, { timeout: CLICK_TIMEOUT_MS });
          if (!passwordField) {
            // A two-step sign-in: the username first, then the password on the next screen.
            await usernameField?.press('Enter', { timeout: CLICK_TIMEOUT_MS });
            await settle();
            passwordField = await firstVisible([PASSWORD_SELECTOR]);
            if (!passwordField) return 'no_form';
          }
          await passwordField.fill(password, { timeout: CLICK_TIMEOUT_MS });
          await passwordField.press('Enter', { timeout: CLICK_TIMEOUT_MS });
          await page.waitForLoadState('load', { timeout: NAVIGATION_TIMEOUT_MS }).catch(() => undefined);
          await settle();
          return 'submitted';
        },
        async passwordFieldVisible() {
          return (await firstVisible([PASSWORD_SELECTOR])) !== null;
        },
        async lockForms() {
          await context.addInitScript(lockPage);
          await page.evaluate(lockPage).catch(() => undefined);
        },
        async snapshot() {
          const collected = await page.evaluate(collectSnapshot, INDEX_ATTRIBUTE).catch(() => ({ title: '', headings: [], clickables: [] }));
          return { url: page.url(), ...collected };
        },
        async click(index) {
          const target = page.locator(`[${INDEX_ATTRIBUTE}="${index}"]`).first();
          try {
            if ((await target.count()) === 0) return false;
            // A link that would open a new tab opens here instead.
            await target.evaluate((element) => element.removeAttribute('target')).catch(() => undefined);
            await target.scrollIntoViewIfNeeded({ timeout: CLICK_TIMEOUT_MS });
            await target.click({ timeout: CLICK_TIMEOUT_MS });
            return true;
          } catch {
            return false;
          }
        },
        settle,
        async scroll(pixels, durationMs) {
          const steps = Math.max(1, Math.round(durationMs / 50));
          await page.mouse.move(options.viewport.width / 2, options.viewport.height / 2).catch(() => undefined);
          for (let step = 0; step < steps; step += 1) {
            await page.mouse.wheel(0, pixels / steps).catch(() => undefined);
            await page.waitForTimeout(durationMs / steps);
          }
        },
        async startCapture(onFrame) {
          cdp = await context.newCDPSession(page);
          const session = cdp;
          session.on('Page.screencastFrame', (frame: { data: string; sessionId: number }) => {
            onFrame(Buffer.from(frame.data, 'base64'));
            void session.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => undefined);
          });
          await session.send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: options.viewport.width, maxHeight: options.viewport.height, everyNthFrame: 1 });
        },
        async stopCapture() {
          await cdp?.send('Page.stopScreencast').catch(() => undefined);
        },
        async close() {
          await browser.close().catch(() => undefined);
        },
      };
      return driver;
    } catch (error) {
      await browser.close().catch(() => undefined);
      throw error;
    }
  };
}
