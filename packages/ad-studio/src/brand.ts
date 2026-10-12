import { adStudioBriefInput, getAdStudioBrandKit, type AdStudioBriefModel } from '@growthos/firebase-orm-models';
import { isAdStudioBrandKitEmpty, type AdStudioBriefInput } from '@growthos/shared';

/**
 * What a prompt knows about the ad: the brief, plus the project's brand kit when one is set, so
 * every script, copy, idea, search ad and image follows the brand's name, tone, banned words and colours.
 */
export async function briefPromptInput(brief: AdStudioBriefModel): Promise<AdStudioBriefInput> {
  const kit = await getAdStudioBrandKit(brief.organization_id, brief.project_id);
  const brand = { brandName: kit.brandName, toneOfVoice: kit.toneOfVoice, avoidWords: kit.avoidWords, colors: kit.colors };
  return { ...adStudioBriefInput(brief), brand: isAdStudioBrandKitEmpty(brand) ? null : brand };
}
