/**
 * Reference images for video scenes (KAN-243): real app screenshots and AI illustrations that a scene hands to the video model with its prompt, so the ad shows the real
 * product instead of an interface the model invents. Gemini Omni takes PNG or JPEG images next to
 * the text prompt and uses each the way the prompt says. Pure, shared by the engine, the routes,
 * the editor and the tests.
 *
 * Measured with Omni (2026-10-01): a screen reference is reproduced faithfully in layout, colours,
 * headings and numbers, but small text garbles when the camera moves in close - so a screen prompt
 * keeps the whole screen in view.
 */

/**
 * Where a reference image came from. Capturing a page by URL was tried and dropped: the PageSpeed
 * API returns only thumbnails (500x348), which the video model turns into garbled screens, and real
 * app screens sit behind a login anyway - a screenshot is uploaded instead (by a person or an agent).
 */
export const AD_STUDIO_REFERENCE_SOURCES = ['upload', 'illustration'] as const;
export type AdStudioReferenceSource = (typeof AD_STUDIO_REFERENCE_SOURCES)[number];

/**
 * How a scene uses an image: `screen` - it is the product's real screen, shown on any device in the
 * shot; `subject` - a product, person, logo or object to show as it looks; `first_frame` - the
 * shot starts on exactly this image.
 */
export const AD_STUDIO_REFERENCE_USES = ['screen', 'subject', 'first_frame'] as const;
export type AdStudioReferenceUse = (typeof AD_STUDIO_REFERENCE_USES)[number];

/** Gemini Omni reads PNG and JPEG. */
export const AD_STUDIO_REFERENCE_MIME_TYPES = ['image/png', 'image/jpeg'] as const;
export type AdStudioReferenceMimeType = (typeof AD_STUDIO_REFERENCE_MIME_TYPES)[number];

/** Images per scene: each is sent inline with the render, so the request stays small. */
export const AD_STUDIO_MAX_SCENE_REFERENCES = 3;
/**
 * Per image; a sharp screenshot is ~1-3 MB. Images go inline in the render request, and three at
 * this size stay under the ~20 MB inline request limit once base64-encoded.
 */
export const AD_STUDIO_MAX_REFERENCE_BYTES = 4 * 1024 * 1024;
/** Images in one ad's library. */
export const AD_STUDIO_MAX_REFERENCES = 30;
export const AD_STUDIO_REFERENCE_LABEL_MAX = 80;
export const AD_STUDIO_REFERENCE_DESCRIPTION_MAX = 300;

/** An image attached to a scene. */
export interface AdStudioSceneReference {
  imageId: string;
  use: AdStudioReferenceUse;
}

export function isAdStudioReferenceUse(value: unknown): value is AdStudioReferenceUse {
  return typeof value === 'string' && (AD_STUDIO_REFERENCE_USES as readonly string[]).includes(value);
}

export function isAdStudioReferenceMimeType(value: unknown): value is AdStudioReferenceMimeType {
  return typeof value === 'string' && (AD_STUDIO_REFERENCE_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * The image type from its first bytes (PNG or JPEG), or null for anything else - an upload's
 * declared type is not trusted.
 */
export function sniffReferenceMimeType(bytes: Uint8Array): AdStudioReferenceMimeType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return null;
}

/** `unknown_reference` - the image is not a ready image of the ad's library - is checked where the library is. */
export type AdStudioReferenceIssueCode = 'too_many_references' | 'duplicate_reference' | 'invalid_reference_use' | 'two_first_frames' | 'unknown_reference';

/** The rules one scene's references break (the image ids are checked against the library by the caller). */
export function sceneReferenceIssues(references: readonly AdStudioSceneReference[] | undefined): AdStudioReferenceIssueCode[] {
  const list = references ?? [];
  const issues: AdStudioReferenceIssueCode[] = [];
  if (list.length > AD_STUDIO_MAX_SCENE_REFERENCES) issues.push('too_many_references');
  if (new Set(list.map((reference) => reference.imageId)).size !== list.length) issues.push('duplicate_reference');
  if (list.some((reference) => !isAdStudioReferenceUse(reference.use) || !reference.imageId)) issues.push('invalid_reference_use');
  if (list.filter((reference) => reference.use === 'first_frame').length > 1) issues.push('two_first_frames');
  return issues;
}

/** What the prompt needs about an attached image, in the order the images are sent. */
export interface AdStudioPromptReference {
  use: AdStudioReferenceUse;
  /** What the image shows, in the person's words; may be empty. */
  description: string;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * The prompt lines that tell the video model how to use each attached image. With a screen attached,
 * a closing line makes the attached screens the only ones allowed: on prod (2026-10-01) a scene whose
 * description also asked for "a mobile chat application" got the attached signing screen right and
 * an invented chat screen full of garbled Hebrew for the rest.
 */
export function referencePromptLines(references: readonly AdStudioPromptReference[]): string[] {
  const screens = references.flatMap((reference, index) => (reference.use === 'screen' ? [index + 1] : []));
  const lines = references.map((reference, index) => {
    const name = `Attached image ${index + 1}`;
    const about = oneLine(reference.description);
    switch (reference.use) {
      case 'screen':
        return `${name} is the real screen of the product${about ? ` (${about})` : ''}. Whenever a phone, tablet or computer screen is visible, it shows exactly this image, unchanged: the same layout, colours, words and numbers. Do not invent, redraw or animate any other interface. Keep the whole screen in view; do not move the camera so close that its small text fills the frame.`;
      case 'first_frame':
        return `${name} is the opening frame: start the shot exactly on this image and move naturally from it. Keep anything written in it unchanged.`;
      case 'subject':
      default:
        return `${name} shows ${about || 'a subject of this ad'}: whenever it appears, show it exactly as it looks in the image.`;
    }
  });
  if (screens.length === 0) return lines;
  const which = screens.length === 1 ? `attached image ${screens[0]}` : `attached images ${screens.join(' and ')}`;
  return [
    ...lines,
    `Every screen in this shot shows only ${which}. Where the description above mentions another app, chat, page or screen, show ${which} on the screen instead; never draw a different interface.`,
  ];
}

/** True when an attached image carries words the frame may show (a screen or an opening frame). */
export function referencesShowText(references: readonly Pick<AdStudioPromptReference, 'use'>[]): boolean {
  return references.some((reference) => reference.use === 'screen' || reference.use === 'first_frame');
}
