import { createTranslator } from 'next-intl';
import { isSafePushUrl, type PushEventSource, type PushPayload } from '@growthos/shared';
import { routing, type AppLocale } from '@/i18n/routing';

/**
 * The words of a push notification, in the language the receiving browser subscribed in. Built
 * outside a request (the scheduler sends most of them), so it reads the message files directly.
 */

type Messages = Record<string, unknown>;

/** The message files are loaded at run time, so keys are checked by the wording tests rather than by types. */
interface LooseTranslator {
  (key: string, values?: Record<string, string | number>): string;
  has: (key: string) => boolean;
}

async function translator(locale: AppLocale): Promise<LooseTranslator> {
  return createTranslator({ locale, messages: (await messagesFor(locale)) as never, namespace: 'PushNotifications' as never }) as unknown as LooseTranslator;
}

const loaded = new Map<AppLocale, Promise<Messages>>();

function messagesFor(locale: AppLocale): Promise<Messages> {
  let messages = loaded.get(locale);
  if (!messages) {
    messages = (locale === 'he' ? import('@/messages/he.json') : import('@/messages/en.json')).then((module) => module.default as Messages);
    loaded.set(locale, messages);
  }
  return messages;
}

export function pushLocale(value: string | null | undefined): AppLocale {
  return (routing.locales as readonly string[]).includes(value ?? '') ? (value as AppLocale) : routing.defaultLocale;
}

export interface PushEventWording {
  source: PushEventSource;
  kind: string;
  organizationId: string;
  projectId: string;
  projectName: string;
  subject: string | null;
  count: number | null;
  briefId: string | null;
  /** The Growth Pilot target the event is about: the notification opens its details page. */
  targetId?: string | null;
}

/** Where a notification about this event opens. */
export function pushEventPath(locale: AppLocale, event: Pick<PushEventWording, 'source' | 'organizationId' | 'projectId' | 'briefId' | 'targetId'>): string {
  const project = `/${locale}/orgs/${encodeURIComponent(event.organizationId)}/projects/${encodeURIComponent(event.projectId)}`;
  if (event.source === 'ad_studio') {
    return event.briefId ? `${project}/ad-studio?brief=${encodeURIComponent(event.briefId)}` : `${project}/ad-studio`;
  }
  return event.targetId ? `${project}/growth-pilot/targets/${encodeURIComponent(event.targetId)}` : `${project}/growth-pilot`;
}

/** The notification for one product event, in `locale`. */
export async function buildEventPayload(localeInput: string | null | undefined, event: PushEventWording): Promise<PushPayload> {
  const locale = pushLocale(localeInput);
  const t = await translator(locale);
  const key = `events.${event.source}.${event.kind}` as const;
  const values = { project: event.projectName, subject: event.subject ?? '', count: event.count ?? 0 };
  const url = pushEventPath(locale, event);
  return {
    // `t.has` keeps an event without its own wording readable instead of showing a message key.
    title: t.has(`${key}.title`) ? t(`${key}.title`, values) : t('fallback.title', values),
    body: t.has(`${key}.body`) ? t(`${key}.body`, values) : t('fallback.body', values),
    url: isSafePushUrl(url) ? url : `/${locale}/dashboard`,
    tag: `${event.source}:${event.projectId}:${event.kind}:${event.subject ?? event.briefId ?? ''}`.slice(0, 120),
  };
}

/** The "it works" notification from the settings page. */
export async function buildTestPayload(localeInput: string | null | undefined): Promise<PushPayload> {
  const locale = pushLocale(localeInput);
  const t = await translator(locale);
  return { title: t('testNotification.title'), body: t('testNotification.body'), url: `/${locale}/dashboard/notifications`, tag: 'growthos-test' };
}
