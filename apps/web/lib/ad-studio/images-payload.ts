import 'server-only';
import type { AdStudioImageConcept } from '@growthos/shared';
import { getAdStudioBrief } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { listBriefImages, type AdStudioImageView } from './engine';

/** What every image route answers with: the brief's image ideas and every image version, so the page redraws from one source. */
export async function briefImagesPayload(organizationId: string, projectId: string, briefId: string): Promise<{ concepts: AdStudioImageConcept[]; images: AdStudioImageView[] }> {
  await ensureFirestoreOrm();
  const [brief, images] = await Promise.all([getAdStudioBrief(organizationId, projectId, briefId), listBriefImages({ organizationId, projectId, briefId })]);
  return { concepts: brief.image_concepts ?? [], images };
}
