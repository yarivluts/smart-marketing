import type { AdStudioBriefInput, AdStudioFormat, AdStudioScene } from '@growthos/shared';

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
    return {
      id: text(scene.id),
      durationSeconds: wholeNumber(scene.durationSeconds),
      visualPrompt: text(scene.visualPrompt),
      voiceover: text(scene.voiceover),
      onScreenText: text(scene.onScreenText),
    };
  });
}
