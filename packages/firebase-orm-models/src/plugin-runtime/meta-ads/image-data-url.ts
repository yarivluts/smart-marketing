/** A `MetaCampaignDraftAdSet.ad.creative.imageDataUrl` reached this parser malformed — should never happen given `validateMetaCampaignDraft` already checked the same shape, but this is defense in depth, same posture every other executor re-check in this codebase takes (see e.g. `MetaAdsWrongPlatformCampaignDraftError`'s own doc comment). */
export class InvalidImageDataUrlError extends Error {
  constructor() {
    super('imageDataUrl must be a data:image/(png|jpeg);base64,... URL.');
    this.name = 'InvalidImageDataUrlError';
  }
}

const IMAGE_DATA_URL_PATTERN = /^data:image\/(?:png|jpe?g);base64,([A-Za-z0-9+/]+=*)$/;

/** Extracts the raw base64 payload (no `data:image/...;base64,` prefix) from a validated image data URL — the shape `MetaAdsApiClient.uploadAdImage`'s `bytes` form field needs. */
export function parseImageDataUrlBase64(dataUrl: string): string {
  const match = IMAGE_DATA_URL_PATTERN.exec(dataUrl);
  if (!match) {
    throw new InvalidImageDataUrlError();
  }
  return match[1];
}
