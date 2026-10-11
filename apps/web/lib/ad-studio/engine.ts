import 'server-only';
import { configureAdStudioRuntime } from '@growthos/ad-studio';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';

/**
 * The web app's handle on the shared Ad Studio engine (`@growthos/ad-studio`): the same pipeline the
 * API's MCP tools run. The web app connects the ORM lazily per request, so it tells the engine how.
 */
configureAdStudioRuntime({ ensureOrm: ensureFirestoreOrm });

export * from '@growthos/ad-studio';
