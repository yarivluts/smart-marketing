import 'server-only';
import {
  getAdStudioBrief,
  isGrowthPilotBrief,
  listProjectNotificationRecipients,
  ProjectModel,
  setActivityEventListener,
  type ActivityEvent,
} from '@growthos/firebase-orm-models';
import { pushCategoryForEvent } from '@growthos/shared';
import { resolveWebPushConfig } from './config';
import { buildEventPayload } from './messages';
import { deliverToUsers, type DeliverOptions, type DeliveryResult } from './sender';

/**
 * Turns a product update (see `emitActivityEvent` in the ORM package) into a browser push to the
 * project's members. A person is not told about their own action, an Ad Studio run the Growth Pilot
 * started is left to the pilot's own update (so one change is one notification), and nothing at
 * all is looked up when push is not set up.
 */
export async function notifyActivityEvent(event: ActivityEvent, options: DeliverOptions = {}): Promise<DeliveryResult | null> {
  const category = pushCategoryForEvent(event.source, event.kind);
  if (!category) return null;
  const config = options.config === undefined ? resolveWebPushConfig() : options.config;
  if (!config) return null;

  if (event.source === 'ad_studio' && event.briefId && (await isGrowthPilotBrief(event.organizationId, event.projectId, event.briefId))) return null;

  const recipients = (await listProjectNotificationRecipients(event.organizationId, event.projectId)).filter((userId) => userId !== event.actor);
  if (recipients.length === 0) return null;

  const [project, briefName] = await Promise.all([
    ProjectModel.init(event.projectId, { organization_id: event.organizationId }).catch(() => null),
    event.source === 'ad_studio' && event.briefId
      ? getAdStudioBrief(event.organizationId, event.projectId, event.briefId).then((brief) => brief.name, () => null)
      : Promise.resolve(null),
  ]);

  const wording = {
    source: event.source,
    kind: event.kind,
    organizationId: event.organizationId,
    projectId: event.projectId,
    projectName: project?.name ?? '',
    subject: event.subject ?? briefName ?? null,
    count: event.count ?? null,
    briefId: event.briefId ?? null,
  };
  return deliverToUsers({ userIds: recipients, category, payloadFor: (locale) => buildEventPayload(locale, wording) }, { ...options, config });
}

const LISTENER_NAME = 'web-push';

/** Hooks the push sender onto product updates in this server process (idempotent). */
export function registerPushNotifier(): void {
  setActivityEventListener(LISTENER_NAME, async (event) => {
    await notifyActivityEvent(event);
  });
}
