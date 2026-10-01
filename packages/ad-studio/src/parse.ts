import type { AdStudioBriefInput, AdStudioFormat, AdStudioImageConcept, AdStudioImageFormat, AdStudioScene } from '@growthos/shared';

/**
 * Shapes request bodies into service inputs without deciding what is valid - the services own the
 * rules (lengths, URL, 3-10 second scenes, 60 seconds total) and return every broken one. Anything of
 * the wrong type becomes a value the service will reject, never a silent default.
 */

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function wholeNumber(value: unknown): number {
  return typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
}

export function parseBriefInput(body: Record<string, unknown>): AdStudioBriefInput {
  const landing = text(body.landingPageUrl).trim();
  return {
    name: text(body.name),
    objective: text(body.objective),
    productDescription: text(body.productDescription),
    landingPageUrl: landing.length > 0 ? landing : null,
    format: text(body.format) as AdStudioFormat,
    language: text(body.language),
    targetSeconds: wholeNumber(body.targetSeconds),
  };
}

export function parseScenes(value: unknown): AdStudioScene[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((raw) => {
    const scene = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const pronunciation = text(scene.pronunciation).trim();
    return {
      id: text(scene.id),
      durationSeconds: wholeNumber(scene.durationSeconds),
      visualPrompt: text(scene.visualPrompt),
      voiceover: text(scene.voiceover),
      ...(pronunciation ? { pronunciation } : {}),
      onScreenText: text(scene.onScreenText),
    };
  });
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/** Image ad ideas from a request body; the brief service checks the rules. */
export function parseImageConcepts(value: unknown): AdStudioImageConcept[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((raw) => {
    const concept = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return {
      id: text(concept.id),
      visualPrompt: text(concept.visualPrompt),
      headline: text(concept.headline),
      formats: stringList(concept.formats) as AdStudioImageFormat[],
    };
  });
}

/** What a person asked the autopilot to do; the run service checks and fills the rest. */
export function parseAutopilotOptions(value: unknown): { plan?: boolean; images?: boolean; imageFormats?: AdStudioImageFormat[]; video?: boolean; environmentId?: string | null; confirmPlan?: boolean } {
  const options = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    ...(typeof options.plan === 'boolean' ? { plan: options.plan } : {}),
    ...(typeof options.images === 'boolean' ? { images: options.images } : {}),
    ...(typeof options.video === 'boolean' ? { video: options.video } : {}),
    ...(typeof options.confirmPlan === 'boolean' ? { confirmPlan: options.confirmPlan } : {}),
    ...(Array.isArray(options.imageFormats) ? { imageFormats: stringList(options.imageFormats) as AdStudioImageFormat[] } : {}),
    ...(typeof options.environmentId === 'string' ? { environmentId: options.environmentId } : {}),
  };
}
